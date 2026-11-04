import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKUP_RESTORE_STORE,
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  CAMERA_FAVORITES_STORE,
  runStoreRequest,
  clearAllBrowserData
} from '../../src/utils/file-system/database'
import { databaseRequest, runDatabaseTransaction } from '../../src/utils/file-system/transaction'
import { saveOutfit, deleteOutfitTag } from '../../src/utils/outfit/outfitStorage'
import {
  saveCameraFavorite,
  deleteCameraFavoriteTag,
  clearCameraFavorites
} from '../../src/utils/photo-params/favorites'
import { withExclusiveBusiness } from '../../src/utils/directory-backup/coordination'
import {
  loadConfig,
  readModuleStatus,
  pauseBackupsForBrowserReset,
  setModuleEnabled
} from '../../src/utils/directory-backup/engine'
import {
  readRevision,
  dirtyChanges,
  saveConfig,
  scanProgress
} from '../../src/utils/directory-backup/repository'
import {
  digest,
  jsonBytes,
  readJson,
  readBytes,
  recordPath,
  keyHash,
  discoverStages,
  type Entry
} from '../../src/utils/directory-backup/disk'
import {
  previewRestore,
  restoreSelected,
  resumeSource
} from '../../src/utils/directory-backup/restore'
import { estimateBackupDiff } from '../../src/utils/directory-backup/diff'
import {
  setup,
  resetDatabase,
  sync,
  putOutfit,
  png,
  outfit,
  moduleDir,
  asHandle,
  MemoryDirectory,
  reloadConfig,
  date
} from '../helpers/directoryBackupFs'

const records = () => runStoreRequest<any[]>(OUTFITS_STORE, 'readonly', (s) => s.getAll())
const camera = (id: string, tag = '') => ({
  id,
  version: 1 as const,
  name: id,
  tag,
  code: id,
  source: 'manual' as const,
  cover: null,
  createdAt: date,
  updatedAt: date,
  result: {
    rawCameraParams: id,
    environmentFields: [],
    cameraFields: [],
    imageFields: [],
    resourceGroups: []
  }
})
async function replaceNote(id: string, note: string) {
  await runDatabaseTransaction([OUTFITS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(OUTFITS_STORE)
    const current = await databaseRequest(store.get(id))
    store.put({ ...current, note })
  })
}
async function remove(id: string) {
  await runDatabaseTransaction([OUTFITS_STORE, OUTFIT_IMAGES_STORE], 'readwrite', async (tx) => {
    tx.objectStore(OUTFITS_STORE).delete(id)
    tx.objectStore(OUTFIT_IMAGES_STORE).delete(id)
  })
}

beforeEach(resetDatabase)
describe('事务与增量读写边界', () => {
  it('默认关闭时编辑不产生待备份队列；业务失败同时回滚修订和队列', async () => {
    const { config } = await setup(new MemoryDirectory(), [])
    await putOutfit('OFF01')
    expect((await dirtyChanges('outfits')).length).toBe(0)
    const baseline = await readRevision('outfits')
    config.enabled.outfits = true
    await saveConfig(config)
    await expect(
      runDatabaseTransaction([OUTFITS_STORE], 'readwrite', async (tx) => {
        tx.objectStore(OUTFITS_STORE).put(outfit('ABORT01'))
        throw new Error('abort business')
      })
    ).rejects.toThrow('abort business')
    expect((await records()).map((x) => x.id)).toEqual(['OFF01'])
    expect(await readRevision('outfits')).toBe(baseline)
    expect(await dirtyChanges('outfits')).toEqual([])
  })
  it('改备注只更新本条 JSON 和小型索引：不读写图片，不扫描全库或业务目录', async () => {
    const { config, disk, directory } = await setup()
    await putOutfit('IMG01', '', png())
    await putOutfit('IMG02', '', png())
    expect((await sync(config)).state).toBe('synced')
    disk.events = []
    const get = vi.spyOn(IDBObjectStore.prototype, 'get')
    const all = vi.spyOn(IDBObjectStore.prototype, 'getAll')
    const keys = vi.spyOn(IDBObjectStore.prototype, 'getAllKeys')
    await replaceNote('IMG01', 'renamed')
    expect((await sync(config)).state).toBe('synced')
    expect(
      get.mock.instances.filter(
        (store) => (store as unknown as IDBObjectStore).name === OUTFIT_IMAGES_STORE
      )
    ).toHaveLength(0)
    expect(
      all.mock.instances.filter(
        (store) => (store as unknown as IDBObjectStore).name === OUTFITS_STORE
      )
    ).toHaveLength(0)
    expect(
      keys.mock.instances.filter(
        (store) => (store as unknown as IDBObjectStore).name === OUTFITS_STORE
      )
    ).toHaveLength(0)
    get.mockRestore()
    all.mockRestore()
    keys.mockRestore()
    expect(disk.events.filter((x) => x.path.includes('/图片/'))).toEqual([])
    expect(
      disk.events.filter((x) => x.kind === 'enumerate').every((x) => x.path.endsWith('/.写入中'))
    ).toBe(true)
    expect(
      disk.events.filter((x) => x.kind === 'written' && x.path.includes('/当前记录/'))
    ).toHaveLength(1)
    const dir = await moduleDir(directory)
    expect((await readJson<Entry>(dir, recordPath(await keyHash('IMG01'))))?.value).toMatchObject({
      note: 'renamed'
    })
  })
  it('换图与删除仅影响本条；两条使用相同图片时互不删除', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('IMG01', '', png())
    await putOutfit('IMG02', '', png())
    await sync(config)
    const dir = await moduleDir(directory)
    const old = await readJson<Entry>(dir, recordPath(await keyHash('IMG01')))
    const other = await readJson<Entry>(dir, recordPath(await keyHash('IMG02')))
    const changed = new Blob([await png().arrayBuffer(), new Uint8Array([0])], {
      type: 'image/png'
    })
    await putOutfit('IMG01', '', changed)
    expect((await sync(config)).state).toBe('synced')
    expect(await readBytes(dir, old!.image!.path)).toBeNull()
    expect(await readBytes(dir, other!.image!.path)).not.toBeNull()
    disk.events = []
    await remove('IMG01')
    await sync(config)
    expect(await readBytes(dir, other!.image!.path)).not.toBeNull()
    expect(
      disk.events.some((x) => x.kind === 'delete' && x.path.endsWith(other!.image!.path))
    ).toBe(false)
  })
  it('标签级联与相机 cursor.update 都触发事务日志，清空仅清相应模块', async () => {
    const { config } = await setup(new MemoryDirectory(), ['outfits', 'camera'])
    const saved = await saveOutfit({ code: 'TAG01', tag: '甜美', note: '' })
    await saveCameraFavorite(camera('CAM01', '测试'), null)
    await sync(config)
    await sync(config, 'camera')
    await deleteOutfitTag('甜美')
    await deleteCameraFavoriteTag('测试')
    expect(
      (await dirtyChanges('outfits')).some((x) => x.key[1] === 'record' && x.key[2] === saved.id)
    ).toBe(true)
    expect((await dirtyChanges('camera')).some((x) => x.key[1] === 'record')).toBe(true)
    await sync(config)
    await sync(config, 'camera')
    await clearCameraFavorites()
    expect((await sync(config, 'camera')).count).toBe(0)
    expect((await sync(config)).count).toBe(1)
  })
})

describe('磁盘故障、中断续写与并发版本', () => {
  it.each(['payload', 'ready', 'record', 'module', 'cleanup'] as const)(
    '%s 阶段失败后重试幂等，不漏更新',
    async (point) => {
      const { config, directory, disk } = await setup()
      await putOutfit('REC01')
      await sync(config)
      await replaceNote('REC01', 'updated')
      disk.failOnce((e) =>
        point === 'payload'
          ? e.kind === 'written' && /payload-0$/.test(e.path)
          : point === 'ready'
            ? e.kind === 'written' && e.path.endsWith('/ready.json')
            : point === 'record'
              ? e.kind === 'written' && e.path.includes('/当前记录/')
              : point === 'module'
                ? e.kind === 'written' && e.path.endsWith('/模块信息.json')
                : e.kind === 'delete' && /\/\.写入中\/[a-f0-9-]+$/.test(e.path)
      )
      expect((await sync(config)).state).toBe('error')
      expect((await sync(config)).state).toBe('synced')
      const dir = await moduleDir(directory)
      expect((await readJson<Entry>(dir, recordPath(await keyHash('REC01'))))?.value).toMatchObject(
        { note: 'updated' }
      )
      expect(await discoverStages(dir)).toEqual([])
      expect(await dirtyChanges('outfits')).toEqual([])
      expect((await previewRestore(asHandle(directory))).modules[0].ready).toBe(true)
    }
  )
  it('完成准备后清空整个浏览器数据库，仍可只靠磁盘续写并恢复', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01')
    await sync(config)
    await replaceNote('REC01', 'newest')
    disk.failOnce((e) => e.kind === 'written' && e.path.endsWith('/ready.json'))
    expect((await sync(config)).state).toBe('error')
    await resetDatabase()
    disk.events = []
    const initial = await previewRestore(asHandle(directory))
    expect(initial.modules[0].canResume).toBe(true)
    expect(
      disk.events.filter((e) => ['write', 'written', 'delete', 'deleted'].includes(e.kind))
    ).toEqual([])
    await resumeSource(asHandle(directory), 'outfits')
    const preview = await previewRestore(asHandle(directory))
    expect(preview.modules[0].ready).toBe(true)
    await restoreSelected(asHandle(directory), preview, ['outfits'], () => undefined)
    expect(await records()).toMatchObject([{ note: 'newest' }])
  })
  it('正式写盘时新增编辑，旧批次确认不得清除新修订', async () => {
    const { config, disk, directory } = await setup()
    await putOutfit('REC01')
    await sync(config)
    await replaceNote('REC01', 'first')
    disk.hook = async (event) => {
      if (event.kind === 'written' && event.path.includes('/当前记录/')) {
        disk.hook = undefined
        await replaceNote('REC01', 'second')
      }
    }
    expect((await sync(config)).state).toBe('synced')
    expect(
      (await readJson<Entry>(await moduleDir(directory), recordPath(await keyHash('REC01'))))?.value
    ).toMatchObject({ note: 'second' })
    expect(await dirtyChanges('outfits')).toEqual([])
  })
  it('删除后同 ID 重建不会被旧删除任务误删', async () => {
    const { config, directory } = await setup()
    await putOutfit('REC01')
    await sync(config)
    await remove('REC01')
    await putOutfit('REC01', 'reborn')
    expect((await sync(config)).count).toBe(1)
    expect(
      (await readJson<Entry>(await moduleDir(directory), recordPath(await keyHash('REC01'))))?.value
    ).toMatchObject({ note: 'reborn' })
  })
  it('首次扫描中断有持久进度；扫描期间删除不被复活', async () => {
    const { config, disk, directory } = await setup()
    for (let i = 0; i < 60; i++) await putOutfit(`REC${String(i).padStart(3, '0')}`)
    let writes = 0
    disk.hook = async (e) => {
      if (e.kind === 'written' && e.path.includes('/当前记录/')) {
        writes++
        if (writes === 2) await remove('REC050')
        if (writes === 30) {
          disk.hook = undefined
          throw new Error('interrupted initial')
        }
      }
    }
    const failed = await sync(config)
    expect(failed.state).toBe('error')
    expect(failed.lastSuccess).toBeNull()
    expect((await scanProgress(config, 'outfits'))?.processed).toBeGreaterThan(0)
    expect((await sync(config)).count).toBe(59)
    expect(
      await readBytes(await moduleDir(directory), recordPath(await keyHash('REC050')))
    ).toBeNull()
  })
  it('越界批次即使重算摘要也被只读预览阻止，不对来源目录写入', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01')
    await sync(config)
    await replaceNote('REC01', 'changed')
    disk.failOnce((e) => e.kind === 'written' && e.path.endsWith('/ready.json'))
    await sync(config)
    const manifestPath = [...disk.files.keys()].find(
      (x) => x.includes('/.写入中/') && x.endsWith('/manifest.json')
    )!
    const manifest = JSON.parse(new TextDecoder().decode(disk.files.get(manifestPath)))
    manifest.operations[0].path = '../outside.json'
    const bytes = jsonBytes(manifest)
    disk.files.set(manifestPath, bytes)
    disk.files.set(
      manifestPath.replace('manifest.json', 'ready.json'),
      jsonBytes({ sha256: await digest(bytes.buffer as ArrayBuffer) })
    )
    disk.events = []
    const preview = await previewRestore(asHandle(directory))
    expect(preview.modules[0].ready).toBe(false)
    expect(preview.modules[0].canResume).toBe(false)
    await expect(resumeSource(asHandle(directory), 'outfits')).rejects.toThrow()
    expect(disk.events.filter((x) => ['write', 'delete'].includes(x.kind))).toHaveLength(0)
  })
})

describe('完整性与恢复保护', () => {
  it.each(['record', 'bucket', 'image', 'extra'] as const)(
    '显式校验检出 %s 损坏或多余文件',
    async (kind) => {
      const { config, directory, disk } = await setup()
      await putOutfit('REC01', '', png())
      await sync(config)
      const path = [...disk.files.keys()].find((x) =>
        kind === 'image'
          ? x.includes('/图片/')
          : kind === 'bucket'
            ? x.includes('/索引/record/')
            : x.includes('/当前记录/')
      )!
      if (kind === 'extra')
        disk.files.set(path.replace('.json', '-copy.json'), disk.files.get(path)!)
      else disk.files.delete(path)
      expect((await previewRestore(asHandle(directory))).modules[0].ready).toBe(false)
    }
  )
  it('预览之后编辑任何业务字段，恢复必须重新预览且保留新数据', async () => {
    const { config, directory } = await setup()
    await putOutfit('REC01')
    await sync(config)
    const preview = await previewRestore(asHandle(directory))
    await replaceNote('REC01', 'new edit')
    await expect(
      restoreSelected(asHandle(directory), preview, ['outfits'], () => undefined)
    ).rejects.toThrow('重新预览')
    expect(await records()).toMatchObject([{ note: 'new edit' }])
  })
  it('恢复暂存配额失败时，正式表和绑定均保持原状', async () => {
    const { config, directory } = await setup()
    await putOutfit('REC01')
    await sync(config)
    await replaceNote('REC01', 'keep me')
    const preview = await previewRestore(asHandle(directory))
    const original = IDBObjectStore.prototype.put
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: any[]
    ) {
      if (this.name === BACKUP_RESTORE_STORE) throw new DOMException('full', 'QuotaExceededError')
      return original.apply(this, args as [any, IDBValidKey?])
    })
    await expect(
      restoreSelected(asHandle(directory), preview, ['outfits'], () => undefined)
    ).rejects.toThrow()
    spy.mockRestore()
    expect(await records()).toMatchObject([{ note: 'keep me' }])
    expect((await loadConfig()).enabled.outfits).toBe(true)
  })
  it('最终复制失败时已执行的 clear 也整体回滚', async () => {
    const { config, directory } = await setup()
    await putOutfit('REC01')
    await sync(config)
    await replaceNote('REC01', 'keep me')
    const preview = await previewRestore(asHandle(directory))
    const original = IDBObjectStore.prototype.put
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: any[]
    ) {
      if (this.name === OUTFITS_STORE) throw new DOMException('full', 'QuotaExceededError')
      return original.apply(this, args as [any, IDBValidKey?])
    })
    await expect(
      restoreSelected(asHandle(directory), preview, ['outfits'], () => undefined)
    ).rejects.toThrow()
    spy.mockRestore()
    expect(await records()).toMatchObject([{ note: 'keep me' }])
  })
  it('恢复锁仅阻止所选模块；其他模块仍能编辑', async () => {
    await setup(new MemoryDirectory(), [])
    await withExclusiveBusiness(['outfits'], async () => {
      await expect(putOutfit('LOCKED')).rejects.toThrow('正在从目录恢复')
      await saveCameraFavorite(camera('CAM01'), null)
    })
    expect(await runStoreRequest(CAMERA_FAVORITES_STORE, 'readonly', (s) => s.count())).toBe(1)
  })
  it('恢复后旧队列不覆盖源目录，选中模块暂停且其他开关不变', async () => {
    const { config, directory, disk } = await setup(new MemoryDirectory(), ['outfits', 'camera'])
    await putOutfit('REC01')
    await sync(config)
    await replaceNote('REC01', 'queued')
    const preview = await previewRestore(asHandle(directory))
    await restoreSelected(asHandle(directory), preview, ['outfits'], () => undefined)
    const latest = await loadConfig()
    expect(latest.binding).toBe(config.binding)
    expect(latest.enabled.outfits).toBe(false)
    expect(latest.enabled.camera).toBe(true)
    expect(await dirtyChanges('outfits')).toEqual([])
    disk.events = []
    await sync(config)
    expect(disk.events.filter((x) => ['write', 'delete'].includes(x.kind))).toEqual([])
  })
  it('关闭保留最后成功信息；关闭期间删除后重开比对包含待删除数', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01')
    await sync(config)
    await setModuleEnabled('outfits', false)
    disk.events = []
    await remove('REC01')
    await sync(config)
    expect(disk.events.filter((x) => ['write', 'delete'].includes(x.kind))).toHaveLength(0)
    const fresh = await reloadConfig(directory)
    const status = await readModuleStatus(fresh, 'outfits')
    expect(status.count).toBe(1)
    expect(status.lastSuccess).not.toBeNull()
    expect(status.state).toBe('disabled')
    const diff = await estimateBackupDiff(fresh, 'outfits')
    expect(diff.removed).toBe(1)
    expect(diff.browserCount).toBe(0)
    expect(disk.events.filter((x) => ['write', 'delete'].includes(x.kind))).toHaveLength(0)
  })
  it('清除本站数据保留电脑副本，原来的任务不得以空库清盘', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('REC01')
    await sync(config)
    disk.events = []
    await pauseBackupsForBrowserReset(clearAllBrowserData)
    await sync(config)
    expect(disk.events.filter((x) => ['write', 'delete'].includes(x.kind))).toHaveLength(0)
    const preview = await previewRestore(asHandle(directory))
    expect(preview.modules[0].backupCount).toBe(1)
    expect(preview.modules[0].browserCount).toBe(0)
  })
})
