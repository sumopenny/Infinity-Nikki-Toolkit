import { assertBackupKind } from '../../src/utils/backup/backupDetector'
// @vitest-environment node
import 'fake-indexeddb/auto'
import { CAMERA_BACKUP_LIMITS } from '../../src/utils/backup/zipBackup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate'
import { DB_NAME, runStoreRequest } from '../../src/utils/file-system/database'
import {
  applyCameraImport,
  clearCameraFavorites,
  saveCameraFavoriteTags,
  deleteCameraFavoriteTag,
  coverMetadata,
  deleteCameraFavorite,
  deleteCameraFavorites,
  DuplicateCameraCodeError,
  planCameraImport,
  readCameraFavorites,
  saveCameraFavorite,
  type CameraFavorite
} from '../../src/utils/photo-params/favorites'
import {
  exportCameraBackup as exportCameraParts,
  readCameraBackup
} from '../../src/utils/photo-params/favoritesBackup'
import { getSavedAlbumDirectoryHandle } from '../../src/utils/file-system/directoryStorage'
import { loadResonanceRecords } from '../../src/utils/resonance/resonanceStorage'

async function exportCameraBackup(library: Parameters<typeof exportCameraParts>[0]): Promise<Blob> {
  const first = await exportCameraParts(library).next()
  if (first.done) throw new Error('Missing backup')
  return first.value.blob
}

const record = (id = 'one', code = 'ABC'): CameraFavorite => ({
  id,
  code,
  version: 1,
  name: '暖光人像',
  tag: '人像',
  source: 'album',
  cover: null,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  result: {
    rawCameraParams: code,
    cameraFields: [],
    imageFields: [],
    environmentFields: [{ label: '天气', value: '晴天' }],
    resourceGroups: [{ kind: 'pose', id: '123', title: '动作', name: '动作123' }]
  }
})
beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})
describe('camera favorites', () => {
  it('upgrades version 4 and preserves album handles and resonance records regardless of entry point', async () => {
    const old = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open(DB_NAME, 4)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('album-handles')
        request.result.createObjectStore('resonance-records')
      }
      request.onsuccess = () => resolve(request.result)
    })
    await new Promise<void>((resolve) => {
      const tx = old.transaction(['album-handles', 'resonance-records'], 'readwrite')
      tx.objectStore('album-handles').put({ name: 'album' }, 'current-album-directory')
      tx.objectStore('resonance-records').put([{ id: 'old-record' }], 'current-profile')
      tx.oncomplete = () => resolve()
    })
    old.close()
    expect(await loadResonanceRecords()).toEqual([{ id: 'old-record' }])
    expect((await getSavedAlbumDirectoryHandle())?.name).toBe('album')
    await saveCameraFavorite(record(), null)
    expect((await readCameraFavorites()).records).toHaveLength(1)
  })
  it('rejects simultaneous duplicate codes and leaves no orphan cover', async () => {
    const image = new Blob(['original bytes'], { type: 'image/png' })
    const meta = await coverMetadata(image, 'original.png')
    const a = { ...record('one'), cover: meta }
    const b = {
      ...record('two'),
      cover: meta,
      result: { ...record().result, rawCameraParams: ' A B C \n' }
    }
    const results = await Promise.allSettled([
      saveCameraFavorite(a, image),
      saveCameraFavorite(b, image)
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason).toBeInstanceOf(DuplicateCameraCodeError)
    const library = await readCameraFavorites()
    expect(library.records).toHaveLength(1)
    expect(library.covers.size).toBe(1)
  })
  it('prevents duplicate edits and rolls back the previous record and cover', async () => {
    const image = new Blob(['original'])
    const a = { ...record('one'), cover: await coverMetadata(image) }
    const b = record('two', 'XYZ')
    await saveCameraFavorite(a, image)
    await saveCameraFavorite(b, null)
    await expect(
      saveCameraFavorite({ ...a, result: b.result, cover: null }, null, a)
    ).rejects.toBeInstanceOf(DuplicateCameraCodeError)
    const library = await readCameraFavorites()
    expect(library.records.find((r) => r.id === a.id)).toEqual(a)
    expect(await library.covers.get(a.id)?.text()).toBe('original')
  })
  it.each(['image/png', 'image/webp', 'image/jpeg', 'image/gif', 'image/avif'])(
    'exports and restores exact %s cover bytes and complete photo details',
    async (type) => {
      const bytes = Uint8Array.from({ length: 1024 }, (_, i) => i % 256)
      const image = new Blob([bytes], { type })
      const a = {
        ...record(),
        cover: await coverMetadata(
          image,
          'cover.' + (type === 'image/jpeg' ? 'jpg' : type.slice(6))
        )
      }
      await saveCameraFavorite(a, image)
      const archive = await exportCameraBackup(await readCameraFavorites())
      const restored = await readCameraBackup(archive)
      expect(restored.records).toEqual([a])
      expect(new Uint8Array(await restored.covers.get(a.id)!.arrayBuffer())).toEqual(bytes)
      await deleteCameraFavorite(a.id)
      expect((await readCameraFavorites()).covers.size).toBe(0)
      expect(
        await applyCameraImport(planCameraImport(await readCameraFavorites(), restored), {})
      ).toBe(1)
      expect((await readCameraFavorites()).records[0].result.environmentFields).toEqual(
        a.result.environmentFields
      )
    }
  )
  it('skips duplicate codes even with different IDs or within the archive', async () => {
    await saveCameraFavorite(record(), null)
    const incoming = {
      records: [record('two'), record('three', 'XYZ'), record('four', 'XYZ')],
      covers: new Map<string, Blob>()
    }
    const plan = planCameraImport(await readCameraFavorites(), incoming)
    expect(plan.skipped).toBe(2)
    expect(await applyCameraImport(plan, {})).toBe(1)
    expect((await readCameraFavorites()).records).toHaveLength(2)
  })
  it('supports choosing local or imported records for ID conflicts', async () => {
    const original = record()
    await saveCameraFavorite(original, null)
    const incoming = { records: [{ ...original, name: '新版' }], covers: new Map<string, Blob>() }
    const plan = planCameraImport(await readCameraFavorites(), incoming)
    expect(plan.conflicts).toHaveLength(1)
    expect(await applyCameraImport(plan, { one: 'local' })).toBe(0)
    expect(await applyCameraImport(plan, { one: 'incoming' })).toBe(1)
    expect((await readCameraFavorites()).records[0].name).toBe('新版')
  })
  it('refuses a stale import plan without overwriting changes made in another tab', async () => {
    const original = record()
    await saveCameraFavorite(original, null)
    const plan = planCameraImport(await readCameraFavorites(), {
      records: [{ ...original, name: '导入' }, record('two', 'XYZ')],
      covers: new Map()
    })
    await saveCameraFavorite({ ...original, name: '刚刚编辑' }, null, original)
    await expect(applyCameraImport(plan, { one: 'incoming' })).rejects.toBeTruthy()
    const library = await readCameraFavorites()
    expect(library.records).toHaveLength(1)
    expect(library.records[0].name).toBe('刚刚编辑')
  })
  it('rejects damaged or missing covers before any import writes', async () => {
    const image = new Blob(['original'], { type: 'image/png' })
    const a = { ...record(), cover: await coverMetadata(image) }
    const json = strToU8(
      JSON.stringify({ format: 'nikki-camera-favorites', version: 2, tags: ['人像'], records: [a] })
    )
    await expect(readCameraBackup(new Blob([zipSync({ 'favorites.json': json })]))).rejects.toThrow(
      '封面缺失'
    )
    await expect(
      readCameraBackup(
        new Blob([zipSync({ 'favorites.json': json, 'covers/one': strToU8('damaged') })])
      )
    ).rejects.toThrow('校验失败')
    expect((await readCameraFavorites()).records).toHaveLength(0)
  })
  it('validates a single optional tag for storage and ZIP records', async () => {
    for (const tag of [undefined, null, [], ['人像', '夜景'], 'x'.repeat(61)]) {
      const invalid = { ...record(), tag } as unknown as CameraFavorite
      await expect(saveCameraFavorite(invalid, null)).rejects.toThrow('数据损坏')
      await expect(
        readCameraBackup(
          zipManifest({
            format: 'nikki-camera-favorites',
            version: 2,
            tags: [],
            records: [invalid]
          })
        )
      ).rejects.toThrow('数据损坏')
    }
    expect((await readCameraFavorites()).records).toHaveLength(0)
    const untagged = { ...record(), tag: '' }
    await saveCameraFavorite(untagged, null)
    const restored = await readCameraBackup(await exportCameraBackup(await readCameraFavorites()))
    expect(restored.records).toEqual([untagged])
  })
  it('rejects unsupported versions and invalid metadata', async () => {
    const archive = await exportCameraBackup({ records: [record()], covers: new Map() })
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()))
    const manifest = JSON.parse(strFromU8(files['favorites.json']))
    manifest.records[0].result.cameraFields = [{}]
    files['favorites.json'] = strToU8(JSON.stringify(manifest))
    await expect(readCameraBackup(new Blob([zipSync(files)]))).rejects.toThrow('数据损坏')
    manifest.version = 999
    files['favorites.json'] = strToU8(JSON.stringify(manifest))
    await expect(readCameraBackup(new Blob([zipSync(files)]))).rejects.toThrow('不支持')
  })
})

it('bulk deletion removes only selected favorites and their cover copies', async () => {
  const image = new Blob(['original photo'], { type: 'image/png' })
  const first = { ...record('one'), cover: await coverMetadata(image) }
  await saveCameraFavorite(first, image)
  await saveCameraFavorite(record('two', 'DEF'), null)
  await saveCameraFavorite(record('three', 'XYZ'), null)
  await deleteCameraFavorites(['one', 'two'])
  const library = await readCameraFavorites()
  expect(library.records.map((r) => r.id)).toEqual(['three'])
  expect(library.covers.size).toBe(0)
  expect(await image.text()).toBe('original photo')
})

it('removes a tag from all current records while retaining other records, snapshots and original cover bytes', async () => {
  const image = new Blob(['original'])
  const first = { ...record(), tag: '人像', cover: await coverMetadata(image) }
  const second = { ...record('two', 'XYZ'), tag: '夜景' }
  await saveCameraFavorite(first, image)
  await saveCameraFavorite(second, null)
  await deleteCameraFavoriteTag('人像')
  const library = await readCameraFavorites()
  expect(library.records).toHaveLength(2)
  expect(library.records.find((value) => value.id === first.id)?.tag).toBe('')
  expect(library.records.find((value) => value.id === second.id)?.tag).toBe('夜景')
  expect(library.records.find((value) => value.id === first.id)?.result).toEqual(first.result)
  expect(await library.covers.get(first.id)?.text()).toBe('original')
})

afterEach(() => vi.unstubAllGlobals())
const zipManifest = (manifest: unknown) =>
  new Blob([zipSync({ 'favorites.json': strToU8(JSON.stringify(manifest)) })])
describe('complete camera backup', () => {
  it('keeps the decompression reason for an unreadable ZIP', async () => {
    await expect(readCameraBackup(new Blob(['not a zip']))).rejects.toMatchObject({
      message: '无法读取 ZIP 备份',
      cause: expect.any(Error)
    })
  })
  it('distinguishes another backup type from an invalid camera archive', async () => {
    await expect(
      readCameraBackup(new Blob([zipSync({ 'backup.json': strToU8('{}') })]))
    ).rejects.toThrow('这不是相机收藏备份')
    await expect(
      readCameraBackup(new Blob([zipSync({ 'other.json': strToU8('{}') })]))
    ).rejects.toThrow('备份格式无效')
  })
  it('round-trips empty tags and ordering into an empty library, including a tags-only backup', async () => {
    const tags = ['夜景', '空标签', '人像']
    await saveCameraFavoriteTags(tags)
    const original = await readCameraFavorites()
    const archive = await exportCameraBackup(original)
    const manifest = JSON.parse(
      strFromU8(unzipSync(new Uint8Array(await archive.arrayBuffer()))['favorites.json'])
    )
    expect(manifest.version).toBe(2)
    expect(manifest.tags).toEqual(tags)
    await clearCameraFavorites()
    const incoming = await readCameraBackup(archive)
    await applyCameraImport(planCameraImport(await readCameraFavorites(), incoming), {})
    expect((await readCameraFavorites()).tags).toEqual(tags)
    expect((await readCameraFavorites()).records).toHaveLength(0)
  })
  it('restores backup tag order and appends local-only tags even when every record is a duplicate', async () => {
    await saveCameraFavorite(record(), null)
    await saveCameraFavoriteTags(['本地独有', '人像'])
    const incoming = await readCameraBackup(
      await exportCameraBackup({ records: [record()], covers: new Map(), tags: ['空标签', '人像'] })
    )
    const plan = planCameraImport(await readCameraFavorites(), incoming)
    expect(plan.skipped).toBe(1)
    expect(await applyCameraImport(plan, {})).toBe(0)
    expect((await readCameraFavorites()).tags).toEqual(['空标签', '人像', '本地独有'])
  })
  it('rejects old ZIP versions without changing the current library', async () => {
    await saveCameraFavoriteTags(['本地空标签'])
    await expect(
      readCameraBackup(
        zipManifest({ format: 'nikki-camera-favorites', version: 1, records: [record()] })
      )
    ).rejects.toThrow('不支持')
    const current = await readCameraFavorites()
    expect(current.tags).toEqual(['本地空标签'])
    expect(current.records).toHaveLength(0)
  })
  it('rejects invalid v2 tag metadata without writing anything', async () => {
    await saveCameraFavoriteTags(['保留'])
    for (const tags of [undefined, null, 'bad', [123], [''], ['x'.repeat(61)], ['重复', '重复']]) {
      await expect(
        readCameraBackup(
          zipManifest({ format: 'nikki-camera-favorites', version: 2, records: [], tags })
        )
      ).rejects.toThrow('标签列表损坏')
    }
    expect((await readCameraFavorites()).tags).toEqual(['保留'])
  })
  it('rejects a plan when another tab changes only tag order', async () => {
    await saveCameraFavoriteTags(['甲', '乙'])
    const plan = planCameraImport(await readCameraFavorites(), {
      records: [record()],
      covers: new Map(),
      tags: ['导入']
    })
    await saveCameraFavoriteTags(['乙', '甲'])
    await expect(applyCameraImport(plan, {})).rejects.toBeTruthy()
    const current = await readCameraFavorites()
    expect(current.tags).toEqual(['乙', '甲'])
    expect(current.records).toHaveLength(0)
  })
  it('rolls back records, cover writes and tags together if the transaction fails', async () => {
    await saveCameraFavorite(record(), null)
    await saveCameraFavoriteTags(['原有', '人像'])
    const image = new Blob(['new cover'])
    const incoming = { ...record('two', 'XYZ'), cover: await coverMetadata(image) }
    const plan = planCameraImport(await readCameraFavorites(), {
      records: [incoming],
      covers: new Map([['two', image]]),
      tags: ['导入标签']
    })
    plan.incoming.records[0].code = 'ABC' // Force the unique-index constraint to fail during the transaction.
    await expect(applyCameraImport(plan, {})).rejects.toBeInstanceOf(DuplicateCameraCodeError)
    const current = await readCameraFavorites()
    expect(current.records).toEqual([record()])
    expect(current.tags).toEqual(['原有', '人像'])
    expect(current.covers.size).toBe(0)
  })
  it('uses IndexedDB exclusively for tags without accessing localStorage', async () => {
    const getItem = vi.fn(() => {
      throw new Error('Unexpected localStorage read')
    })
    const removeItem = vi.fn(() => {
      throw new Error('Unexpected localStorage removal')
    })
    vi.stubGlobal('localStorage', { getItem, removeItem })
    expect((await readCameraFavorites()).tags).toEqual([])
    await saveCameraFavorite(record(), null)
    await saveCameraFavoriteTags(['empty', record().tag])
    expect((await readCameraFavorites()).tags).toEqual(['empty', record().tag])
    await deleteCameraFavoriteTag('empty')
    const plan = planCameraImport(await readCameraFavorites(), {
      records: [],
      covers: new Map(),
      tags: ['imported']
    })
    await applyCameraImport(plan, {})
    expect((await readCameraFavorites()).tags).toEqual(['imported', record().tag])
    await clearCameraFavorites()
    expect((await readCameraFavorites()).tags).toEqual([])
    expect(getItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
})

it('splits a camera library into separately importable archives with all tags', async () => {
  const old = CAMERA_BACKUP_LIMITS.records
  CAMERA_BACKUP_LIMITS.records = 2
  try {
    const records = Array.from({ length: 5 }, (_, i) => record('record-' + i, 'CODE' + i))
    const restored: CameraFavorite[] = []
    let count = 0
    for await (const part of exportCameraParts({ records, covers: new Map(), tags: ['空分类'] })) {
      expect(part.fileName).toContain('_part-')
      const data = await readCameraBackup(part.blob)
      expect(data.records.length).toBeLessThanOrEqual(2)
      expect(data.tags).toContain('空分类')
      restored.push(...data.records)
      count++
    }
    expect(count).toBe(3)
    expect(restored).toEqual(records)
  } finally {
    CAMERA_BACKUP_LIMITS.records = old
  }
})

it('reads and edits directly stored favorites without losing covers or tag order', async () => {
  // Seed the stored representation directly, without passing through the current save path.
  const cover = new Blob(['existing-cover'], { type: 'image/webp' })
  const original = {
    ...record('existing', 'EXISTING'),
    cover: await coverMetadata(cover, 'existing.webp')
  }
  await runStoreRequest('camera-favorites', 'readwrite', (store) => store.put(original))
  await runStoreRequest('camera-favorite-covers', 'readwrite', (store) =>
    store.put(cover, original.id)
  )
  await runStoreRequest('camera-favorite-tags', 'readwrite', (store) =>
    store.put(['人像', '空标签'], 'order')
  )
  const loaded = await readCameraFavorites()
  expect(loaded.records).toEqual([original])
  expect(await loaded.covers.get(original.id)!.text()).toBe('existing-cover')
  const edited = { ...original, name: '修改名称' }
  await saveCameraFavorite(edited, cover, original)
  const current = await readCameraFavorites()
  expect(current.records).toEqual([edited])
  expect(current.tags).toEqual(['人像', '空标签'])
  expect(await current.covers.get(original.id)!.text()).toBe('existing-cover')
})

it('accepts five-character new tags and rejects six-character writes', async () => {
  await saveCameraFavoriteTags(['一二三四五'])
  await expect(saveCameraFavoriteTags(['一二三四五六'])).rejects.toThrow('最多5个字符')
  await expect(saveCameraFavorite({ ...record(), tag: '123456' }, null)).rejects.toThrow(
    '最多5个字符'
  )
  expect((await readCameraFavorites()).tags).toEqual(['一二三四五'])
  expect((await readCameraFavorites()).records).toHaveLength(0)
  await saveCameraFavorite({ ...record(), tag: '12345' }, null)
  expect((await readCameraFavorites()).records[0].tag).toBe('12345')
})

it('imports and retains legacy long tags while rejecting newly added long tags', async () => {
  const legacy = { ...record(), tag: '历史超长标签名称' }
  const archive = await exportCameraBackup({
    records: [legacy],
    covers: new Map(),
    tags: [legacy.tag, '历史独立长标签']
  })
  const incoming = await readCameraBackup(archive)
  await applyCameraImport(planCameraImport(await readCameraFavorites(), incoming), {})
  expect((await readCameraFavorites()).records[0].tag).toBe(legacy.tag)
  await saveCameraFavoriteTags(['历史独立长标签', legacy.tag])
  await saveCameraFavorite({ ...legacy, name: '保留原标签' }, null, legacy)
  await saveCameraFavorite({ ...record('two', 'XYZ'), tag: legacy.tag }, null)
  await expect(saveCameraFavoriteTags(['新建超长标签名称'])).rejects.toThrow('最多5个字符')
  const current = await readCameraFavorites()
  expect(current.tags).toEqual(['历史独立长标签', legacy.tag])
  expect(current.records.every((item) => item.tag === legacy.tag)).toBe(true)
})

it('reads metadata alone for the list and retrieves one cover on demand', async () => {
  const { readCameraFavoriteCover } = await import('../../src/utils/photo-params/favorites')
  const blob = new Blob(['cover'], { type: 'image/webp' })
  await saveCameraFavorite({ ...record(), cover: await coverMetadata(blob, 'cover.webp') }, blob)
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll')
  const list = await readCameraFavorites(false)
  expect(list.records).toHaveLength(1)
  expect(list.covers.size).toBe(0)
  expect(reads.mock.contexts.map((store) => (store as IDBObjectStore).name)).toEqual([
    'camera-favorites'
  ])
  expect((await readCameraFavoriteCover('one')).size).toBe(blob.size)
  expect((await readCameraFavorites()).covers.get('one')?.size).toBe(blob.size)
  reads.mockRestore()
})

// 使用真实导出器与两个导入阶段，防止类型识别限制小于合法分包清单。
it('restores its own camera export when the manifest exceeds four MiB', async () => {
  const records = Array.from({ length: 50 }, (_, index) =>
    record(`large-${index}`, 'A'.repeat(45000) + index)
  )
  const blob = await exportCameraBackup({ records, covers: new Map(), tags: ['人像'] })
  await expect(assertBackupKind(new File([blob], 'camera.zip'), 'camera')).resolves.toBeUndefined()
  expect((await readCameraBackup(blob)).records).toEqual(records)
})
