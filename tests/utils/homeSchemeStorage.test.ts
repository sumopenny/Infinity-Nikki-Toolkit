import { updateConfig, dirtyChanges } from '../../src/utils/directory-backup/repository'
// @vitest-environment node
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  DB_NAME,
  DB_VERSION,
  HOME_IMAGES_STORE,
  HOME_SCHEMES_STORE,
  openDb,
  runStoreRequest
} from '../../src/utils/file-system/database'
import {
  addHomeSchemeTag,
  deleteHomeScheme,
  deleteHomeSchemes,
  deleteHomeSchemeTag,
  homeTransaction,
  readHomeSchemeSnapshot,
  saveHomeScheme,
  saveHomeSchemeTags
} from '../../src/utils/homeBuild/homeSchemeStorage'
import { createEmptyHomeSchemeMetadata } from '../helpers/homeSchemeMetadata'

const input = (code = 'CODE1') => ({
  code,
  name: '花园',
  schemeType: 'home' as const,
  tags: ['庭院'],
  note: '春日',
  metadata: createEmptyHomeSchemeMetadata()
})
const image = () => new File(['RIFF0000WEBPcontent'], 'image.webp', { type: 'image/webp' })
beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1, height: 1, close() {} }))
  )
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
})

it('upgrades version 6 without replacing existing stores or records', async () => {
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 6)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('resonance-records').put(['old'], 'current-profile')
    }
    r.onsuccess = () => {
      r.result.close()
      resolve()
    }
    r.onerror = () => reject(r.error)
  })
  const db = await openDb()
  expect(db.version).toBe(DB_VERSION)
  db.close()
  expect(
    await runStoreRequest('resonance-records', 'readonly', (store) => store.get('current-profile'))
  ).toEqual(['old'])
  expect(await saveHomeScheme({ ...input(), tags: [] })).toMatchObject({
    code: 'CODE1',
    image: null
  })
})

it('enforces global unique codes across concurrent writers', async () => {
  await saveHomeSchemeTags(['庭院'])
  const results = await Promise.allSettled([saveHomeScheme(input()), saveHomeScheme(input())])
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
  expect(failed.reason.message).toBe('home_scheme_code_duplicate')
  expect((await readHomeSchemeSnapshot()).records).toHaveLength(1)
})

it('keeps images independent of source files and deletes tags without losing schemes or images', async () => {
  await saveHomeSchemeTags(['庭院'])
  const saved = await saveHomeScheme({ ...input(), imageFile: image() })
  const time = saved.createdAt
  const deletion = await deleteHomeSchemeTag('庭院')
  expect(deletion).toMatchObject({ tags: [], updatedCount: 1 })
  expect(deletion.updatedRecords[0]?.updatedAt).not.toBe(saved.updatedAt)
  expect((await readHomeSchemeSnapshot()).images.get(saved.id)?.blob.size).toBe(image().size)
  await expect(
    saveHomeScheme({ ...input(), tags: [], item: saved, removeImage: true })
  ).rejects.toThrow('home_scheme_record_changed')
  const latest = deletion.updatedRecords[0]!
  expect(latest).toEqual((await readHomeSchemeSnapshot()).records[0])
  const changed = await saveHomeScheme({
    ...input(),
    tags: [],
    item: { ...latest, imageUrl: null },
    removeImage: true
  })
  expect(changed.createdAt).toBe(time)
  expect(changed.image).toBeNull()
  expect((await readHomeSchemeSnapshot()).images.size).toBe(0)
  await deleteHomeScheme(changed)
  expect((await readHomeSchemeSnapshot()).records).toHaveLength(0)
})

it('rejects a stale editor and advances the baseline even for writes in the same millisecond', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-13T00:00:00.000Z'))
  const saved = await saveHomeScheme({ ...input(), tags: [] })
  const results = await Promise.allSettled([
    saveHomeScheme({ ...input(), tags: [], item: saved, name: '最新名称', note: '最新备注' }),
    saveHomeScheme({ ...input(), tags: [], item: saved, name: '旧窗口名称' })
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(
    (results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason.message
  ).toBe('home_scheme_record_changed')
  const latest = (await readHomeSchemeSnapshot()).records[0]!
  expect(latest).toMatchObject({ name: '最新名称', note: '最新备注' })
  expect(Date.parse(latest.updatedAt)).toBeGreaterThan(Date.parse(saved.updatedAt))
  await expect(
    saveHomeScheme({ ...input(), tags: [], item: { ...latest, imageUrl: null }, name: '重新编辑' })
  ).resolves.toMatchObject({ name: '重新编辑' })
})

it('does not recreate a record deleted by another window', async () => {
  const saved = await saveHomeScheme({ ...input(), tags: [] })
  await deleteHomeScheme(saved)
  await expect(saveHomeScheme({ ...input(), tags: [], item: saved })).rejects.toThrow(
    'home_scheme_record_missing'
  )
  expect((await readHomeSchemeSnapshot()).records).toEqual([])
})

it('rolls record and image writes back when a successful request is followed by transaction abort', async () => {
  await expect(
    homeTransaction([HOME_SCHEMES_STORE, HOME_IMAGES_STORE], 'readwrite', async (tx) => {
      tx.objectStore(HOME_IMAGES_STORE).put({ id: 'one', blob: image() })
      const request = tx.objectStore(HOME_SCHEMES_STORE).put({ id: 'one', code: 'CODE1' })
      request.onsuccess = () => tx.abort()
    })
  ).rejects.toThrow()
  expect(await runStoreRequest(HOME_IMAGES_STORE, 'readonly', (store) => store.count())).toBe(0)
  expect(await runStoreRequest(HOME_SCHEMES_STORE, 'readonly', (store) => store.count())).toBe(0)
})

it('loads list metadata without reading image blobs, but keeps full backup snapshots', async () => {
  const { readHomeSchemeLibrary, readHomeSchemeImage } =
    await import('../../src/utils/homeBuild/homeSchemeStorage')
  await saveHomeSchemeTags(['庭院'])
  const saved = await saveHomeScheme({ ...input(), imageFile: image() })
  const reads = vi.spyOn(IDBObjectStore.prototype, 'getAll')
  const list = await readHomeSchemeLibrary()
  expect(list.schemes[0]).toMatchObject({ id: saved.id, imageUrl: null })
  expect(reads.mock.contexts.map((store) => (store as IDBObjectStore).name)).not.toContain(
    'home-scheme-images'
  )
  expect(reads.mock.contexts.map((store) => (store as IDBObjectStore).name)).toEqual([
    'home-schemes'
  ])
  const blob = await readHomeSchemeImage(saved.id)
  expect(blob.size).toBeGreaterThan(0)
  expect((await readHomeSchemeSnapshot()).images.get(saved.id)?.blob.size).toBe(blob.size)
  reads.mockRestore()
})

// 两个页面都未刷新标签列表时，新增操作仍必须保留对方刚添加的标签。
it('merges concurrent tag additions and keeps unused tags', async () => {
  await saveHomeSchemeTags(['原有'])
  await Promise.all([addHomeSchemeTag('页面A'), addHomeSchemeTag('页面B')])
  expect((await readHomeSchemeSnapshot()).tags).toEqual(
    expect.arrayContaining(['原有', '页面A', '页面B'])
  )
  await addHomeSchemeTag('页面A')
  expect((await readHomeSchemeSnapshot()).tags).toHaveLength(3)
})

it('deletes a selected batch and its images in one transaction with confirmed backup intent', async () => {
  await updateConfig((current) => {
    current.enabled.home = true
  })
  const first = await saveHomeScheme({ ...input('FIRST'), tags: [], imageFile: image() })
  const second = await saveHomeScheme({ ...input('SECOND'), tags: [], imageFile: image() })
  const keep = await saveHomeScheme({ ...input('KEEP'), tags: [], imageFile: image() })
  const transactions = vi.spyOn(IDBDatabase.prototype, 'transaction')
  await deleteHomeSchemes([first, second, first], true)
  expect(transactions).toHaveBeenCalledTimes(1)
  transactions.mockRestore()
  const remaining = await readHomeSchemeSnapshot()
  expect(remaining.records.map((record) => record.id)).toEqual([keep.id])
  expect([...remaining.images.keys()]).toEqual([keep.id])
  const changes = await dirtyChanges('home')
  for (const item of [first, second])
    expect(
      changes.find((change) => change.key[1] === 'record' && change.key[2] === item.id)?.intent
    ).toBe('confirmed-delete')
})

it('rolls the whole home deletion batch back if a later record cannot be deleted', async () => {
  const first = await saveHomeScheme({ ...input('FIRST'), tags: [], imageFile: image() })
  const second = await saveHomeScheme({ ...input('SECOND'), tags: [], imageFile: image() })
  const original = IDBObjectStore.prototype.delete
  const deletion = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
    this: IDBObjectStore,
    key
  ) {
    if (this.name === HOME_SCHEMES_STORE && key === second.id)
      throw new Error('batch deletion failed')
    return original.call(this, key)
  })
  try {
    await expect(deleteHomeSchemes([first, second], true)).rejects.toThrow('batch deletion failed')
  } finally {
    deletion.mockRestore()
  }
  const remaining = await readHomeSchemeSnapshot()
  expect(new Set(remaining.records.map((record) => record.id))).toEqual(
    new Set([first.id, second.id])
  )
  expect(new Set(remaining.images.keys())).toEqual(new Set([first.id, second.id]))
})
