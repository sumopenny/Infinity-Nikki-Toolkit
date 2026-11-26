import { closeDatabase } from '../../src/utils/file-system/database'
// @vitest-environment node
import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import {
  DB_NAME,
  openDb,
  runStoreRequest,
  clearAllBrowserData
} from '../../src/utils/file-system/database'
import {
  getSavedPhotoActionCaches,
  savePhotoActionCache,
  savePhotoActionCaches,
  clearSavedParseCaches
} from '../../src/utils/file-system/directoryStorage'
import {
  loadResonanceRecords,
  saveResonanceRecords
} from '../../src/utils/resonance/resonanceStorage'
afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    closeDatabase()
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})
it('rejects a write whose request succeeds but whose transaction aborts', async () => {
  await expect(
    runStoreRequest('local-state', 'readwrite', async (store) => {
      const result = await store.put('new', 'value')
      store.transaction.abort()
      return result
    })
  ).rejects.toThrow()
  expect(
    await runStoreRequest('local-state', 'readonly', (store) => store.get('value'))
  ).toBeUndefined()
})
it('propagates failed or malformed resonance reads instead of returning an empty profile', async () => {
  expect(await loadResonanceRecords()).toEqual([])
  await runStoreRequest('resonance-records', 'readwrite', (store) =>
    store.put({ damaged: true }, 'current-profile')
  )
  await expect(loadResonanceRecords()).rejects.toThrow('Invalid resonance storage')
})
it('clears every store including collections, images and saved source handles', async () => {
  const db = await openDb()
  const names = [...db.objectStoreNames]
  db.close()
  for (const name of names) {
    await runStoreRequest(name, 'readwrite', (store) => {
      if (Array.isArray(store.keyPath))
        return store.put(Object.fromEntries(store.keyPath.map((key) => [key, 'one'])))
      return store.keyPath ? store.put({ [store.keyPath]: 'one' }) : store.put('data', 'one')
    })
  }
  await clearAllBrowserData()
  for (const name of names)
    expect(await runStoreRequest(name, 'readonly', (store) => store.getAll())).toEqual([])
})
it('cache clearing preserves UID, directory authorization, favorites and resonance records', async () => {
  const entries = [
    ['outfit-code-parse:v1:old', 'cache'],
    ['outfit-code-parse:v2:new', 'cache'],
    ['home-scheme-parse:code', 'cache'],
    ['photo-action-parse:v1:album:name', 'cache'],
    ['current-camera-param-uids', ['123']],
    ['current-album-directory', { name: 'album' }]
  ] as const
  for (const [key, value] of entries)
    await runStoreRequest('local-state', 'readwrite', (store) => store.put(value, key))
  await saveResonanceRecords([])
  await runStoreRequest('camera-params', 'readwrite', (store) => store.put({ id: 'saved' }))
  const transactions = vi.spyOn(IDBDatabase.prototype, 'transaction')
  await clearSavedParseCaches()
  expect(transactions).toHaveBeenCalledTimes(1)
  transactions.mockRestore()
  expect(await runStoreRequest('local-state', 'readonly', (store) => store.getAllKeys())).toEqual([
    'current-album-directory',
    'current-camera-param-uids'
  ])
  expect(await runStoreRequest('camera-params', 'readonly', (store) => store.count())).toBe(1)
  expect(await runStoreRequest('resonance-records', 'readonly', (store) => store.count())).toBe(1)
})

it('loads one album cache in a single transaction with encoded names', async () => {
  const entry = {
    fingerprint: 'f',
    parserVersion: 'v',
    catalogVersion: 'c',
    status: 'none' as const,
    parsedAt: 1
  }
  await savePhotoActionCaches('album:中文', [
    ['a:b.jpg', entry],
    ['c.jpg', entry]
  ])
  await savePhotoActionCache('another', 'a:b.jpg', entry)
  const result = await getSavedPhotoActionCaches('album:中文')
  expect([...result.keys()]).toEqual(['a:b.jpg', 'c.jpg'])
  expect(result.get('a:b.jpg')).toEqual(entry)
})

it('rolls back all cleared stores if one store cannot be cleared', async () => {
  await runStoreRequest('local-state', 'readwrite', (store) => store.put('saved', 'one'))
  await runStoreRequest('resonance-records', 'readwrite', (store) => store.put('saved', 'one'))
  const original = IDBObjectStore.prototype.clear
  const failure = vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (
    this: IDBObjectStore
  ) {
    if (this.name === 'resonance-records') throw new Error('reset failed')
    return original.call(this)
  })
  try {
    await expect(clearAllBrowserData()).rejects.toThrow('reset failed')
  } finally {
    failure.mockRestore()
  }
  expect(await runStoreRequest('local-state', 'readonly', (store) => store.get('one'))).toBe(
    'saved'
  )
  expect(await runStoreRequest('resonance-records', 'readonly', (store) => store.get('one'))).toBe(
    'saved'
  )
})
