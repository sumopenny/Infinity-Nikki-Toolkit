import 'fake-indexeddb/auto'
import { DB_VERSION, runStoreRequest } from '../../src/utils/file-system/database'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadResonanceRecords,
  mergeResonanceRecords,
  saveResonanceRecords
} from '../../src/utils/resonance/resonanceStorage'
import type { ResonanceRecord } from '../../src/utils/resonance/resonanceTypes'

const dbName = 'infinity-nikki-album-manager'

afterEach(async () => {
  vi.restoreAllMocks()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(dbName)
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
})

const record: ResonanceRecord = {
  id: 'record-1',
  bannerId: 'banner-1',
  bannerName: { zh: 'Dream Banner', en: 'Dream Banner' },
  bannerStartAt: '2026-10-01T00:00:00.000Z',
  outfitId: 'outfit-1',
  outfitName: { zh: 'Example Outfit', en: 'Example Outfit' },
  rarity: 5,
  outfitImageUrl: '/outfit.png',
  sets: [
    {
      setNumber: 1,
      totalPulls: 20,
      parts: [
        { id: 'part-1', name: { zh: 'Piece', en: 'Piece' }, imageUrl: '/part.png', pullNumber: 20 }
      ]
    },
    {
      setNumber: 2,
      totalPulls: 0,
      parts: [
        { id: 'part-1', name: { zh: 'Piece', en: 'Piece' }, imageUrl: '/part.png', pullNumber: 0 }
      ]
    }
  ]
}

describe('resonanceStorage', () => {
  it('snapshots nested import data when structuredClone is unavailable', async () => {
    const input = structuredClone(record)
    vi.stubGlobal('structuredClone', undefined)
    let pending: Promise<ResonanceRecord[]>
    try {
      pending = mergeResonanceRecords([input])
      input.sets[0].parts[0]!.name.en = 'changed after import started'
    } finally {
      vi.unstubAllGlobals()
    }
    await expect(pending).resolves.toEqual([record])
    await expect(loadResonanceRecords()).resolves.toEqual([record])
  })
  it('adds the resonance store to the shared database without replacing the album handle store', async () => {
    const albumDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, 3)
      request.onupgradeneeded = () => request.result.createObjectStore('album-handles')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    albumDb.close()

    await saveResonanceRecords([record])
    await expect(loadResonanceRecords()).resolves.toEqual([record])

    const upgradedDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_VERSION)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const names = [...upgradedDb.objectStoreNames]
    upgradedDb.close()
    expect(names).toEqual(
      expect.arrayContaining([
        'album-handles',
        'camera-favorite-covers',
        'camera-favorite-tags',
        'camera-favorites',
        'resonance-records'
      ])
    )
  })

  it('returns an empty list before a snapshot exists', async () => {
    await expect(loadResonanceRecords()).resolves.toEqual([])
  })

  it('replaces all records and fixes the input snapshot before saving', async () => {
    await saveResonanceRecords([record, { ...record, id: 'old-only' }])
    const incoming = [{ ...record, outfitName: { zh: '新记录', en: 'New record' } }]
    const saving = saveResonanceRecords(incoming)
    incoming.length = 0
    await saving
    expect(await loadResonanceRecords()).toEqual([
      { ...record, outfitName: { zh: '新记录', en: 'New record' } }
    ])
  })

  it('merges concurrent imports using the latest committed records', async () => {
    const first = { ...record, id: 'first' },
      second = { ...record, id: 'second' }
    await Promise.all([mergeResonanceRecords([first]), mergeResonanceRecords([second])])
    expect((await loadResonanceRecords()).map((item) => item.id).sort()).toEqual([
      'first',
      'second'
    ])
    const updated = { ...first, outfitName: { zh: '更新', en: 'Updated' } }
    expect(await mergeResonanceRecords([updated])).toEqual([updated, second])
  })

  it('does not resurrect cleared records and treats empty imports as a no-op', async () => {
    await saveResonanceRecords([record])
    await saveResonanceRecords([])
    const incoming = { ...record, id: 'new' }
    expect(await mergeResonanceRecords([incoming])).toEqual([incoming])
    expect(await mergeResonanceRecords([])).toEqual([incoming])
  })

  it('rejects damaged storage instead of replacing it during import', async () => {
    await runStoreRequest('resonance-records', 'readwrite', (store) =>
      store.put('broken', 'current-profile')
    )
    await expect(mergeResonanceRecords([record])).rejects.toThrow('Invalid resonance storage')
    expect(
      await runStoreRequest('resonance-records', 'readonly', (store) =>
        store.get('current-profile')
      )
    ).toBe('broken')
  })

  it('reports transaction failure after put success without changing existing records', async () => {
    await saveResonanceRecords([record])
    const original = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      const request = original.apply(this, args)
      if (this.name === 'resonance-records')
        request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    await expect(saveResonanceRecords([{ ...record, id: 'new' }])).rejects.toThrow()
    expect(await loadResonanceRecords()).toEqual([record])
  })
})
