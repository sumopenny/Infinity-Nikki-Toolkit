// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { setupOutfitDatabaseTests, webp } from '../helpers/outfitDatabase'
import {
  DB_NAME,
  DB_VERSION,
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  openDb,
  runStoreRequest
} from '../../src/utils/file-system/database'
import {
  saveOutfit,
  saveOutfitTags,
  deleteOutfitTag,
  deleteOutfits,
  readOutfitCollection,
  readOutfitSnapshot,
  outfitTransaction
} from '../../src/utils/outfit/outfitStorage'
import { DuplicateOutfitCodeError } from '../../src/utils/outfit/outfitTypes'
setupOutfitDatabaseTests()
const input = (code = 'CODE1') => ({ imageFile: webp(), code, tag: null, note: '备注' })

it('lists healthy outfits without changing unreadable records or silently exporting them', async () => {
  const healthy = await saveOutfit(input('GOOD'))
  const missingImage = await saveOutfit(input('NOIMAGE'))
  const badTag = await saveOutfit(input('BADTAG'))
  await runStoreRequest(OUTFIT_IMAGES_STORE, 'readwrite', (store) => store.delete(missingImage.id))
  await runStoreRequest(OUTFITS_STORE, 'readwrite', (store) => {
    const read = store.get(badTag.id)
    read.onsuccess = () => store.put({ ...read.result, tags: ['旧标签'] })
    return store.put({ id: 'broken', version: 0 })
  })
  const result = await readOutfitCollection()
  expect(result.outfits.map((item) => item.id)).toEqual([healthy.id])
  expect(result.unreadableCount).toBe(3)
  expect(await runStoreRequest(OUTFITS_STORE, 'readonly', (store) => store.count())).toBe(4)
  await expect(readOutfitSnapshot()).rejects.toThrow('outfit_record_invalid')
})

it('upgrades version 7 without losing existing camera, home or resonance data', async () => {
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 7)
    r.onupgradeneeded = () => {
      for (const name of ['camera-favorites', 'home-schemes']) {
        const store = r.result.createObjectStore(name, { keyPath: 'id' })
        store.put({ id: name, code: name })
      }
      r.result.createObjectStore('resonance-records').put(['existing'], 'current-profile')
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
  for (const name of ['camera-favorites', 'home-schemes'])
    expect(await runStoreRequest(name, 'readonly', (store) => store.get(name))).toMatchObject({
      id: name
    })
  expect(
    await runStoreRequest('resonance-records', 'readonly', (store) => store.get('current-profile'))
  ).toEqual(['existing'])
})
it('allows multiple pending outfits but rejects duplicate codes even across concurrent writers', async () => {
  await saveOutfit(input(''))
  await saveOutfit(input(''))
  const results = await Promise.allSettled([saveOutfit(input(' A B C ')), saveOutfit(input('ABC'))])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(
    (results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason
  ).toBeInstanceOf(DuplicateOutfitCodeError)
  expect((await readOutfitSnapshot()).records).toHaveLength(3)
})
it('rejects changing a pending outfit to an existing code and preserves the image', async () => {
  await saveOutfit(input('EXISTS'))
  const pending = await saveOutfit(input(''))
  await expect(saveOutfit({ outfit: pending, code: 'EXISTS', tag: null })).rejects.toBeInstanceOf(
    DuplicateOutfitCodeError
  )
  expect(
    (await readOutfitSnapshot()).records.find((record) => record.id === pending.id)?.code
  ).toBe('')
})
it('retains creation order and notes when tags are removed, and rejects stale edits', async () => {
  await saveOutfitTags(['甜美'])
  const first = await saveOutfit({ ...input('FIRST'), tag: '甜美' })
  await saveOutfit(input('SECOND'))
  expect(await deleteOutfitTag('甜美')).toEqual({ tags: [], updatedCount: 1 })
  const records = (await readOutfitCollection()).outfits
  expect(records.find((record) => record.id === first.id)).toMatchObject({
    note: '备注',
    tags: [],
    createdAt: first.createdAt
  })
  await expect(
    saveOutfit({ outfit: first, code: 'FIRST', tag: null, note: '旧窗口' })
  ).rejects.toThrow('outfit_record_changed')
  const current = records.find((record) => record.id === first.id)!
  const saved = await saveOutfit({ outfit: current, code: 'FIRST', tag: null, note: '已修改' })
  expect(saved.createdAt).toBe(first.createdAt)
})
it('deletes records and images atomically and lifts only manually restored ignored codes', async () => {
  const first = await saveOutfit(input('FIRST')),
    second = await saveOutfit(input('SECOND'))
  expect((await deleteOutfits([first, second])).deleted).toHaveLength(2)
  let snapshot = await readOutfitSnapshot()
  expect(snapshot.images.size).toBe(0)
  expect(snapshot.ignoredCodes.sort()).toEqual(['FIRST', 'SECOND'])
  await saveOutfit(input('FIRST'))
  snapshot = await readOutfitSnapshot()
  expect(snapshot.ignoredCodes).toEqual(['SECOND'])
})
it('rolls back image and record writes if the transaction aborts after a successful request', async () => {
  await expect(
    outfitTransaction([OUTFITS_STORE, OUTFIT_IMAGES_STORE], 'readwrite', async (tx) => {
      tx.objectStore(OUTFIT_IMAGES_STORE).put({ id: 'one', blob: webp() })
      const request = tx.objectStore(OUTFITS_STORE).put({ id: 'one', codeKey: 'CODE1' })
      request.onsuccess = () => tx.abort()
    })
  ).rejects.toThrow()
  expect(await runStoreRequest(OUTFIT_IMAGES_STORE, 'readonly', (store) => store.count())).toBe(0)
  expect(await runStoreRequest(OUTFITS_STORE, 'readonly', (store) => store.count())).toBe(0)
})
it('loads images only on demand when displaying a global collection', async () => {
  await saveOutfit(input())
  const get = vi.spyOn(IDBObjectStore.prototype, 'get')
  const library = await readOutfitCollection()
  expect(
    get.mock.contexts.some((context) => (context as IDBObjectStore).name === OUTFIT_IMAGES_STORE)
  ).toBe(false)
  expect(await library.outfits[0].loadImageBlob!()).toBeInstanceOf(Blob)
})

// 模拟浏览器回退 PNG 且原图损坏，确认拒绝保存并保持数据库不变。
it('rejects invalid originals after a non-WebP encoding result', async () => {
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ drawImage() {} }),
      toBlob: (callback: BlobCallback) =>
        callback(
          new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
        )
    })
  })
  let failure: unknown
  try {
    await saveOutfit({
      ...input(),
      imageFile: new File(['jpeg'], 'test.jpg', { type: 'image/jpeg' })
    })
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(Error)
  expect((failure as Error).message).toContain('signature')
  expect((await readOutfitSnapshot()).records).toHaveLength(0)
})

it('reconnects once for a lost read transaction and preserves stored outfits', async () => {
  await saveOutfit(input('KEEP'))
  let attempts = 0
  const records = await outfitTransaction([OUTFITS_STORE], 'readonly', async (tx) => {
    if (++attempts === 1)
      throw new DOMException(
        'Connection to Indexed Database server lost. Refresh the page to try again',
        'UnknownError'
      )
    return await new Promise<unknown[]>((resolve, reject) => {
      const request = tx.objectStore(OUTFITS_STORE).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  })
  expect(attempts).toBe(2)
  expect(records).toHaveLength(1)
  expect((await readOutfitSnapshot()).records[0].code).toBe('KEEP')
})
it.each(['readonly', 'readwrite'] as const)(
  'bounds connection-loss retries for %s',
  async (mode) => {
    let attempts = 0
    await expect(
      outfitTransaction([OUTFITS_STORE], mode, async () => {
        attempts++
        throw new DOMException('Connection to Indexed Database server lost', 'UnknownError')
      })
    ).rejects.toThrow('Connection to Indexed Database server lost')
    expect(attempts).toBe(mode === 'readonly' ? 2 : 1)
  }
)
it('does not retry other database failures', async () => {
  let attempts = 0
  await expect(
    outfitTransaction([OUTFITS_STORE], 'readonly', async () => {
      attempts++
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
  ).rejects.toThrow('Storage full')
  expect(attempts).toBe(1)
})
