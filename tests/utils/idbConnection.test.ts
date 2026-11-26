import 'fake-indexeddb/auto'
import { forceCloseDatabase } from 'fake-indexeddb'
import { unwrap } from 'idb'
import { afterEach, expect, it, vi } from 'vitest'
import {
  DB_NAME,
  DB_VERSION,
  closeDatabase,
  getDatabase,
  runStoreRequest
} from '../../src/utils/file-system/database'
import { runDatabaseTransaction } from '../../src/utils/file-system/transaction'
import { markConfirmedDeletion } from '../../src/utils/directory-backup/changeJournal'

function nativeOpen(version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
function removeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Leaked database connection'))
  })
}
afterEach(async () => {
  vi.restoreAllMocks()
  closeDatabase()
  await removeDatabase()
})
it('shares concurrent opens and reuses the connection across completed transactions', async () => {
  const open = vi.spyOn(indexedDB, 'open')
  const [first, second] = await Promise.all([getDatabase(), getDatabase()])
  expect(first).toBe(second)
  await runStoreRequest('local-state', 'readwrite', (store) => store.put('saved', 'key'))
  expect(await runStoreRequest('local-state', 'readonly', (store) => store.get('key'))).toBe(
    'saved'
  )
  expect(open).toHaveBeenCalledTimes(1)
  expect(first.objectStoreNames.length).toBe(17)
  closeDatabase()
  expect(await getDatabase()).not.toBe(first)
})
it('reopens after abnormal termination without losing committed data', async () => {
  await runStoreRequest('local-state', 'readwrite', (store) => store.put('saved', 'key'))
  const first = await getDatabase()
  // fake-indexeddb 6.2 declares a constructor here, but the helper accepts a database instance.
  const terminate = forceCloseDatabase as unknown as (database: IDBDatabase) => void
  terminate(unwrap(first))
  expect(await getDatabase()).not.toBe(first)
  expect(await runStoreRequest('local-state', 'readonly', (store) => store.get('key'))).toBe(
    'saved'
  )
})
it('clears a rejected opening promise so the next request can retry', async () => {
  vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
    throw new DOMException('Unavailable', 'SecurityError')
  })
  await expect(getDatabase()).rejects.toThrow('Unavailable')
  expect((await getDatabase()).version).toBe(DB_VERSION)
})
it('releases an old connection on version change and never resets a newer database', async () => {
  await getDatabase()
  const newer = await nativeOpen(DB_VERSION + 1)
  newer.close()
  const deletion = vi.spyOn(indexedDB, 'deleteDatabase')
  await expect(getDatabase()).rejects.toThrow('DATABASE_VERSION_MISMATCH')
  expect(deletion).not.toHaveBeenCalled()
})
it('reports blocked upgrades and closes the connection that arrives after rejection', async () => {
  const blocker = await nativeOpen(1)
  await expect(getDatabase()).rejects.toThrow('数据库升级被其他页面占用')
  blocker.close()
  // Queued after the blocked upgrade: a leaked late connection would block deletion.
  await removeDatabase()
  expect((await getDatabase()).version).toBe(DB_VERSION)
})
it('keeps the last journal operation when a delete and replacement are queued together', async () => {
  await runStoreRequest('directory-backup-state', 'readwrite', (store) =>
    store.put({ key: 'config', enabled: { camera: true } })
  )
  await runDatabaseTransaction(['camera-params'], 'readwrite', async (tx) => {
    markConfirmedDeletion(tx, 'camera')
    const records = tx.objectStore('camera-params')
    await Promise.all([records.delete('same'), records.put({ id: 'same', code: 'new' })])
  })
  const change = await runStoreRequest('directory-backup-changes', 'readonly', (store) =>
    store.get(['camera', 'record', 'same'])
  )
  expect(change).toBeDefined()
  expect(change.intent).toBeUndefined()
  expect(await runStoreRequest('camera-params', 'readonly', (store) => store.get('same'))).toEqual({
    id: 'same',
    code: 'new'
  })
})
it('rolls back business writes when the journal cannot be written', async () => {
  await runStoreRequest('directory-backup-state', 'readwrite', (store) =>
    store.put({ key: 'config', enabled: { camera: true } })
  )
  const put = IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    if (this.name === 'directory-backup-changes')
      throw new DOMException('Full', 'QuotaExceededError')
    return put.apply(this, args)
  })
  await expect(
    runStoreRequest('camera-params', 'readwrite', (store) => store.put({ id: 'one', code: 'one' }))
  ).rejects.toThrow('Full')
  expect(await runStoreRequest('camera-params', 'readonly', (store) => store.count())).toBe(0)
  expect(
    await runStoreRequest('directory-backup-state', 'readonly', (store) =>
      store.get('revision:camera')
    )
  ).toBeUndefined()
})

it('rejects a cancelled opening instead of handing out a closed connection', async () => {
  const pending = getDatabase()
  closeDatabase()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  const next = await getDatabase()
  expect(next.version).toBe(DB_VERSION)
  expect(await runStoreRequest('local-state', 'readonly', (store) => store.count())).toBe(0)
})
