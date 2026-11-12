// @vitest-environment node
import 'fake-indexeddb/auto'
import { expect, it, vi } from 'vitest'
import {
  DB_NAME,
  DB_VERSION,
  isDatabaseVersionMismatch,
  openDb,
  subscribeDatabaseVersionMismatch
} from '../../src/utils/file-system/database'

it('does not downgrade, delete or mutate a newer IndexedDB, and notifies once', async () => {
  const request = indexedDB.open(DB_NAME, DB_VERSION + 1)
  request.onupgradeneeded = () => {
    request.result.createObjectStore('sentinel').put('preserved', 'entry')
  }
  const newer = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  newer.close()

  const notify = vi.fn()
  const unsubscribe = subscribeDatabaseVersionMismatch(notify)
  const failure = await openDb().catch((error: unknown) => error)
  expect(isDatabaseVersionMismatch(failure)).toBe(true)
  expect(failure).toMatchObject({ message: 'DATABASE_VERSION_MISMATCH' })
  expect(notify).toHaveBeenCalledTimes(1)
  await expect(openDb()).rejects.toThrow('DATABASE_VERSION_MISMATCH')
  expect(notify).toHaveBeenCalledTimes(1)
  unsubscribe()

  const latestRequest = indexedDB.open(DB_NAME)
  const latest = await new Promise<IDBDatabase>((resolve, reject) => {
    latestRequest.onsuccess = () => resolve(latestRequest.result)
    latestRequest.onerror = () => reject(latestRequest.error)
  })
  expect(latest.version).toBe(DB_VERSION + 1)
  expect(latest.objectStoreNames.contains('sentinel')).toBe(true)
  const preserved = await new Promise<string>((resolve, reject) => {
    const data = latest.transaction('sentinel').objectStore('sentinel').get('entry')
    data.onsuccess = () => resolve(data.result as string)
    data.onerror = () => reject(data.error)
  })
  expect(preserved).toBe('preserved')
  latest.close()
})
