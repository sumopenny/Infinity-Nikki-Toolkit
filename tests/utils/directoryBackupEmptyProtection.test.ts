import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDb, OUTFITS_STORE } from '../../src/utils/file-system/database'
import { runDatabaseTransaction } from '../../src/utils/file-system/transaction'
import { saveOutfit, deleteOutfit } from '../../src/utils/outfit/outfitStorage'
import { saveHomeScheme, deleteHomeScheme } from '../../src/utils/homeBuild/homeSchemeStorage'
import {
  saveCameraFavorite,
  deleteCameraFavorites,
  clearCameraFavorites
} from '../../src/utils/photo-params/favorites'
import { estimateBackupDiff } from '../../src/utils/directory-backup/diff'
import { readModuleStatus, setModuleEnabled } from '../../src/utils/directory-backup/engine'
import { updateConfig } from '../../src/utils/directory-backup/repository'
import { dirtyChanges } from '../../src/utils/directory-backup/repository'
import {
  MemoryDirectory,
  moduleDir,
  putOutfit,
  reloadConfig,
  resetDatabase,
  setup,
  sync
} from '../helpers/directoryBackupFs'
import { keyHash, readJson, recordPath, type Entry } from '../../src/utils/directory-backup/disk'

beforeEach(resetDatabase)

async function silentlyEmptyOutfits() {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTFITS_STORE, 'readwrite')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
    tx.objectStore(OUTFITS_STORE).clear()
  })
}

describe('异常归零保护', () => {
  it('只刷新状态就识别外部异常清空，立即标记保护且不写盘', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('SAFE_REFRESH')
    expect((await sync(config)).state).toBe('synced')
    expect((await readModuleStatus(config, 'outfits')).state).toBe('synced')
    await silentlyEmptyOutfits()
    disk.events = []
    const state = await readModuleStatus(config, 'outfits')
    expect(state.state).toBe('protected')
    expect(state.error).toContain('数据异常归零')
    expect(disk.events.filter((event) => ['write', 'delete'].includes(event.kind))).toEqual([])
    const dir = await moduleDir(directory)
    expect(await readJson<Entry>(dir, recordPath(await keyHash('SAFE_REFRESH')))).toMatchObject({
      id: 'SAFE_REFRESH'
    })
  })

  it('用户确认删除最后一条记录，状态刷新不会误报异常清空', async () => {
    const { config } = await setup()
    const item = await saveOutfit({ code: 'SAFE_DELETE', tag: null })
    await sync(config)
    await deleteOutfit(item, true)
    const state = await readModuleStatus(config, 'outfits')
    expect(state.state).toBe('waiting')
    expect(state.error).toBeUndefined()
    expect((await sync(config)).state).toBe('synced')
  })

  it('无异常时状态检查不读取磁盘文件', async () => {
    const { config, disk } = await setup()
    await putOutfit('SAFE_NORMAL')
    await sync(config)
    disk.events = []
    const state = await readModuleStatus(config, 'outfits')
    expect(state.state).toBe('synced')
    expect(disk.events).toEqual([])
  })

  it('浏览器单独丢失整个记录表时停止该模块写盘，保留原备份', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('SAFE01')
    await putOutfit('SAFE02')
    expect((await sync(config)).count).toBe(2)
    await silentlyEmptyOutfits()
    disk.events = []
    const status = await sync(config)
    expect(status.state).toBe('protected')
    expect(status.error).toContain('数据异常归零')
    expect(disk.events.filter((e) => e.kind === 'write' || e.kind === 'delete')).toEqual([])
    disk.events = []
    const retry = await sync(config)
    expect(retry.state).toBe('protected')
    expect(disk.events.filter((e) => ['read', 'write', 'delete'].includes(e.kind))).toEqual([])
    const dir = await moduleDir(directory)
    expect(await readJson<Entry>(dir, recordPath(await keyHash('SAFE01')))).toMatchObject({
      id: 'SAFE01'
    })
  })

  it('没有用户确认凭证的 clear 事务也不能把电脑副本清空', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('UNTRUSTED')
    await sync(config)
    await runDatabaseTransaction([OUTFITS_STORE], 'readwrite', async (tx) => {
      tx.objectStore(OUTFITS_STORE).clear()
    })
    expect((await dirtyChanges('outfits')).some((x) => x.key[1] === 'reset' && !x.intent)).toBe(
      true
    )
    disk.events = []
    expect((await sync(config)).state).toBe('protected')
    expect(disk.events.filter((e) => e.kind === 'write' || e.kind === 'delete')).toEqual([])
    expect(
      await readJson<Entry>(await moduleDir(directory), recordPath(await keyHash('UNTRUSTED')))
    ).toMatchObject({ id: 'UNTRUSTED' })
  })

  it('不相关的确认删除不能替意外丢失的其他记录背书', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('LOST01')
    await sync(config)
    await silentlyEmptyOutfits()
    const other = await saveOutfit({ code: 'UNRELATED', tag: null })
    await deleteOutfit(other, true)
    disk.events = []
    const status = await sync(config)
    expect(status.state).toBe('protected')
    expect(disk.events.filter((e) => e.kind === 'write' || e.kind === 'delete')).toEqual([])
    expect(
      await readJson<Entry>(await moduleDir(directory), recordPath(await keyHash('LOST01')))
    ).toMatchObject({ id: 'LOST01' })
  })

  it('用户在确认框确认后删除最后一条搭配，允许同步清空', async () => {
    const { config } = await setup()
    const item = await saveOutfit({ code: 'CONFIRMED01', tag: null })
    expect((await sync(config)).count).toBe(1)
    await deleteOutfit(item, true)
    expect(
      (await dirtyChanges('outfits')).some(
        (x) => x.key[1] === 'record' && x.intent === 'confirmed-delete'
      )
    ).toBe(true)
    const status = await sync(config)
    expect(status.state).toBe('synced')
    expect(status.count).toBe(0)
  })

  it('关闭模块期间清空后，重新启用需完成明确空库覆盖确认才可同步', async () => {
    const { config, directory } = await setup()
    await putOutfit('OFFLINE01')
    await sync(config)
    await setModuleEnabled('outfits', false)
    await silentlyEmptyOutfits()
    const current = await reloadConfig(directory)
    const diff = await estimateBackupDiff(current, 'outfits')
    expect(diff).toMatchObject({ browserCount: 0, backupCount: 1, removed: 1 })
    await setModuleEnabled('outfits', true)
    // 模拟用户在预览里完成两次清空确认；真正的 UI 通过 confirmEnable 写入同一凭证。
    await updateConfig((config) => {
      config.emptyApprovals = { outfits: { backupId: config.backupId!, revision: diff.revision } }
    })
    const status = await sync(await reloadConfig(directory))
    expect(status.state).toBe('synced')
    expect(status.count).toBe(0)
  })
})

const emptyMetadata = {
  version: null,
  furnitureCount: null,
  server: null,
  lastModifyTime: null,
  coverImageUrl: null
}
function camera(id: string) {
  return {
    id,
    version: 1 as const,
    name: id,
    tag: '',
    code: id,
    source: 'manual' as const,
    cover: null,
    createdAt: '2026-11-03T12:00:00.000Z',
    updatedAt: '2026-11-03T12:00:00.000Z',
    result: {
      rawCameraParams: id,
      environmentFields: [],
      cameraFields: [],
      imageFields: [],
      resourceGroups: []
    }
  }
}

describe('用户确认删除与跨模块隔离', () => {
  it('家园用户确认删除最后一个方案可同步归零', async () => {
    const { config } = await setup(new MemoryDirectory(), ['home'])
    const scheme = await saveHomeScheme({
      code: 'HOME123',
      name: '小屋',
      schemeType: 'home',
      tags: [],
      note: '',
      metadata: emptyMetadata
    })
    expect((await sync(config, 'home')).count).toBe(1)
    await deleteHomeScheme(scheme, true)
    const status = await sync(config, 'home')
    expect(status.state).toBe('synced')
    expect(status.count).toBe(0)
  })

  it('相机确认批量删除可以归零，未确认的清空则拦截', async () => {
    const { config } = await setup(new MemoryDirectory(), ['camera'])
    await saveCameraFavorite(camera('CAMERA1'), null)
    expect((await sync(config, 'camera')).count).toBe(1)
    await clearCameraFavorites()
    expect((await sync(config, 'camera')).state).toBe('protected')
  })

  it('相机用户确认批量删除与确认清空均可同步', async () => {
    const { config } = await setup(new MemoryDirectory(), ['camera'])
    await saveCameraFavorite(camera('CAMERA2'), null)
    await sync(config, 'camera')
    await deleteCameraFavorites(['CAMERA2'], true)
    expect((await sync(config, 'camera')).count).toBe(0)
    await saveCameraFavorite(camera('CAMERA3'), null)
    expect((await sync(config, 'camera')).count).toBe(1)
    await clearCameraFavorites(true)
    const status = await sync(config, 'camera')
    expect(status.state).toBe('synced')
    expect(status.count).toBe(0)
  })

  it('一个模块意外归零时其他模块仍可继续备份', async () => {
    const { config } = await setup(new MemoryDirectory(), ['outfits', 'home'])
    await putOutfit('PROTECT01')
    await saveHomeScheme({
      code: 'HOME201',
      name: '庭院',
      schemeType: 'home',
      tags: [],
      note: '',
      metadata: emptyMetadata
    })
    expect((await sync(config)).count).toBe(1)
    expect((await sync(config, 'home')).count).toBe(1)
    await silentlyEmptyOutfits()
    expect((await sync(config)).state).toBe('protected')
    await saveHomeScheme({
      code: 'HOME202',
      name: '院子',
      schemeType: 'home',
      tags: [],
      note: '',
      metadata: emptyMetadata
    })
    const homeStatus = await sync(config, 'home')
    expect(homeStatus.state).toBe('synced')
    expect(homeStatus.count).toBe(2)
  })
})
