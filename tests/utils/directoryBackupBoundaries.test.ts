import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DB_NAME,
  DB_VERSION,
  BACKUP_DIRTY_STORE,
  OUTFITS_STORE,
  CAMERA_FAVORITES_STORE,
  openDb,
  runStoreRequest
} from '../../src/utils/file-system/database'
import { saveOutfit } from '../../src/utils/outfit/outfitStorage'
import { exportOutfitBackup, importOutfitBackup } from '../../src/utils/outfit/outfitBackup'
import { saveHomeScheme } from '../../src/utils/homeBuild/homeSchemeStorage'
import {
  exportHomeSchemeBackup,
  importHomeSchemeBackup
} from '../../src/utils/homeBuild/homeSchemeBackup'
import {
  saveCameraFavorite,
  readCameraFavorites,
  applyCameraImport,
  planCameraImport
} from '../../src/utils/photo-params/favorites'
import { exportCameraBackup, readCameraBackup } from '../../src/utils/photo-params/favoritesBackup'
import { dirtyChanges, loadConfig } from '../../src/utils/directory-backup/repository'
import { previewRestore, restoreSelected } from '../../src/utils/directory-backup/restore'
import { bindDirectory } from '../../src/utils/directory-backup/engine'
import {
  setup,
  resetDatabase,
  sync,
  putOutfit,
  outfit,
  asHandle,
  MemoryDirectory,
  reloadConfig,
  date
} from '../helpers/directoryBackupFs'

const camera = (id: string, name = id) => ({
  id,
  version: 1 as const,
  name,
  tag: '',
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
beforeEach(resetDatabase)

describe('原有入口、升级和跨目录边界', () => {
  it('版本9升级到10保留原记录，并创建备份表', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 9)
      request.onupgradeneeded = () =>
        request.result.createObjectStore(OUTFITS_STORE, { keyPath: 'id' }).put(outfit('LEGACY'))
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })
    const db = await openDb()
    expect(db.version).toBe(DB_VERSION)
    expect(db.objectStoreNames.contains(BACKUP_DIRTY_STORE)).toBe(true)
    db.close()
    expect(
      await runStoreRequest(OUTFITS_STORE, 'readonly', (store) => store.get('LEGACY'))
    ).toMatchObject({ id: 'LEGACY' })
  })

  it('三个原有 ZIP 导入入口提交后均产生对应队列，备份保留全部业务字段', async () => {
    await saveOutfit({ code: 'ZIP-OUTFIT', tag: '甜美', note: '搭配' })
    await saveHomeScheme({
      code: 'ZIP-HOME',
      name: '测试庭院',
      schemeType: 'home',
      tags: [],
      note: '家园',
      metadata: {
        version: 'v1',
        furnitureCount: 12,
        server: 1,
        lastModifyTime: 123,
        coverImageUrl: null
      }
    })
    await saveCameraFavorite(camera('ZIP-CAMERA'), null)
    let outfitZip!: File, homeZip!: File, cameraZip!: Blob
    await exportOutfitBackup(async (name, blob) => {
      outfitZip = new File([blob], name)
    })
    await exportHomeSchemeBackup(async (name, blob) => {
      homeZip = new File([blob], name)
    })
    for await (const part of exportCameraBackup(await readCameraFavorites())) cameraZip = part.blob
    await resetDatabase()
    const { config, directory } = await setup(new MemoryDirectory(), ['outfits', 'home', 'camera'])
    await importOutfitBackup(outfitZip)
    await importHomeSchemeBackup(homeZip)
    await applyCameraImport(
      planCameraImport(await readCameraFavorites(), await readCameraBackup(cameraZip)),
      {}
    )
    for (const module of ['outfits', 'home', 'camera'] as const) {
      expect((await dirtyChanges(module)).some((change) => change.key[1] === 'record')).toBe(true)
      expect((await sync(config, module)).count).toBe(1)
    }
    expect(
      (await previewRestore(asHandle(directory))).modules.every((module) => module.ready)
    ).toBe(true)
  })

  it('从B恢复后旧搭配任务不能写A或B，其他模块继续写A', async () => {
    const source = await setup(new MemoryDirectory())
    await putOutfit('FROM-B', '来源B')
    await sync(source.config)
    await resetDatabase()
    const target = await setup(new MemoryDirectory(), ['outfits', 'camera'])
    await putOutfit('FROM-A', '来源A')
    await saveCameraFavorite(camera('CAM-A'), null)
    await sync(target.config)
    await sync(target.config, 'camera')
    await putOutfit('FROM-A', '旧队列')
    const preview = await previewRestore(asHandle(source.directory))
    await restoreSelected(asHandle(source.directory), preview, ['outfits'], () => {})
    const latest = await reloadConfig(target.directory)
    expect(latest.binding).toBe(target.config.binding)
    expect(latest.enabled).toMatchObject({ outfits: false, camera: true })
    source.disk.events = []
    target.disk.events = []
    await sync(target.config)
    expect(target.disk.events.filter((e) => ['write', 'delete'].includes(e.kind))).toEqual([])
    await saveCameraFavorite(camera('CAM-A2'), null)
    expect((await sync(latest, 'camera')).count).toBe(2)
    expect(source.disk.events.filter((e) => ['write', 'delete'].includes(e.kind))).toEqual([])
    expect(await runStoreRequest(OUTFITS_STORE, 'readonly', (s) => s.getAllKeys())).toEqual([
      'FROM-B'
    ])
  })

  it('权限失败不阻止浏览器保存；恢复权限后补齐待备份数据', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('PERMISSION-1')
    await sync(config)
    disk.granted = false
    await putOutfit('PERMISSION-2')
    expect((await sync(config)).state).not.toBe('synced')
    expect(await runStoreRequest(OUTFITS_STORE, 'readonly', (s) => s.count())).toBe(2)
    expect((await dirtyChanges('outfits')).length).toBeGreaterThan(0)
    disk.granted = true
    expect((await sync(await reloadConfig(directory))).count).toBe(2)
  })

  it('清空浏览器身份后选择旧目录拒绝绑定，目录完全不写入', async () => {
    const { config, directory, disk } = await setup()
    await putOutfit('IDENTITY')
    await sync(config)
    await resetDatabase()
    disk.events = []
    await expect(bindDirectory(asHandle(directory))).rejects.toThrow('已有存档')
    expect(disk.events.filter((e) => ['write', 'delete'].includes(e.kind))).toEqual([])
    expect((await loadConfig()).enabled.outfits).toBe(false)
  })

  it('后续模块恢复失败时通知已经成功的模块，未成功模块保留原数据', async () => {
    const { config, directory, disk } = await setup(new MemoryDirectory(), ['outfits', 'camera'])
    await putOutfit('RESTORE-ONE')
    await saveCameraFavorite(camera('CAM-PART'), null)
    await sync(config)
    await sync(config, 'camera')
    await saveCameraFavorite(camera('CAM-PART', '保留本地'), null, camera('CAM-PART'))
    const preview = await previewRestore(asHandle(directory)),
      committed: string[] = []
    const cameraPath = [...disk.files.keys()].find((p) => p.includes('/拍照参数收藏/当前记录/'))!
    await expect(
      restoreSelected(
        asHandle(directory),
        preview,
        ['outfits', 'camera'],
        () => {},
        (module) => {
          committed.push(module)
          disk.files.delete(cameraPath)
        }
      )
    ).rejects.toThrow()
    expect(committed).toEqual(['outfits'])
    expect((await loadConfig()).enabled.outfits).toBe(false)
    expect((await loadConfig()).enabled.camera).toBe(true)
    expect(
      await runStoreRequest(CAMERA_FAVORITES_STORE, 'readonly', (s) => s.get('CAM-PART'))
    ).toMatchObject({ name: '保留本地' })
  })
})
