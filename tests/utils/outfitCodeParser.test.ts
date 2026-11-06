import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  clearOutfitCodeParseCache,
  OutfitCodeParseError,
  normalizeLookbookCode,
  parseOutfitCode
} from '../../src/utils/outfit/outfitCodeParser'
import type { LookbookDecodeResult } from '../../src/utils/outfit/outfitCodeParser'
import * as directoryStorage from '../../src/utils/file-system/directoryStorage'
import {
  decodeLookbookPayload,
  decodeLookbookShareCodePathId
} from '../../src/utils/outfit/lookbookWasmClient'

const wasmBytes = readFileSync(resolve(process.cwd(), 'src/assets/lookbook-parser.wasm'))
const validCode = '1I43NTCbOn0'
const normalizedCode = validCode + '#'

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  })

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(wasmBytes)))
  await decodeLookbookPayload('a1B2c3D4e5F#', '{"clothes":[]}')
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('normalizeLookbookCode', () => {
  it('为 11 位编码补 # 结尾', () => {
    expect(normalizeLookbookCode('a1B2c3D4e5F')).toBe('a1B2c3D4e5F#')
  })

  it('保留已带 # 的合法编码', () => {
    expect(normalizeLookbookCode('a1B2c3D4e5F#')).toBe('a1B2c3D4e5F#')
  })

  it('支持从分享链接中提取 code 参数', () => {
    expect(normalizeLookbookCode('https://example.com/lookbook?code=a1B2c3D4e5F#')).toBe(
      'a1B2c3D4e5F#'
    )
    expect(normalizeLookbookCode('https://example.com/lookbook?code=a1B2c3D4e5F')).toBe(
      'a1B2c3D4e5F#'
    )
  })

  it('拒绝非法输入', () => {
    expect(normalizeLookbookCode('')).toBe('')
    expect(normalizeLookbookCode('abc')).toBe('')
    expect(normalizeLookbookCode('a1B2c3D4e5F!')).toBe('')
    expect(normalizeLookbookCode(null)).toBe('')
  })
})

describe('parseOutfitCode', () => {
  afterEach(clearOutfitCodeParseCache)

  it('持久化缓存命中不请求任何线路，旧结果按统一规则展示', async () => {
    vi.spyOn(directoryStorage, 'getSavedOutfitParseResult').mockResolvedValue({
      code: normalizedCode,
      wearingClothes: [{ itemId: 1020980001, clothType: 98, outfitId: 123 }],
      dyeItems: []
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await parseOutfitCode(validCode)).wearingClothes).toEqual([
      { itemId: 1020980001, clothType: 76, outfitId: null }
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('只请求官方代理一次，并发调用及成功缓存复用该结果', async () => {
    let finish!: (response: Response) => void
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const first = parseOutfitCode(validCode)
    const second = parseOutfitCode(validCode)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/outfit-code/488547348102388135',
      expect.objectContaining({ credentials: 'omit' })
    )
    finish(jsonResponse({ Content: { Content: { wearingClothes: [1020980001] } } }))
    const result = await first
    expect(await second).toEqual(result)
    expect(await parseOutfitCode(validCode)).toEqual(result)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('原生及历史载荷格式均保持相同的规范化结果', async () => {
    const raw = { Content: { Content: { wearingClothes: [1020980001, 1020100001] } } }
    const third = {
      clothes: [
        { cloth: { id: 1020100001, cloth_type: 10, outfit: 123 } },
        { cloth: { id: 1020980001, cloth_type: 98, outfit: 456 } }
      ]
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => jsonResponse(raw))
    )
    const direct = await parseOutfitCode(validCode)
    await clearOutfitCodeParseCache()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => jsonResponse(third))
    )
    expect(await parseOutfitCode(validCode)).toEqual(direct)
  })

  it('响应头已到但正文挂起也受总超时约束', async () => {
    const original = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => {
      const timer = original(handler, timeout === 10000 ? 30 : timeout, ...args)
      return timer
    }) as typeof setTimeout)
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (url: string) =>
          url.startsWith('/api/')
            ? new Response(new ReadableStream({ start() {} }))
            : new Response('not found', { status: 404 })
        )
    )
    await expect(parseOutfitCode(validCode)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('显示解析结果无需等待持久化；清除缓存等待已开始的后台写入', async () => {
    let finish!: () => void
    const save = vi.spyOn(directoryStorage, 'saveOutfitParseResult').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ clothes: [] }))
    )
    const result = await parseOutfitCode(validCode)
    expect(result.code).toBe(normalizedCode)
    expect(save).toHaveBeenCalledOnce()
    let cleared = false
    const clear = clearOutfitCodeParseCache().then(() => {
      cleared = true
    })
    await Promise.resolve()
    expect(cleared).toBe(false)
    finish()
    await clear
    expect(cleared).toBe(true)
  })

  it('后台持久化失败不影响成功结果且不产生未处理拒绝', async () => {
    vi.spyOn(directoryStorage, 'saveOutfitParseResult').mockRejectedValue(
      new Error('quota exceeded')
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ clothes: [] }))
    )
    await expect(parseOutfitCode(validCode)).resolves.toMatchObject({ code: normalizedCode })
    await clearOutfitCodeParseCache()
  })

  it('清理开始前的慢请求不能在清理后写回内存或数据库', async () => {
    let finish!: (value: Response) => void
    const save = vi.spyOn(directoryStorage, 'saveOutfitParseResult').mockResolvedValue()
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          })
      )
      .mockImplementation(() => Promise.resolve(jsonResponse({ clothes: [] })))
    vi.stubGlobal('fetch', fetchMock)
    const pending = parseOutfitCode(validCode)
    await vi.waitFor(() => expect(finish).toBeDefined())
    await clearOutfitCodeParseCache()
    finish(jsonResponse({ clothes: [] }))
    await pending
    expect(save).not.toHaveBeenCalled()
    await parseOutfitCode(validCode)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledOnce()
  })

  it('清洗部件列表并解析染色数据', async () => {
    const payload = {
      clothes: [
        { cloth: { id: 1020100001, outfit: 1001, cloth_type: 1 } },
        { cloth: { id: 1020100002, cloth_type: 86 } },
        { cloth: { id: 1021860042, cloth_type: 2 } },
        {
          cloth: { id: 1020100003, cloth_type: 3 },
          diy: {
            outfit_dye: [
              {
                General: {
                  target_group_id: 1,
                  feature_tag: 1,
                  color: { rgba: [1, 0, 0, 1], color_grid: 9 }
                }
              },
              {
                Hair: {
                  target_group_id: 2,
                  feature_tag: 3,
                  color_0: { rgba: [0.5, 0.5, 0.5, 1], color_grid: -1 }
                }
              }
            ]
          }
        }
      ]
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload))
    vi.stubGlobal('fetch', fetchMock)

    const result = await parseOutfitCode(validCode)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/outfit-code/488547348102388135')
    expect(result.code).toBe(normalizedCode)
    expect(result.wearingClothes).toEqual([
      { itemId: 1020100001, clothType: 10, outfitId: null },
      { itemId: 1020100003, clothType: 10, outfitId: null }
    ])
    expect(result.dyeItems).toHaveLength(1)
    const [dyeItem] = result.dyeItems
    expect(dyeItem.itemId).toBe(1020100003)
    expect(dyeItem.dyes).toEqual([
      { targetGroupId: 1, featureTag: 1, paletteId: 2, slot: 1, color: '#ff0000' },
      { targetGroupId: 2, featureTag: 3, paletteId: -1, slot: null, color: '#bcbcbc' }
    ])
  })

  it('为原生搭配码结果补齐部件类型', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"Content":{"Content":{"wearingClothes":[1020500290]}}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )

    const result = await parseOutfitCode(validCode)

    expect(result.wearingClothes).toEqual([{ itemId: 1020500290, clothType: 50, outfitId: null }])
  })

  it('格式非法时不请求接口并标记 invalid', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(parseOutfitCode('bad')).rejects.toMatchObject({ kind: 'invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('字符不属于原生 Base62 字母表时不请求接口', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(parseOutfitCode('a1B2c3D4e5F')).rejects.toMatchObject({ kind: 'invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['404', new Response('not found', { status: 404 })],
    ['400', new Response('bad request', { status: 400 })]
  ])('上游 %s 响应视为搭配码无效', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(parseOutfitCode(validCode)).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('上游 502 标记 unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('upstream unavailable', { status: 502 }))
    )
    await expect(parseOutfitCode(validCode)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('上游其他错误标记 unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })))
    const parsing = parseOutfitCode(validCode)
    await expect(parsing).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(parsing).rejects.toBeInstanceOf(OutfitCodeParseError)
  })

  it('网络异常标记 unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(parseOutfitCode(validCode)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('响应缺少 clothes 字段标记 unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    await expect(parseOutfitCode(validCode)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('HTTP 成功但响应 JSON 损坏时标记 unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"clothes":[{"cloth":{"id":1+}}]}'))
    )
    await expect(parseOutfitCode(validCode)).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Lookbook upstream returned malformed JSON'
    })
  })

  it('缓存成功结果并复用规范化后的搭配码', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        clothes: [{ cloth: { id: 1020100001, outfit: 1001, cloth_type: 1 } }]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = await parseOutfitCode(validCode)
    const second = await parseOutfitCode(normalizedCode)

    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('不缓存失败结果，重试时重新请求服务', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ clothes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(parseOutfitCode(validCode)).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(parseOutfitCode(validCode)).resolves.toMatchObject({ code: normalizedCode })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('lookbook share code protocol', () => {
  it('WASM 将真实分享码解码为对象路径编号', async () => {
    await expect(decodeLookbookShareCodePathId(normalizedCode)).resolves.toBe('488547348102388135')
  })

  it.each(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C'])(
    'WASM 忽略原生分享码标记 %s',
    async (marker) => {
      await expect(decodeLookbookShareCodePathId(marker + validCode.slice(1) + '#')).resolves.toBe(
        '488547348102388135'
      )
    }
  )

  it.each(['a' + validCode.slice(1) + '#', '1I43NTCbOn!#', validCode])(
    'WASM 拒绝不支持的分享码格式 %s',
    async (code) => {
      await expect(decodeLookbookShareCodePathId(code)).resolves.toBeNull()
    }
  )
})

describe('lookbook WASM native output', () => {
  it('保留原生类型映射中的特殊戒指部件', async () => {
    const result = await decodeLookbookPayload<LookbookDecodeResult>(
      '13Zb1zKZgf1#',
      '{"Content":{"Content":{"wearingClothes":[1020790033]}}}'
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        wearingClothes: [{ itemId: 1020790033, clothType: 96, outfitId: null }]
      }
    })
  })

  it('reads native JSON-like maps and normalizes general and hair dye records', async () => {
    const payload =
      '{"Content":{"Content":{"patternData":[:123:0],"wearingClothes":[1020100001,1020860231],"wearingDIYInfos":[' +
      '{"TargetGroupID":1,"CoreData":{"B":0.69318097829819,"ColorGridID":96,"R":0.37126499414444,"A":1,"G":0.60334801673889},"FeatureTag":1,"TargetClothID":1020100001},' +
      '{"TargetGroupID":2,"CoreData":{"TargetColor0":{"R":0.8,"B":0.7,"A":1,"G":0.6},"ColorGridID0":120},"FeatureTag":6,"TargetClothID":1020100001}' +
      ']}}}'

    const result = await decodeLookbookPayload<LookbookDecodeResult>('a1B2c3D4e5F#', payload)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.wearingClothes).toEqual([
      { itemId: 1020100001, clothType: 10, outfitId: null }
    ])
    expect(result.value.dyeItems[0].dyes).toMatchObject([
      { targetGroupId: 1, featureTag: 1, paletteId: 12, slot: 8 },
      { targetGroupId: 2, featureTag: 6, paletteId: 15, slot: 8 }
    ])
    expect(result.value.dyeItems[0].dyes.every((dye) => /^#[0-9a-f]{6}$/.test(dye.color))).toBe(
      true
    )
  })

  it('preserves special-effect records as full-evolution dye conditions', async () => {
    const payload =
      '{"Content":{"Content":{"patternData":[:1025740294:0],"wearingClothes":[1025740294],"wearingDIYInfos":[' +
      '{"TargetGroupID":1,"CoreData":{"R":0.1,"G":0.2,"B":0.3,"A":1,"ColorGridID":88},"FeatureTag":1,"TargetClothID":1025740294},' +
      '{"TargetGroupID":1,"CoreData":{"ColorGridID":128,"CoverDIYColor":true},"FeatureTag":7,"TargetClothID":1025740294}' +
      ']}}}'

    const result = await decodeLookbookPayload<LookbookDecodeResult>('13Zb1zKZgf1#', payload)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.wearingClothes).toContainEqual({
      itemId: 1025740294,
      clothType: 74,
      outfitId: null
    })
    expect(result.value.dyeItems).toContainEqual(
      expect.objectContaining({
        itemId: 1025740294,
        hasSpecialEffect: true
      })
    )
  })

  it('keeps a special-effect-only item in WASM dye output', async () => {
    const payload =
      '{"Content":{"Content":{"wearingClothes":[1025740294],"wearingDIYInfos":[' +
      '{"TargetGroupID":1,"CoreData":{"CoverDIYColor":true},"FeatureTag":7,"TargetClothID":1025740294}' +
      ']}}}'

    const result = await decodeLookbookPayload<LookbookDecodeResult>('13Zb1zKZgf1#', payload)

    expect(result).toMatchObject({
      ok: true,
      value: {
        dyeItems: [{ itemId: 1025740294, dyes: [], hasSpecialEffect: true }]
      }
    })
  })
})

describe('lookbook cloth types', () => {
  afterEach(clearOutfitCodeParseCache)

  it('infers the cloth type when the upstream type is missing or malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          clothes: [
            { cloth: { id: 1020100001 } },
            { cloth: { id: 1020100002, cloth_type: 'invalid' } }
          ]
        })
      )
    )

    const result = await parseOutfitCode(validCode)
    expect(result.wearingClothes).toEqual([
      { itemId: 1020100001, clothType: 10, outfitId: null },
      { itemId: 1020100002, clothType: 10, outfitId: null }
    ])
  })
})
