import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DB_NAME,
  BACKUP_DIRTY_STORE,
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  HOME_SCHEMES_STORE,
  CAMERA_FAVORITES_STORE,
  runStoreRequest
} from '../../src/utils/file-system/database'
import { runDatabaseTransaction } from '../../src/utils/file-system/transaction'
import { saveOutfit, deleteOutfit } from '../../src/utils/outfit/outfitStorage'
import { normalizeOutfitRecord } from '../../src/utils/outfit/outfitTypes'
import {
  syncModule,
  loadConfig,
  saveConfig,
  type BackupConfig,
  type ModuleProgress
} from '../../src/utils/directory-backup/engine'
import { previewRestore, restoreSelected } from '../../src/utils/directory-backup/restore'
import {
  DIRECTORY_NAME,
  MODULE_NAMES,
  readJson,
  type Entry,
  recordPath,
  keyHash,
  readBytes
} from '../../src/utils/directory-backup/disk'
import { sha256Hex } from '../../src/utils/sha256'

class MockFile {
  content = new Uint8Array()
  writes = 0
  constructor(readonly name: string) {}
  async getFile() {
    return new Blob([this.content])
  }
  async createWritable() {
    const node = this
    let data: Uint8Array | null = null
    return {
      async write(value: Blob | ArrayBuffer | Uint8Array) {
        data = new Uint8Array(
          value instanceof Blob
            ? await value.arrayBuffer()
            : value instanceof Uint8Array
              ? value
              : value
        )
      },
      async close() {
        if (data) {
          node.content = data
          node.writes++
        }
      },
      async abort() {
        data = null
      }
    }
  }
}
class MockDirectory {
  kind = 'directory' as const
  folders = new Map<string, MockDirectory>()
  files = new Map<string, MockFile>()
  constructor(readonly name = 'backup-target') {}
  async queryPermission() {
    return 'granted' as const
  }
  async requestPermission() {
    return 'granted' as const
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const existing = this.folders.get(name)
    if (existing) return existing
    if (!options?.create) throw new DOMException('Not found', 'NotFoundError')
    const next = new MockDirectory(name)
    this.folders.set(name, next)
    return next
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.files.get(name)
    if (existing) return existing
    if (!options?.create) throw new DOMException('Not found', 'NotFoundError')
    const next = new MockFile(name)
    this.files.set(name, next)
    return next
  }
  async removeEntry(name: string, opts?: { recursive?: boolean }) {
    if (this.files.delete(name)) return
    const folder = this.folders.get(name)
    if (!folder) throw new DOMException('Not found', 'NotFoundError')
    if (!opts?.recursive && (folder.files.size || folder.folders.size))
      throw new DOMException('Nonempty', 'InvalidModificationError')
    this.folders.delete(name)
  }
  async *entries(): AsyncGenerator<[string, MockDirectory | MockFile]> {
    for (const entry of this.folders) yield entry
    for (const entry of this.files) yield entry
  }
}
const asHandle = (d: MockDirectory) => d as unknown as FileSystemDirectoryHandle
function status(): ModuleProgress {
  return { enabled: true, count: 0, lastSuccess: null, state: 'waiting' }
}
async function setup(dir = new MockDirectory()) {
  const config = await loadConfig()
  config.handle = asHandle(dir)
  config.directoryName = dir.name
  await saveConfig(config)
  return config
}
async function run(config: BackupConfig, module: 'outfits' | 'home' | 'camera') {
  const s = status()
  await syncModule(config, module, s, () => undefined)
  if (s.state !== 'synced') throw new Error(`backup failed: ${s.error}`)
  return s
}
async function putTestRecord(
  store: string,
  value: unknown,
  imageStore?: string,
  image?: Blob | unknown
) {
  await runDatabaseTransaction(
    [store, ...(imageStore ? [imageStore] : [])],
    'readwrite',
    async (tx) => {
      tx.objectStore(store).put(value)
      if (imageStore && image) {
        if (image instanceof Blob)
          tx.objectStore(imageStore).put(image, (value as { id: string }).id)
        else tx.objectStore(imageStore).put(image)
      }
    }
  )
}
const now = '2026-11-03T12:00:00.000Z'
const outfitRecord = (id: string, note = '', hasImage = false) =>
  normalizeOutfitRecord({
    version: 1,
    id,
    image: hasImage ? id + '.png' : '',
    imageSize: hasImage ? 68 : undefined,
    code: id,
    tags: [],
    note,
    createdAt: now,
    updatedAt: now
  })
const getRecordFiles = async (dir: MockDirectory, module: 'outfits' | 'home' | 'camera') =>
  (await dir.getDirectoryHandle(DIRECTORY_NAME)).getDirectoryHandle(MODULE_NAMES[module])

describe('原始目录增量备份（模拟 File System Access API）', () => {
  beforeEach(async () => {
    // Reset fake IndexedDB without exposing actual user files.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
  it('搭配码新增、备注修改、删除均有同事务脏项，增量重试无需读取图片', async () => {
    const config = await setup()
    config.enabled.outfits = true
    await saveConfig(config)
    const saved = await saveOutfit({ code: 'TEST01', tag: null, note: '' })
    const dirty = await runStoreRequest<unknown[]>(BACKUP_DIRTY_STORE, 'readonly', (s) =>
      s.getAll()
    )
    expect(dirty.some((x) => (x as { key: string[] }).key[0] === 'outfits')).toBe(true)
    const first = await run(config, 'outfits')
    expect(first.count).toBe(1)
    const root = await getRecordFiles(config.handle as unknown as MockDirectory, 'outfits')
    const hash = await keyHash(saved.id)
    expect((await readJson<Entry>(asHandle(root), recordPath(hash)))?.id).toBe(saved.id)
    const edited = await saveOutfit({ outfit: saved, code: saved.code, tag: null, note: 'renamed' })
    const second = await run(config, 'outfits')
    expect(second.count).toBe(1)
    expect((await readJson<Entry>(asHandle(root), recordPath(hash)))?.value).toMatchObject({
      note: 'renamed'
    })
    await deleteOutfit(edited, true) // 模拟用户已确认永久删除
    const third = await run(config, 'outfits')
    expect(third.count).toBe(0)
    expect(await readBytes(asHandle(root), recordPath(hash))).toBeNull()
  })
  it('单条记录更新不会访问该记录图片 Blob，换图只替换自身', async () => {
    const config = await setup()
    config.enabled.outfits = true
    await saveConfig(config)
    const id = 'outfit-image-1'
    const id2 = 'outfit-image-2'
    const png = new Blob(
      [
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=',
          'base64'
        )
      ],
      { type: 'image/png' }
    )
    const hash = await sha256Hex(await png.arrayBuffer())
    await putTestRecord(OUTFITS_STORE, outfitRecord(id, 'first', true), OUTFIT_IMAGES_STORE, {
      id,
      blob: png,
      size: png.size,
      sha256: hash,
      extension: 'png'
    })
    await putTestRecord(OUTFITS_STORE, outfitRecord(id2, 'second', true), OUTFIT_IMAGES_STORE, {
      id: id2,
      blob: png,
      size: png.size,
      sha256: hash,
      extension: 'png'
    })
    expect((await run(config, 'outfits')).count).toBe(2)
    const spy = vi.spyOn(IDBObjectStore.prototype, 'get')
    await putTestRecord(OUTFITS_STORE, outfitRecord(id, 'new note', true))
    await run(config, 'outfits')
    const imagesRead = spy.mock.contexts.some(
      (store) => (store as IDBObjectStore).name === OUTFIT_IMAGES_STORE
    )
    spy.mockRestore()
    expect(imagesRead).toBe(false)
    const root = await getRecordFiles(config.handle as unknown as MockDirectory, 'outfits')
    expect((await readJson<Entry>(asHandle(root), recordPath(await keyHash(id2))))?.id).toBe(id2)
  })
  it('家园和相机分别保留业务字段，未启用的模块不写盘', async () => {
    const config = await setup()
    config.enabled.home = true
    const home = {
      version: 1,
      id: 'home-1',
      image: null,
      code: 'AA123',
      name: 'My home',
      schemeType: 'home',
      tags: [],
      note: '',
      createdAt: now,
      updatedAt: now,
      metadata: {
        version: null,
        furnitureCount: 10,
        server: 1,
        lastModifyTime: null,
        coverImageUrl: null
      }
    }
    const camera = {
      version: 1,
      id: 'camera-1',
      name: 'Camera',
      tag: '',
      code: 'PARAM',
      source: 'manual',
      cover: null,
      createdAt: now,
      updatedAt: now,
      result: {
        rawCameraParams: 'PARAM',
        environmentFields: [],
        cameraFields: [],
        imageFields: [],
        resourceGroups: []
      }
    }
    await putTestRecord(HOME_SCHEMES_STORE, home)
    await putTestRecord(CAMERA_FAVORITES_STORE, camera)
    await saveConfig(config)
    expect((await run(config, 'home')).count).toBe(1)
    const root = await config.handle!.getDirectoryHandle(DIRECTORY_NAME)
    await expect(root.getDirectoryHandle(MODULE_NAMES.camera)).rejects.toBeTruthy()
    config.enabled.camera = true
    await saveConfig(config)
    expect((await run(config, 'camera')).count).toBe(1)
    const cameraDir = await root.getDirectoryHandle(MODULE_NAMES.camera)
    const envelope = await readJson<Entry>(cameraDir, recordPath(await keyHash('camera-1')))
    expect(envelope?.value).toMatchObject({ name: 'Camera', code: 'PARAM' })
  })
  it('已确认备份可以跨目录按模块恢复，未选模块不被改动', async () => {
    const source = new MockDirectory('backup-source')
    const original = await setup(source)
    original.enabled.outfits = true
    await saveConfig(original)
    await saveOutfit({ code: 'SOURCE01', tag: null, note: 'original' })
    expect((await run(original, 'outfits')).count).toBe(1)
    // Clear only target business data: simulates a different browser with empty records.
    await runDatabaseTransaction([OUTFITS_STORE], 'readwrite', async (tx) => {
      tx.objectStore(OUTFITS_STORE).clear()
    })
    const preview = await previewRestore(asHandle(source))
    const outfit = preview.modules.find((item) => item.module === 'outfits')!
    expect(outfit.ready).toBe(true)
    expect(outfit.backupCount).toBe(1)
    expect(outfit.browserCount).toBe(0)
    await restoreSelected(asHandle(source), preview, ['outfits'], () => undefined)
    expect(
      (await runStoreRequest<unknown[]>(OUTFITS_STORE, 'readonly', (s) => s.getAll())).length
    ).toBe(1)
    expect((await loadConfig()).enabled.outfits).toBe(false)
  })
})
