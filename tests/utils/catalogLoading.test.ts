import { afterEach, expect, it, vi } from 'vitest'
import type { ResonanceRecord } from '../../src/utils/resonance/resonanceTypes'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

it('shares raw resource requests and keeps languages independently accessible', async () => {
  const { catalogResources, loadCatalogNames } =
    await import('../../src/utils/gongeo/catalogResources')
  const first = catalogResources.outfitItems()
  expect(catalogResources.outfitItems()).toBe(first)
  const parts = await first
  expect(parts.length).toBeGreaterThan(0)
  const [zh, en] = await Promise.all([
    loadCatalogNames('item', 'zh'),
    loadCatalogNames('item', 'en')
  ])
  expect(zh['item.1020100347.name']).toBeTruthy()
  expect(en['item.1020100347.name']).toBeTruthy()
  expect(zh['item.1020100347.name']).not.toBe(en['item.1020100347.name'])
})

it('retries a failed resonance catalog build and deduplicates concurrent construction', async () => {
  const { catalogResources } = await import('../../src/utils/gongeo/catalogResources')
  const original = catalogResources.outfits
  const load = vi
    .spyOn(catalogResources, 'outfits')
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(original)
  const { loadResonanceCatalog } = await import('../../src/utils/resonance/resonanceCatalog')
  const failed = loadResonanceCatalog()
  expect(loadResonanceCatalog()).toBe(failed)
  await expect(failed).rejects.toThrow('offline')
  const next = loadResonanceCatalog()
  expect(loadResonanceCatalog()).toBe(next)
  expect((await next).loadResonanceBanners().length).toBeGreaterThan(0)
  expect(load).toHaveBeenCalledTimes(2)
})

it('uses the first base outfit for variant names and images while retaining unmatched IDs', async () => {
  const resources = await import('../../src/utils/gongeo/catalogResources')
  const banners = await import('../../src/utils/resonance/resonanceBanners')
  const images = await import('../../src/utils/gongeo/catalogImage')
  vi.spyOn(resources.catalogResources, 'outfits').mockResolvedValue([
    [[10001, 1000104], 5],
    [[10002, 1000104], 5]
  ])
  vi.spyOn(resources.catalogResources, 'outfitItems').mockResolvedValue([
    [1000104, [1020100001]],
    [99999, [1020100002]]
  ])
  vi.spyOn(resources, 'loadCatalogNames').mockImplementation(
    async (kind, language): Promise<Record<string, string>> =>
      kind === 'outfit'
        ? {
            'outfit.10001.name': language === 'zh' ? '原始套装' : 'Base outfit',
            'outfit.10002.name': 'Later duplicate',
            'outfit.1000104.name': 'Variant name'
          }
        : {}
  )
  vi.spyOn(images, 'getCatalogRecordImage').mockImplementation((kind, id) => `${kind}/${id}`)
  vi.spyOn(banners, 'getBannerMeta').mockReturnValue({
    bannerId: 'test',
    bannerType: 1,
    name: { zh: '卡池', en: 'Banner' },
    startAt: '',
    endAt: '',
    outfit5StarIds: ['1000104', '99999'],
    outfit4StarIds: [],
    version: ''
  })
  const { loadResonanceCatalog } = await import('../../src/utils/resonance/resonanceCatalog')
  const catalog = await loadResonanceCatalog()
  const pulls = catalog.normalizeBannerPulls('test', [
    { itemId: '1020100001', pullsToObtain: 1 },
    { itemId: '1020100002', pullsToObtain: 2 }
  ])
  const records = catalog.buildResonanceRecords('test', pulls)
  expect(records[0]).toMatchObject({
    outfitId: '1000104',
    outfitName: { zh: '原始套装', en: 'Base outfit' },
    outfitImageUrl: 'outfit/10001'
  })
  expect(records[1]).toMatchObject({
    outfitId: '99999',
    outfitName: { zh: '99999', en: '99999' },
    outfitImageUrl: 'outfit/99999'
  })
})

it('round trips a standard resonance backup without importing its full catalog', async () => {
  const catalogImport = vi.fn(() => {
    throw new Error('Catalog must remain unloaded')
  })
  vi.doMock('../../src/utils/resonance/resonanceCatalog', catalogImport)
  try {
    const { createResonanceExport, parseResonanceFile } =
      await import('../../src/utils/resonance/resonanceFile')
    const records: ResonanceRecord[] = [
      {
        id: '77:10347',
        bannerId: '77',
        bannerName: { zh: '卡池', en: 'Banner' },
        bannerStartAt: '',
        outfitId: '10347',
        outfitName: { zh: '套装', en: 'Outfit' },
        rarity: 5 as const,
        outfitImageUrl: '',
        sets: [
          { setNumber: 1 as const, totalPulls: 0, parts: [] },
          { setNumber: 2 as const, totalPulls: 0, parts: [] }
        ]
      }
    ]
    expect((await parseResonanceFile(createResonanceExport(records))).records).toEqual(records)
    expect(catalogImport).not.toHaveBeenCalled()
  } finally {
    vi.doUnmock('../../src/utils/resonance/resonanceCatalog')
  }
})
