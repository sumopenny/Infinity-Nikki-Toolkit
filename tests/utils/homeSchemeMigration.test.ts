// @vitest-environment node
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  DB_NAME,
  HOME_SCHEMES_STORE,
  HOME_TAGS_STORE,
  HOME_MIGRATION_ENTRIES_STORE,
  runStoreRequest
} from '../../src/utils/file-system/database'
import { migrateHomeSchemeLibrary } from '../../src/utils/homeBuild/homeSchemeMigration'
import {
  deleteHomeScheme,
  deleteHomeSchemeTag,
  readHomeSchemeSnapshot
} from '../../src/utils/homeBuild/homeSchemeStorage'
import { createEmptyHomeSchemeMetadata } from '../helpers/homeSchemeMetadata'

class Directory {
  kind = 'directory' as const
  name = 'NikkiPhotos_HighQuality'
  token = crypto.randomUUID()
  files = new Map<string, Blob>()
  home?: Directory
  onEntries?: () => void
  async removeEntry(name: string, options?: { recursive?: boolean }) {
    if (name !== 'home' || !this.home) throw new DOMException('Missing', 'NotFoundError')
    if (!options?.recursive) throw new Error('Recursive deletion required')
    this.home.files.clear()
    this.home = undefined
  }
  async isSameEntry(other: Directory) {
    return this.token === other.token
  }
  async getDirectoryHandle(name: string) {
    if (name === 'home' && this.home) return this.home
    throw new DOMException('Missing', 'NotFoundError')
  }
  async getFileHandle(name: string) {
    const file = this.files.get(name)
    if (!file) throw new DOMException('Missing', 'NotFoundError')
    return { getFile: async () => file }
  }
  async *entries() {
    this.onEntries?.()
    for (const name of this.files.keys()) yield [name, { kind: 'file' }] as const
  }
  json(name: string, value: unknown) {
    this.files.set(name, new Blob([JSON.stringify(value)]))
  }
}
const handle = (directory: Directory) => directory as unknown as FileSystemDirectoryHandle
const record = (id: string, code: string, name = '妮妮尔', image: string | null = null) => ({
  version: 1,
  id,
  image,
  code,
  name,
  schemeType: 'home',
  metadata: {
    ...createEmptyHomeSchemeMetadata(),
    version: '2.8.2',
    furnitureCount: 2752,
    server: 49,
    lastModifyTime: 0,
    coverImageUrl: 'https://example.test/cover'
  },
  tags: ['56455'],
  note: '',
  createdAt: '2026-10-10T10:46:34.319Z',
  updatedAt: '2026-10-12T02:26:43.319Z'
})
function album() {
  const album = new Directory()
  album.home = new Directory()
  album.home.json('tags.json', ['56455', '鹅'])
  return album
}

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

it('migrates the four records and timestamps, then removes only the old home folder', async () => {
  const source = album()
  const names = ['妮妮尔', '湖边度假', '冰莲花本体', '墙景']
  names.forEach((name, i) =>
    source.home!.json(`${i}.json`, {
      ...record(`${i}`, `CODE${i}`, name),
      schemeType: i < 2 ? 'home' : 'combo'
    })
  )
  source.files.set('photo.jpg', new Blob(['original photo']))
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 4,
    replacedCount: 0,
    failedCount: 0
  })
  const snapshot = await readHomeSchemeSnapshot()
  expect(snapshot.records).toHaveLength(4)
  expect(snapshot.images.size).toBe(0)
  expect(snapshot.tags).toEqual(['56455', '鹅'])
  expect(snapshot.records[0]).toMatchObject({
    tags: ['56455'],
    createdAt: record('0', 'CODE0').createdAt,
    metadata: record('0', 'CODE0').metadata
  })
  expect(source.home).toBeUndefined()
  expect(await source.files.get('photo.jpg')!.text()).toBe('original photo')
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 0,
    replacedCount: 0,
    failedCount: 0
  })
})

it('replaces the same code from a different identically named album, retains database ID and removes the old local image', async () => {
  const first = album(),
    second = album()
  first.home!.json('one.json', record('one', 'CODE1', '原方案', 'one.webp'))
  first.home!.files.set('one.webp', new Blob(['RIFF0000WEBPcontent']))
  second.home!.json('two.json', record('two', 'CODE1', '新方案'))
  await migrateHomeSchemeLibrary(handle(first))
  expect(await migrateHomeSchemeLibrary(handle(second))).toMatchObject({
    replacedCount: 1,
    failedCount: 0
  })
  const snapshot = await readHomeSchemeSnapshot()
  expect(snapshot.records).toHaveLength(1)
  expect(snapshot.records[0]).toMatchObject({ id: 'one', name: '新方案', image: null })
  expect(snapshot.images.size).toBe(0)
  await deleteHomeScheme(snapshot.records[0])
  await migrateHomeSchemeLibrary(handle(first))
  await migrateHomeSchemeLibrary(handle(second))
  expect((await readHomeSchemeSnapshot()).records).toHaveLength(0)
})

it('skips identical records across albums but allocates a fresh ID for different codes with the same ID', async () => {
  const first = album(),
    second = album()
  first.home!.json('one.json', record('one', 'CODE1'))
  second.home!.json('two.json', record('two', 'CODE1'))
  second.home!.json('one.json', record('one', 'CODE2'))
  await migrateHomeSchemeLibrary(handle(first))
  expect(await migrateHomeSchemeLibrary(handle(second))).toMatchObject({
    addedCount: 1,
    skippedCount: 1,
    failedCount: 0
  })
  const saved = (await readHomeSchemeSnapshot()).records
  expect(saved.map((r) => r.code).sort()).toEqual(['CODE1', 'CODE2'])
  expect(new Set(saved.map((r) => r.id)).size).toBe(2)
})

it('retries damaged records and missing images without marking failures successful or modifying good data', async () => {
  const source = album()
  source.home!.files.set('bad.json', new Blob(['broken']))
  source.home!.json('one.json', record('one', 'CODE1', '有图', 'one.webp'))
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    failedCount: 2,
    homeDirectoryRemoved: false
  })
  expect(source.home).toBeDefined()
  expect(
    await runStoreRequest(HOME_MIGRATION_ENTRIES_STORE, 'readonly', (store) => store.count())
  ).toBe(0)
  source.home!.json('bad.json', record('bad', 'CODE2'))
  source.home!.files.set('one.webp', new Blob(['RIFF0000WEBPcontent']))
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 2,
    failedCount: 0
  })
})

it('rolls replacement and marker back on transaction failure, then succeeds on retry', async () => {
  const first = album(),
    second = album()
  first.home!.json('one.json', record('one', 'CODE1', '原方案'))
  second.home!.json('two.json', record('two', 'CODE1', '新方案'))
  await migrateHomeSchemeLibrary(handle(first))
  const originalPut = IDBObjectStore.prototype.put
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    const request = originalPut.apply(this, args)
    if (this.name === HOME_SCHEMES_STORE)
      request.addEventListener('success', () => this.transaction.abort())
    return request
  })
  expect(await migrateHomeSchemeLibrary(handle(second))).toMatchObject({
    failedCount: 1,
    replacedCount: 0
  })
  spy.mockRestore()
  expect((await readHomeSchemeSnapshot()).records[0].name).toBe('原方案')
  expect(await migrateHomeSchemeLibrary(handle(second))).toMatchObject({
    replacedCount: 1,
    failedCount: 0
  })
})

it('retries tag overflow and does not reintroduce tags deleted after migration', async () => {
  await runStoreRequest(HOME_TAGS_STORE, 'readwrite', (store) =>
    store.put(
      Array.from({ length: 40 }, (_, i) => `T${i}`),
      'default'
    )
  )
  const source = album()
  source.home!.json('one.json', record('one', 'CODE1'))
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 0,
    failedCount: 2
  })
  await deleteHomeSchemeTag('T0')
  await deleteHomeSchemeTag('T1')
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 1,
    failedCount: 0
  })
  await deleteHomeSchemeTag('56455')
  await migrateHomeSchemeLibrary(handle(source))
  expect((await readHomeSchemeSnapshot()).tags).not.toContain('56455')
})

it('does not create home or tags.json when either is absent', async () => {
  const empty = new Directory()
  expect(await migrateHomeSchemeLibrary(handle(empty))).toMatchObject({
    addedCount: 0,
    failedCount: 0
  })
  expect(empty.home).toBeUndefined()
  empty.home = new Directory()
  empty.home.json('one.json', { ...record('one', 'CODE1'), tags: [] })
  expect(await migrateHomeSchemeLibrary(handle(empty))).toMatchObject({
    addedCount: 1,
    failedCount: 0
  })
  expect(empty.home).toBeUndefined()
})

it('retains the folder after cleanup permission failure and retries deletion without reimporting', async () => {
  const source = album()
  source.home!.json('one.json', record('one', 'CODE1'))
  const remove = vi
    .spyOn(source, 'removeEntry')
    .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 1,
    failedCount: 1,
    homeDirectoryRemoved: false
  })
  expect(source.home).toBeDefined()
  const snapshot = await readHomeSchemeSnapshot()
  expect(snapshot.records).toHaveLength(1)
  await deleteHomeScheme(snapshot.records[0])
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 0,
    replacedCount: 0,
    failedCount: 0,
    homeDirectoryRemoved: true
  })
  expect(remove).toHaveBeenCalledTimes(2)
  expect(source.home).toBeUndefined()
  expect((await readHomeSchemeSnapshot()).records).toHaveLength(0)
})

it('preserves unaccounted files until they are removed, then cleans an already migrated folder', async () => {
  const source = album()
  source.home!.json('one.json', record('one', 'CODE1'))
  source.home!.files.set('untracked.txt', new Blob(['keep']))
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 1,
    failedCount: 1,
    homeDirectoryRemoved: false
  })
  expect(await source.home!.files.get('untracked.txt')!.text()).toBe('keep')
  source.home!.files.delete('untracked.txt')
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 0,
    failedCount: 0,
    homeDirectoryRemoved: true
  })
})

it('retains files added during migration and migrates them before cleanup on retry', async () => {
  const source = album(),
    home = source.home!
  home.json('one.json', record('one', 'CODE1'))
  let scans = 0
  Object.defineProperty(home, 'onEntries', {
    configurable: true,
    writable: true,
    enumerable: false,
    value: () => {
      if (++scans === 3) home.json('two.json', record('two', 'CODE2'))
    }
  })
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 1,
    failedCount: 1,
    homeDirectoryRemoved: false
  })
  expect(source.home).toBeDefined()
  home.onEntries = undefined
  expect(await migrateHomeSchemeLibrary(handle(source))).toMatchObject({
    addedCount: 1,
    failedCount: 0,
    homeDirectoryRemoved: true
  })
  expect((await readHomeSchemeSnapshot()).records).toHaveLength(2)
})
