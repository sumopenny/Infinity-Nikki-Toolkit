import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import outfitItems from '../../src/data/gongeo/outfitItems.json'
import {
  loadResonanceCatalog,
  type ResonanceCatalog
} from '../../src/utils/resonance/resonanceCatalog'
import { loadResonanceBanners } from '../../src/utils/resonance/resonanceBanners'
import { sortResonanceParts, sortResonanceRecords } from '../../src/utils/resonance/resonanceView'
let buildResonanceRecords: ResonanceCatalog['buildResonanceRecords']
let normalizeBannerPulls: ResonanceCatalog['normalizeBannerPulls']
beforeAll(async () => {
  ;({ buildResonanceRecords, normalizeBannerPulls } = await loadResonanceCatalog())
})
import {
  parsePearpalResonance,
  fetchPearpalSnapshot,
  PEARPAL_AUTH_FAILED,
  PEARPAL_REGION_MISMATCH,
  PEARPAL_NO_RECORDS,
  PEARPAL_UID_MISMATCH
} from '../../src/utils/resonance/resonanceImport'
import { decodePearpal } from '../../src/utils/resonance/resonancePearpalData'
import {
  parseResonanceCookie,
  resonanceBookmarkScript,
  resonanceConsoleScript
} from '../../src/utils/resonance/resonanceScripts'
import { encodeSnappyLiteral } from './resonanceSnappyFixture'
import type { PearpalRegion } from '../../src/utils/resonance/pearpalRegions'

const HAIR = '1020100347'
const BANNER_TWO_ITEM = '1020100126'
const CREDENTIALS = { token: 'test-token', roleid: '123456', id: 'test-openid' }
const outfitParts = (outfitId: string) => {
  const entry = (outfitItems as unknown as Array<[number, number[]]>).find(
    ([id]) => String(id) === outfitId
  )
  return entry?.[1].map(String) ?? []
}

afterEach(() => vi.unstubAllGlobals())

describe('resonance catalog', () => {
  it('loads bilingual banner names in descending banner ID order', () => {
    const banners = loadResonanceBanners()
    expect(banners.length).toBeGreaterThan(0)
    const ids = banners.map((banner) => Number(banner.bannerId))
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
    for (const banner of banners) {
      expect(banner.name.zh).toEqual(expect.any(String))
      expect(banner.name.en).toEqual(expect.any(String))
      expect(banner.name.zh.trim()).not.toBe('')
      expect(banner.name.en.trim()).not.toBe('')
    }
  })

  it('creates bilingual outfit and piece names from stable catalog IDs', () => {
    const pulls = normalizeBannerPulls('77', [{ itemId: HAIR, pullsToObtain: 18 }])
    const record = buildResonanceRecords('77', pulls).find((item) => item.outfitId === '10347')
    const part = record?.sets[0].parts.find((item) => item.id === HAIR)
    expect(part?.imageUrl).toBe(`https://cdn.gongeo.us/images/items/icons/${HAIR}.png`)
    expect(record?.outfitName.zh).not.toBe(record?.outfitName.en)
    expect(part?.name.zh).not.toBe(part?.name.en)
    expect(record?.bannerName.zh).not.toBe(record?.bannerName.en)
  })

  it('sorts outfits like the tracker: newer banner ID, then catalog 5-star and 4-star order', () => {
    const pulls = normalizeBannerPulls('77', [
      { itemId: HAIR, pullsToObtain: 18 },
      { itemId: '1020100343', pullsToObtain: 9 }
    ])
    const records = buildResonanceRecords('77', pulls)
    const older = { ...records[0]!, id: '2:10126', bannerId: '2', outfitId: '10126' }
    expect(
      sortResonanceRecords([older, records[1]!, records[0]!]).map((record) => record.id)
    ).toEqual(['77:10347', '77:10343', '2:10126'])
  })

  it('filters rarity independently of banner order', () => {
    const five = {
      id: '77:five',
      bannerId: '77',
      outfitId: 'five',
      rarity: 5 as const
    } as ReturnType<typeof buildResonanceRecords>[number]
    const four = {
      id: '76:four',
      bannerId: '76',
      outfitId: 'four',
      rarity: 4 as const
    } as ReturnType<typeof buildResonanceRecords>[number]
    expect(sortResonanceRecords([five, four], 'oldest', 5).map((record) => record.id)).toEqual([
      '77:five'
    ])
    expect(sortResonanceRecords([five, four], 'newest', 4).map((record) => record.id)).toEqual([
      '76:four'
    ])
  })
})

describe('normalizeBannerPulls', () => {
  it('uses the first two occurrences of each piece for the first and second sets', () => {
    const ids = outfitParts('10347')
    expect(ids.length).toBeGreaterThan(1)
    const chronological = [ids[0]!, ids[0]!, ...ids.slice(1), ids[0]!]
    const newestFirst = chronological
      .map((itemId, index) => ({ itemId, pullsToObtain: index + 1 }))
      .reverse()
    const pulls = normalizeBannerPulls('77', newestFirst)
    const firstSet = pulls.filter((pull) => pull.setNumber === 1)
    const secondSet = pulls.filter((pull) => pull.setNumber === 2)

    expect(firstSet).toHaveLength(ids.length)
    expect(secondSet).toHaveLength(1)
    expect(secondSet[0]?.itemId).toBe(ids[0])
    expect(secondSet[0]?.pullNumber).toBe(2)

    const record = buildResonanceRecords('77', pulls).find((item) => item.outfitId === '10347')
    expect(record?.sets[0].parts.find((part) => part.id === ids[0])?.pullNumber).toBe(1)
    expect(record?.sets[1].parts.find((part) => part.id === ids[0])?.pullNumber).toBe(2)
    expect(record?.sets[0].totalPulls).toBe(
      1 + ids.slice(1).reduce((sum, _, index) => sum + index + 3, 0)
    )
    expect(record?.sets[1].totalPulls).toBe(2)
  })

  it('uses Pearpal pity counts and skips unknown result IDs without fabricating records', () => {
    const pulls = normalizeBannerPulls('77', [{ itemId: HAIR, pullsToObtain: 73 }])
    const records = buildResonanceRecords('77', pulls)
    const record = records.find((item) => item.outfitId === '10347')
    expect(record?.sets[0].parts.find((part) => part.id === HAIR)?.pullNumber).toBe(73)
    expect(records.some((item) => item.sets[0].parts.every((part) => part.pullNumber === 0))).toBe(
      false
    )
    expect(normalizeBannerPulls('77', [{ itemId: '9999999999' }])).toEqual([])
  })

  it('uses pool_cnt for cumulative pulls when notebook rows have gaps', () => {
    const pulls = normalizeBannerPulls('77', [{ itemId: HAIR, poolCount: 42, pullsToObtain: 18 }])
    expect(pulls[0]?.pullNumber).toBe(43)
    const record = buildResonanceRecords('77', pulls).find((item) => item.outfitId === '10347')
    expect(record?.sets[0].totalPulls).toBe(18)
    expect(record?.sets[0].parts.find((part) => part.id === HAIR)?.pullNumber).toBe(18)
  })

  it('orders each set by latest acquisition first and keeps missing pieces at the end', () => {
    const [first, second] = outfitParts('10347')
    const pulls = normalizeBannerPulls('77', [
      { itemId: second, poolCount: 30, pullsToObtain: 4 },
      { itemId: first, poolCount: 20, pullsToObtain: 5 },
      { itemId: first, poolCount: 10, pullsToObtain: 6 },
      { itemId: second, poolCount: 5, pullsToObtain: 7 }
    ])
    const record = buildResonanceRecords('77', pulls).find((item) => item.outfitId === '10347')!
    expect(
      sortResonanceParts(record.sets[0].parts)
        .slice(0, 2)
        .map((part) => part.id)
    ).toEqual([first, second])
    expect(
      sortResonanceParts(record.sets[1].parts)
        .slice(0, 2)
        .map((part) => part.id)
    ).toEqual([second, first])
    expect(
      sortResonanceParts(record.sets[0].parts)
        .slice(2)
        .every((part) => part.pullNumber === 0)
    ).toBe(true)
    expect(
      sortResonanceParts(record.sets[0].parts)
        .slice(2)
        .map((part) => part.id)
    ).toEqual(outfitParts('10347').slice(2))
  })

  it('keeps legacy owned order and treats manual pieces as obtained', () => {
    const [first, second, third] = outfitParts('10347')
    const record = buildResonanceRecords('77', normalizeBannerPulls('77', [{ itemId: first }]))[0]!
    const legacy = [
      { ...record.sets[0].parts.find((part) => part.id === first)!, acquisitionOrder: undefined },
      {
        ...record.sets[0].parts.find((part) => part.id === second)!,
        manual: true,
        acquisitionOrder: undefined
      },
      { ...record.sets[0].parts.find((part) => part.id === third)!, acquisitionOrder: undefined }
    ]
    expect(sortResonanceParts([legacy[2]!, legacy[0]!, legacy[1]!]).map((part) => part.id)).toEqual(
      [first, second, third]
    )
  })

  it('rejects unknown banners', () => {
    expect(() => normalizeBannerPulls('99999', [])).toThrow()
  })
})

describe('Pearpal import', () => {
  it('verifies the pasted UID before requesting and decoding the Snappy notebook', async () => {
    const compressed = encodeSnappyLiteral(
      JSON.stringify({
        info_from_self: {
          gacha_list: [
            {
              card_pool_id: 77,
              pool_cnt: 1,
              result: HAIR,
              rarity: 5,
              times_from_last_five_stars: 17
            },
            { card_pool_id: 77, pool_cnt: 2, result: HAIR, rarity: 5 },
            {
              card_pool_id: 77,
              pool_cnt: 99,
              result: '9999999999',
              rarity: 4,
              times_from_last_four_stars: 0
            }
          ]
        }
      })
    )
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input), 'https://local.test')
      if (url.searchParams.get('action') === 'verify') {
        return Response.json(
          { code: 0, data: { role: { uid: 123456, zone_id: 1 } } },
          { headers: { 'cache-control': 'no-store' } }
        )
      }
      return new Response(compressed.buffer as ArrayBuffer, {
        headers: { 'cache-control': 'no-store', 'content-type': 'application/octet-stream' }
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const decoded = await fetchPearpalSnapshot(CREDENTIALS)
    const result = await parsePearpalResonance(
      decoded as Parameters<typeof parsePearpalResonance>[0]
    )
    const record = result.records.find((item) => item.outfitId === '10347')
    expect(result.skippedPools).toBe(0)
    expect(record?.sets[0].totalPulls).toBe(18)
    expect(record?.sets[0].parts.find((part) => part.id === HAIR)?.pullNumber).toBe(18)
    expect(record?.sets[1].parts.find((part) => part.id === HAIR)?.pullNumber).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const verifyBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(verifyBody).toEqual({ region: 'cn', token: 'test-token', openid: 'test-openid' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('action=verify')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('action=snapshot')
  })

  it('stops before reading the notebook when the server UID does not match', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          code: 0,
          data: { role: { uid: '654321', zone_id: 1 } }
        },
        { headers: { 'cache-control': 'no-store' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPearpalSnapshot(CREDENTIALS)).rejects.toThrow(PEARPAL_UID_MISMATCH)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    { code: 0, info: 'OK' },
    { code: 0, info: 'OK', data: { role: {} } },
    { code: 1801, info: 'need login.' }
  ])(
    'classifies missing role or invalid credentials as an authentication failure: %j',
    async (payload) => {
      const fetchMock = vi.fn<typeof fetch>(async () =>
        Response.json(payload, { headers: { 'cache-control': 'no-store' } })
      )
      vi.stubGlobal('fetch', fetchMock)
      await expect(fetchPearpalSnapshot(CREDENTIALS)).rejects.toThrow(PEARPAL_AUTH_FAILED)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  )

  it('classifies login expiry between verification and snapshot as an authentication failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) =>
        Response.json(
          new URL(String(input), 'https://local.test').searchParams.get('action') === 'verify'
            ? { code: 0, data: { role: { uid: '123456', zone_id: 1 } } }
            : { code: 1801, info: 'need login.' },
          { headers: { 'cache-control': 'no-store' } }
        )
      )
    )
    await expect(fetchPearpalSnapshot(CREDENTIALS)).rejects.toThrow(PEARPAL_AUTH_FAILED)
  })

  it('processes every known banner and reports an unparseable pool', async () => {
    const compressed = encodeSnappyLiteral(
      JSON.stringify({
        info_from_self: {
          gacha_list: [
            { card_pool_id: 77, pool_cnt: 4, result: '9999999999', rarity: 5 },
            {
              card_pool_id: 2,
              pool_cnt: 5,
              result: BANNER_TWO_ITEM,
              rarity: 5,
              times_from_last_five_stars: 5
            }
          ]
        }
      })
    )
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) =>
        new URL(String(input), 'https://local.test').searchParams.get('action') === 'verify'
          ? Response.json(
              { code: 0, data: { role: { uid: '123456', zone_id: 1 } } },
              { headers: { 'cache-control': 'no-store' } }
            )
          : new Response(compressed.buffer as ArrayBuffer, {
              headers: { 'cache-control': 'no-store' }
            })
      )
    )

    const decoded = await fetchPearpalSnapshot(CREDENTIALS)
    const result = await parsePearpalResonance(
      decoded as Parameters<typeof parsePearpalResonance>[0]
    )
    expect(result.records.map((record) => record.bannerId)).toEqual(['2'])
    expect(result.skippedPools).toBe(1)
  })

  it('rejects a missing or malformed gacha list', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const action = new URL(String(input), 'https://local.test').searchParams.get('action')
      return action === 'verify'
        ? Response.json(
            { code: 0, data: { role: { uid: '123456', zone_id: 1 } } },
            { headers: { 'cache-control': 'no-store' } }
          )
        : new Response(encodeSnappyLiteral('{}').buffer as ArrayBuffer, {
            headers: { 'cache-control': 'no-store' }
          })
    })
    vi.stubGlobal('fetch', fetchMock)
    const decoded = await fetchPearpalSnapshot(CREDENTIALS)
    await expect(
      parsePearpalResonance(decoded as Parameters<typeof parsePearpalResonance>[0])
    ).rejects.toThrow(PEARPAL_NO_RECORDS)
    expect(() => decodePearpal(new Uint8Array([1, 2, 3]).buffer)).toThrow()
  })
})

describe('credential helpers', () => {
  async function runBookmark(
    text: string,
    fetchMock: ReturnType<typeof vi.fn>,
    hostname = 'myl.nuanpaper.com'
  ) {
    const prompt = vi.fn()
    await new Function(
      'document',
      'location',
      'fetch',
      'prompt',
      'alert',
      'return ' + resonanceBookmarkScript('Wrong site').slice('javascript:'.length)
    )(
      { body: { innerText: text }, cookie: 'momoToken=t; momoNid=i' },
      { hostname },
      fetchMock,
      prompt,
      vi.fn()
    )
    return prompt.mock.calls.length ? JSON.parse(prompt.mock.calls[0]![1]) : undefined
  }

  it.each(['UID: 123456', ' UID：\n123456 ', 'Name\nUID:\n123456\nProfile'])(
    'reads UID from desktop and mobile text: %s',
    async (text) => {
      const fetchMock = vi.fn()
      expect(await runBookmark(text, fetchMock)).toEqual({ roleid: '123456', token: 't', id: 'i' })
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )
  it('retrieves a missing page UID from the official role response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: { role: { uid: 123456, zone_id: 1 } } })
    })
    expect((await runBookmark('Profile', fetchMock)).roleid).toBe('123456')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://myl-api.nuanpaper.com/v1/strategy/user/info/get',
      expect.objectContaining({
        body: JSON.stringify({ client_id: 1106, token: 't', openid: 'i' })
      })
    )
  })
  it('keeps credentials available for manual UID entry if role lookup fails', async () => {
    expect(await runBookmark('Profile', vi.fn().mockRejectedValue(new Error('network')))).toEqual({
      roleid: '',
      token: 't',
      id: 'i'
    })
    expect(
      (
        await runBookmark(
          'Profile',
          vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ code: 0, data: { role: { uid: 123456, zone_id: 6 } } })
          })
        )
      ).roleid
    ).toBe('')
  })

  it('builds the two copy flows and parses pasted JSON with either quote style', () => {
    const script = resonanceBookmarkScript('请在美鸭梨网站上使用此书签')
    expect(script.startsWith('javascript:')).toBe(true)
    expect(script).toContain('myl.nuanpaper.com')
    expect(script).toContain('pearpal.infoldgames.com')
    expect(script).toContain('请在美鸭梨网站上使用此书签')
    expect(resonanceConsoleScript).toContain('momoToken')
    expect(resonanceConsoleScript).toContain('momoNid')
    expect(parseResonanceCookie('{"roleid":"123","token":"t","id":"i"}')).toEqual({
      roleid: '123',
      token: 't',
      id: 'i'
    })
    expect(parseResonanceCookie("{'roleid':'123','token':'t','id':'i'}").roleid).toBe('123')
    expect(() => parseResonanceCookie('{"token":"t"}')).toThrow()
  })

  it.each([4, 6, 2, 8])(
    'gets global UID through the matching official API for zone %s',
    async (zone) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { role: { uid: 123456, zone_id: zone } } })
      })
      expect(await runBookmark('Profile', fetchMock, 'pearpal.infoldgames.com')).toEqual({
        roleid: '123456',
        token: 't',
        id: 'i'
      })
      expect(fetchMock).toHaveBeenCalledWith(
        'https://pearpal-api.infoldgames.com/v1/strategy/user/info/get',
        expect.objectContaining({
          body: JSON.stringify({ client_id: 1116, token: 't', openid: 'i' })
        })
      )
    }
  )

  it.each(['pearpal.infoldgames.com.evil.test', 'example.com', '__proto__'])(
    'does not read or transmit credentials on an unlisted host: %s',
    async (hostname) => {
      const fetchMock = vi.fn()
      expect(await runBookmark('Profile', fetchMock, hostname)).toBeUndefined()
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )
})

describe('international notebook import', () => {
  it.each<[PearpalRegion, number]>([
    ['cn', 1],
    ['asia', 4],
    ['america', 6],
    ['europe', 2],
    ['tw', 8]
  ])('verifies %s before decoding the shared notebook format', async (region, zone) => {
    const notebook = {
      info_from_self: { suit_list: ['10347'] },
      info_from_gm: { clothes: [{ item_id: 1020100347 }] }
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { code: 0, data: { role: { uid: 123456, zone_id: zone } } },
          { headers: { 'cache-control': 'no-store' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(encodeSnappyLiteral(JSON.stringify(notebook)).buffer as ArrayBuffer, {
          headers: { 'cache-control': 'no-store' }
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchPearpalSnapshot(CREDENTIALS, undefined, region)).toEqual(notebook)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(String(init?.body))).toEqual({
        region,
        token: CREDENTIALS.token,
        openid: CREDENTIALS.id
      })
    }
  })

  it.each([1, 2, 6, 8, undefined, null, 0])(
    'rejects an incorrect or missing Asia zone before fetching the notebook: %s',
    async (zone) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 0, data: { role: { uid: 123456, zone_id: zone } } },
            { headers: { 'cache-control': 'no-store' } }
          )
        )
      vi.stubGlobal('fetch', fetchMock)
      await expect(fetchPearpalSnapshot(CREDENTIALS, undefined, 'asia')).rejects.toThrow(
        PEARPAL_REGION_MISMATCH
      )
      expect(fetchMock).toHaveBeenCalledOnce()
    }
  )

  it('handles expired global credentials without attempting Snappy decoding', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: 0, data: { role: { uid: 123456, zone_id: 4 } } },
          { headers: { 'cache-control': 'no-store' } }
        )
      )
      .mockResolvedValueOnce(
        Response.json({ code: 1801 }, { headers: { 'cache-control': 'no-store' } })
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPearpalSnapshot(CREDENTIALS, undefined, 'asia')).rejects.toThrow(
      PEARPAL_AUTH_FAILED
    )
  })
})
