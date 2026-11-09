import { getCatalogImageSource } from '../../src/utils/gongeo/catalogImage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearOutfitDetailCache, loadOutfitDetail } from '../../src/utils/outfit/outfitDetails'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const sampleDyes = [
  { targetGroupId: 1, featureTag: 1, paletteId: 18, slot: 3, color: '#9e463e' },
  { targetGroupId: 1, featureTag: 1, paletteId: 18, slot: 3, color: '#9e463e' },
  { targetGroupId: 1, featureTag: 3, paletteId: 18, slot: 3, color: '#553322' }
]

afterEach(() => {
  clearOutfitDetailCache()
  vi.unstubAllGlobals()
})

describe('loadOutfitDetail', () => {
  it('uses the part-to-outfit relation and maps palette, area, dye stage, and variant', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 10001 }))
    vi.stubGlobal('fetch', fetchMock)

    const detail = await loadOutfitDetail(1020100001, 10347, 'zh', '时光讯号-发型', sampleDyes)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(detail.outfitId).toBe(10001)
    expect(detail.outfitName).toBe('绽响黎明前')
    expect(detail.detailImageUrl).toBe(getCatalogImageSource('item', 1020100001))
    expect(detail.outfitImageUrl).toBe(getCatalogImageSource('outfit', 10001))
    expect(detail.outfitItemIds).toContain(1020100001)
    expect(detail.evolution).toBe('原套')
    expect(detail.dyeCondition).toBe('一进可染')
    expect(detail.dyes).toHaveLength(3)
    expect(detail.dyes[0]).toMatchObject({ area: '区域 01', paletteName: '名流鸦盛宴', slot: 3 })
    expect(detail.dyes[2].area).toBe('区域 02')
  })

  it('keeps the parsed item on the matching evolution outfit when the payload outfit is the base ID', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 1034701 }))
    vi.stubGlobal('fetch', fetchMock)

    const detail = await loadOutfitDetail(1022100347, 10347, 'zh', '如果爱上一朵花-发型', [])

    expect(fetchMock).not.toHaveBeenCalled()
    expect(detail.outfitId).toBe(1034701)
    expect(detail.outfitName).toBe('如果爱上一朵花·青涩')
    expect(detail.evolution).toBe('焕新')
    expect(detail.outfitItemIds).toContain(1022100347)
  })

  it('labels negative dye palettes as sliders', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 1020100001 })))

    const detail = await loadOutfitDetail(1020100001, null, 'zh', '时光讯号-发型', [
      { targetGroupId: 1, featureTag: 3, paletteId: -1, slot: null, color: '#bcbcbc' }
    ])

    expect(detail.dyes[0]).toMatchObject({ paletteId: -1, paletteName: '拉条' })
  })

  it('uses the full-evolution condition when a special effect is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 1025740294 })))

    const detail = await loadOutfitDetail(
      1025740294,
      null,
      'zh',
      '童话终章',
      [
        { targetGroupId: 1, featureTag: 1, paletteId: 11, slot: 1, color: '#2c646a' },
        { targetGroupId: 2, featureTag: 1, paletteId: 16, slot: 8, color: '#f7b3dc' }
      ],
      null,
      true
    )

    expect(detail.dyeCondition).toBe('满进可染')
  })

  it('keeps non-primary dye feature tags on their upstream target group area', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 1020100250 })))

    const detail = await loadOutfitDetail(1020100250, null, 'zh', '测试部件', [
      { targetGroupId: 3, featureTag: 6, paletteId: 18, slot: 3, color: '#9e463e' }
    ])

    expect(detail.dyes[0].area).toBe('区域 03')
  })

  it('uses the exact flower-part area catalog so primary and secondary regions do not overlap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 1025900347 })))

    const dyes = [
      ...Array.from({ length: 12 }, (_, index) => ({
        targetGroupId: index + 1,
        featureTag: 1,
        paletteId: 18,
        slot: null,
        color: `#${String(index + 1).padStart(2, '0')}0000`
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        targetGroupId: index + 1,
        featureTag: 3,
        paletteId: 17,
        slot: null,
        color: `#00${String(index + 1).padStart(2, '0')}00`
      }))
    ]

    const detail = await loadOutfitDetail(1025900347, null, 'zh', '如果有朵花', dyes)
    const areas = detail.dyes.map((dye) => dye.area)

    expect(new Set(areas).size).toBe(areas.length)
    expect(areas).toEqual(
      Array.from({ length: 20 }, (_, index) => `区域 ${String(index + 1).padStart(2, '0')}`)
    )
  })

  it('caches the same detail request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 10001 }))
    vi.stubGlobal('fetch', fetchMock)
    const first = loadOutfitDetail(1020100001, 10001, 'en', 'Signal of Time-Hair', [])
    const second = loadOutfitDetail(1020100001, 10001, 'en', 'Signal of Time-Hair', [])
    expect(await first).toBe(await second)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps local details available while offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const detail = await loadOutfitDetail(1020100001, null, 'zh', '时光讯号-发型', [])
    expect(detail.loadError).toBe(false)
    expect(detail.itemName).toBe('时光讯号-发型')
    expect(detail.dyes).toEqual([])
  })

  it('does not present an item name as an outfit when no catalog relation exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 1020200490 })))
    const detail = await loadOutfitDetail(1020200490, 10490, 'zh', '暮巷赤影-披肩', [])
    expect(detail.outfitId).toBeNull()
    expect(detail.outfitName).toBe('')
    expect(detail.outfitImageUrl).toBeNull()
    expect(detail.loadError).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps unrelated makeup details fully local without requesting unused entity data', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      return url.includes('/makeups/')
        ? jsonResponse({ id: 1021850019 })
        : jsonResponse({ id: 10015002 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const detail = await loadOutfitDetail(1021850019, null, 'zh', '妆容-唇妆', [], null)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(detail.outfitName).toBe('')
    expect(detail.detailImageUrl).toBe(getCatalogImageSource('item', 1021850019))
    expect(detail.loadError).toBe(false)
  })

  it('resolves a makeup outfit through makeup item and makeup outfit relations', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      return url.includes('/outfits/')
        ? jsonResponse({ id: 10001 })
        : jsonResponse({ id: 1021810001 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const detail = await loadOutfitDetail(1020810001, null, 'zh', '妆容-全妆', [], null)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(detail.outfitId).toBe(10001)
    expect(detail.outfitImageUrl).toBe(getCatalogImageSource('outfit', 10001))
    expect(detail.dyeCondition).toBe('无')
    expect(detail.loadError).toBe(false)
  })

  it('does not fetch individual makeup entities when cloth types are absent', async () => {
    const itemIds = [1021850019, 1021810010, 1025820301, 1020830355, 1020840239]
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const id = Number(url.match(/\/(?:makeups|outfits)\/(\d+)/)?.[1])
      return jsonResponse({ id })
    })
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all(
      itemIds.map((itemId) => loadOutfitDetail(itemId, null, 'zh', String(itemId), [], null))
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// 英文详情复用双语区域标题，避免中文标签混入解析结果。
it('localizes dye area names in English details', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 1020100001 })))
  const detail = await loadOutfitDetail(1020100001, null, 'en', 'Hair', [
    { targetGroupId: 1, featureTag: 1, paletteId: 18, slot: 3, color: '#9e463e' }
  ])
  expect(detail.dyes[0].area).toBe('Area 01')
})

it('builds complete local details without requesting the remote API', async () => {
  const fetcher = vi.fn(() => {
    throw new Error('Remote API must not be needed')
  })
  vi.stubGlobal('fetch', fetcher)
  const detail = await loadOutfitDetail(1025740294, null, 'zh', '童话终章', [], null, true)
  expect(detail.itemName).toBe('童话终章')
  expect(detail.detailImageUrl).toBe(getCatalogImageSource('item', 1025740294))
  expect(detail.dyeCondition).toBe('满进可染')
  expect(detail.loadError).toBe(false)
  expect(fetcher).not.toHaveBeenCalled()
})

it.each([null, 1011702, 1011703, 1011704])(
  'keeps exact membership with sparse variants (payload %s)',
  async (payload) => {
    const detail = await loadOutfitDetail(1023100117, payload, 'zh', '部件', [])
    expect(detail.loadError).toBe(false)
    expect(detail.outfitId).toBe(1011702)
    expect(detail.outfitItemIds).toContain(1023100117)
    expect(detail.evolution).toBe('1进')
  }
)
