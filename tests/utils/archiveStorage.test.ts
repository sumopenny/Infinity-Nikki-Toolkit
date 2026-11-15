import { useLegacyJsonClone } from '../helpers/legacyJsonClone'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllBrowserData, runStoreRequest } from '../../src/utils/file-system/database'
import {
  readArchiveLocal,
  readArchiveLocalPreview,
  replaceArchiveLocal
} from '../../src/utils/cloud/archiveStorage'
import { saveResonanceRecords } from '../../src/utils/resonance/resonanceStorage'
import { updateWardrobe } from '../../src/utils/wardrobe/wardrobeStorage'
import { archiveSnapshot, resonanceFixture, wardrobeFixture } from '../fixtures/archiveCloud'

beforeEach(async () => {
  await clearAllBrowserData()
  await saveResonanceRecords([resonanceFixture('local')])
  await updateWardrobe(() => ({ ...wardrobeFixture(), regionScope: 'cn' }))
})
describe('archive local transaction', () => {
  it('replaces both modules without structuredClone and restores the wardrobe region', async () => {
    const legacyClone = useLegacyJsonClone()
    try {
      await replaceArchiveLocal(await readArchiveLocal(), archiveSnapshot(), [
        'resonance',
        'wardrobe'
      ])
      expect(await readArchiveLocal()).toMatchObject({
        resonance: [{ outfitId: 'cloud' }],
        wardrobe: { regionScope: 'global' }
      })
      expect(legacyClone).toHaveBeenCalled()
    } finally {
      legacyClone.mockRestore()
    }
  })
  it.each(['resonance', 'wardrobe'] as const)(
    'keeps both modules when the %s baseline changes',
    async (module) => {
      const original = await readArchiveLocal()
      if (module === 'resonance') await saveResonanceRecords([resonanceFixture('changed')])
      else await updateWardrobe((latest) => ({ ...latest, unknownSuitIds: ['999'] }))
      const changed = await readArchiveLocal()
      await expect(
        replaceArchiveLocal(original, archiveSnapshot(), ['resonance', 'wardrobe'])
      ).rejects.toThrow('LOCAL_CHANGED')
      expect(await readArchiveLocal()).toEqual(changed)
    }
  )
  it('rolls back the first put when the second store write fails', async () => {
    const original = await readArchiveLocal()
    const put = IDBObjectStore.prototype.put
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (this.name === 'wardrobe') throw new DOMException('quota', 'QuotaExceededError')
      return put.apply(this, args)
    })
    try {
      await expect(
        replaceArchiveLocal(original, archiveSnapshot(), ['resonance', 'wardrobe'])
      ).rejects.toThrow('quota')
    } finally {
      spy.mockRestore()
    }
    expect(await readArchiveLocal()).toEqual(original)
  })
  it('ignores changes to an unselected module and leaves its latest state intact', async () => {
    const original = await readArchiveLocal()
    await updateWardrobe((latest) => ({ ...latest, unknownSuitIds: ['999'] }))
    await replaceArchiveLocal(original, archiveSnapshot(), ['resonance'])
    expect(await readArchiveLocal()).toMatchObject({
      resonance: [{ outfitId: 'cloud' }],
      wardrobe: { regionScope: 'cn', unknownSuitIds: ['999'] }
    })
  })
  it.each(['resonance', 'wardrobe'] as const)(
    'isolates corrupt %s data without inventing an empty save',
    async (module) => {
      const store = module === 'resonance' ? 'resonance-records' : 'wardrobe'
      const key = module === 'resonance' ? 'current-profile' : 'current'
      await runStoreRequest(store, 'readwrite', (target) => target.put('corrupt', key))
      const other = module === 'resonance' ? 'wardrobe' : 'resonance'
      const preview = await readArchiveLocalPreview()
      expect(preview.data[module]).toBeUndefined()
      expect(preview.errors).toEqual({ [module]: 'INVALID_DATA' })
      expect(preview.data[other]).toBeDefined()
      await expect(readArchiveLocal()).rejects.toThrow('LOCAL_READ_FAILED')
      const baseline = await readArchiveLocal([other])
      await replaceArchiveLocal(baseline, archiveSnapshot(), [other])
      expect(await runStoreRequest(store, 'readonly', (target) => target.get(key))).toBe('corrupt')
    }
  )
  it('rejects a real database failure rather than reporting partial module data', async () => {
    const transaction = vi
      .spyOn(IDBDatabase.prototype, 'transaction')
      .mockImplementationOnce(() => {
        throw new DOMException('storage unavailable', 'InvalidStateError')
      })
    try {
      await expect(readArchiveLocalPreview()).rejects.toThrow('storage unavailable')
    } finally {
      transaction.mockRestore()
    }
  })
  it('restores a valid empty wardrobe with its cloud region', async () => {
    const incoming = archiveSnapshot()
    incoming.wardrobe!.data = { ...wardrobeFixture(), entries: {}, unknownSuitIds: [] }
    await replaceArchiveLocal(await readArchiveLocal(), incoming, ['wardrobe'])
    expect((await readArchiveLocal()).wardrobe).toMatchObject({
      entries: {},
      unknownSuitIds: [],
      regionScope: 'global'
    })
  })
})
