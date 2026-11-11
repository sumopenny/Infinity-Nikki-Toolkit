import {
  cacheGeneration,
  isCurrentCacheGeneration,
  persistCacheIfCurrent,
  registerCacheReset
} from '../cacheLifecycle'
// 搭配码解析：缓存未命中时获取官方原始数据，在本地通过 WASM 解码。
import {
  clearSavedOutfitParseResults,
  getSavedOutfitParseResult,
  saveOutfitParseResult
} from '../file-system/directoryStorage'
import { inferClothTypeFromItemId } from './clothType'
import { lookbookTiming, measureLookbook } from './lookbookDiagnostics'

const LOOKBOOK_DATA_PROXY_BASE_URL = '/api/outfit-code'
const LOOKBOOK_CODE_PATTERN = /^[A-Za-z0-9]{11}#$/
const LOOKBOOK_REQUEST_TIMEOUT_MS = 10000

const parsedResultCache = new Map<string, LookbookDecodeResult>()
const pendingParseRequests = new Map<string, Promise<LookbookDecodeResult>>()
const pendingCacheWrites = new Set<Promise<void>>()
let parseCacheGeneration = 0

export type LookbookParseError = 'invalid' | 'unavailable'

export class OutfitCodeParseError extends Error {
  readonly kind: LookbookParseError

  constructor(kind: LookbookParseError, message: string) {
    super(message)
    this.name = 'OutfitCodeParseError'
    this.kind = kind
  }
}

export interface LookbookDyeSwatch {
  targetGroupId: number
  featureTag: number
  paletteId: number
  slot: number | null
  color: string
}

export interface LookbookDyeItem {
  itemId: number
  clothType: number | null
  outfitId: number | null
  dyes: LookbookDyeSwatch[]
  hasSpecialEffect: boolean
}

export interface LookbookCloth {
  itemId: number
  clothType: number | null
  outfitId: number | null
}

export interface LookbookDecodeResult {
  code: string
  wearingClothes: LookbookCloth[]
  dyeItems: LookbookDyeItem[]
}

/** 按部件 ID 推导类型、排序；套装关系由本地图鉴解析。 */
function normalizeLookbookResult(result: LookbookDecodeResult): LookbookDecodeResult {
  const infer = <T extends { itemId: number; clothType: number | null }>(cloth: T): T =>
    ({
      ...cloth,
      clothType: inferClothTypeFromItemId(cloth.itemId),
      outfitId: null
    }) as T
  return {
    ...result,
    wearingClothes: result.wearingClothes.map(infer).sort((a, b) => a.itemId - b.itemId),
    dyeItems: result.dyeItems
      .map((item) => ({
        ...infer(item),
        dyes: [...item.dyes].sort(
          (a, b) =>
            a.targetGroupId - b.targetGroupId ||
            a.featureTag - b.featureTag ||
            a.paletteId - b.paletteId ||
            (a.slot ?? -1) - (b.slot ?? -1) ||
            a.color.localeCompare(b.color)
        )
      }))
      .sort((a, b) => a.itemId - b.itemId)
  }
}

/** 规范化搭配码:支持直接粘贴分享链接,11 位编码自动补 # 结尾;不合法返回空串。 */
export function normalizeLookbookCode(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value
  let code = typeof raw === 'string' ? raw.trim() : ''
  if (!code) return ''

  try {
    const url = new URL(code, window.location.origin)
    const urlCode = url.searchParams.get('code')?.trim() ?? ''
    if (urlCode) code = urlCode
  } catch {
    // 不是合法 URL 时按原始码处理。
  }

  if (/^[A-Za-z0-9]{11}$/.test(code)) code = `${code}#`
  return LOOKBOOK_CODE_PATTERN.test(code) ? code : ''
}

const isCachedParseResult = (value: unknown, code: string): value is LookbookDecodeResult => {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<LookbookDecodeResult>
  if (
    result.code !== code ||
    !Array.isArray(result.wearingClothes) ||
    !Array.isArray(result.dyeItems)
  )
    return false
  return (
    result.wearingClothes.every(
      (cloth) =>
        cloth &&
        typeof cloth === 'object' &&
        Number.isSafeInteger(cloth.itemId) &&
        cloth.itemId > 0 &&
        (cloth.clothType === null || Number.isInteger(cloth.clothType)) &&
        (cloth.outfitId === null || (Number.isSafeInteger(cloth.outfitId) && cloth.outfitId > 0))
    ) &&
    result.dyeItems.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        Number.isSafeInteger(item.itemId) &&
        item.itemId > 0 &&
        Array.isArray(item.dyes) &&
        item.dyes.every(
          (dye) =>
            dye &&
            typeof dye === 'object' &&
            Number.isInteger(dye.targetGroupId) &&
            Number.isInteger(dye.featureTag) &&
            Number.isInteger(dye.paletteId) &&
            (dye.slot === null || Number.isInteger(dye.slot)) &&
            typeof dye.color === 'string'
        ) &&
        typeof item.hasSpecialEffect === 'boolean'
    )
  )
}

/** 只请求同源官方数据代理；超时覆盖响应正文及本地解析。 */
async function requestLookbookParse(code: string): Promise<LookbookDecodeResult> {
  let pathId: string | null
  try {
    const { decodeLookbookShareCodePathId } = await import('./lookbookWasmClient')
    pathId = await measureLookbook('share_code_decode', () => decodeLookbookShareCodePathId(code))
  } catch (error) {
    throw new OutfitCodeParseError(
      'unavailable',
      'Lookbook share-code decoding failed: ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
  if (!pathId) {
    throw new OutfitCodeParseError('invalid', 'Invalid lookbook code: ' + code)
  }

  const controller = new AbortController()
  let onAbort!: () => void
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(new OutfitCodeParseError('unavailable', 'Lookbook request timed out'))
    controller.signal.addEventListener('abort', onAbort, { once: true })
  })
  const timer = setTimeout(() => controller.abort(), LOOKBOOK_REQUEST_TIMEOUT_MS)
  try {
    return await Promise.race([
      requestLookbookSource(
        code,
        LOOKBOOK_DATA_PROXY_BASE_URL + '/' + pathId,
        controller.signal,
        'proxy'
      ),
      cancelled
    ])
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', onAbort)
    controller.abort()
  }
}

/** 完整读取、WASM 解析和结构校验都成功后才返回结果。 */
async function requestLookbookSource(
  code: string,
  url: string,
  signal: AbortSignal,
  source: string
): Promise<LookbookDecodeResult> {
  let response: Response
  try {
    const started = performance.now()
    response = await measureLookbook('request_headers', () =>
      fetch(url, {
        signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json, application/octet-stream' }
      })
    )
    lookbookTiming('proxy_response', started, {
      status: response.status,
      source,
      cache: response.headers.get('x-outfit-cache'),
      serverTiming: response.headers.get('server-timing')
    })
  } catch (error) {
    throw new OutfitCodeParseError(
      'unavailable',
      `Lookbook request failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (!response.ok) {
    const codeRejected = response.status === 404 || response.status === 400
    throw new OutfitCodeParseError(
      codeRejected ? 'invalid' : 'unavailable',
      `Lookbook object request failed with ${response.status}`
    )
  }

  let payload: string
  try {
    payload = await measureLookbook('response_body', () => response.text())
  } catch {
    throw new OutfitCodeParseError('unavailable', 'Lookbook upstream response could not be read')
  }

  let decoded
  try {
    decoded = await measureLookbook('payload_decode', () =>
      import('./lookbookWasmClient').then(({ decodeLookbookPayload }) =>
        decodeLookbookPayload<LookbookDecodeResult>(code, payload)
      )
    )
  } catch (error) {
    throw new OutfitCodeParseError(
      'unavailable',
      `Lookbook WASM normalization failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!decoded.ok) {
    const message =
      decoded.errorCode === 'json_invalid'
        ? 'Lookbook upstream returned malformed JSON'
        : decoded.errorCode === 'clothes_missing'
          ? 'Lookbook upstream response is missing clothes'
          : `Lookbook upstream response could not be normalized (${decoded.errorCode})`
    throw new OutfitCodeParseError('unavailable', message)
  }
  signal.throwIfAborted()
  if (!isCachedParseResult(decoded.value, code))
    throw new OutfitCodeParseError('unavailable', 'Lookbook result failed validation')
  lookbookTiming('source_success', performance.now(), { source })
  return normalizeLookbookResult(decoded.value)
}

/** 仅查询本机解析结果；浏览总结时缓存缺失不触发在线请求。 */
export async function readCachedOutfitResult(code: string): Promise<LookbookDecodeResult | null> {
  const cached = parsedResultCache.get(code)
  if (cached) return cached
  try {
    const stored = await getSavedOutfitParseResult(code)
    return isCachedParseResult(stored, code) ? normalizeLookbookResult(stored) : null
  } catch {
    return null
  }
}

/** 解析搭配码；成功结果持久化到 IndexedDB，存储不可用时回退到在线请求。 */
export async function parseOutfitCode(rawCode: string): Promise<LookbookDecodeResult> {
  const code = normalizeLookbookCode(rawCode)
  if (!code) throw new OutfitCodeParseError('invalid', `Invalid lookbook code: ${rawCode}`)

  const memoryCached = parsedResultCache.get(code)
  if (memoryCached) {
    lookbookTiming('memory_cache_hit', performance.now())
    return memoryCached
  }

  const pending = pendingParseRequests.get(code)
  if (pending) return measureLookbook('pending_request', () => pending)

  const generation = cacheGeneration()
  const localGeneration = parseCacheGeneration
  const isCurrent = () =>
    localGeneration === parseCacheGeneration && isCurrentCacheGeneration(generation)
  const request = (async () => {
    const resultFromCache = await measureLookbook('indexeddb_read', () =>
      readCachedOutfitResult(code)
    )
    if (resultFromCache) {
      if (isCurrent()) parsedResultCache.set(code, resultFromCache)
      lookbookTiming('indexeddb_cache_hit', performance.now())
      return resultFromCache
    }

    const result = await requestLookbookParse(code)
    if (isCurrent()) {
      parsedResultCache.set(code, result)
      // 后台保存不阻塞界面；清理时等待已开始的写入，并阻止旧请求再次写回。
      const write = measureLookbook('indexeddb_write', () =>
        persistCacheIfCurrent(generation, () => saveOutfitParseResult(code, result))
      ).catch(() => undefined)
      pendingCacheWrites.add(write)
      void write.finally(() => pendingCacheWrites.delete(write))
    }
    return result
  })()
  pendingParseRequests.set(code, request)
  try {
    return await request
  } finally {
    if (pendingParseRequests.get(code) === request) pendingParseRequests.delete(code)
  }
}

function resetMemoryCache(): void {
  parseCacheGeneration++
  parsedResultCache.clear()
  pendingParseRequests.clear()
}
registerCacheReset('outfit-code', resetMemoryCache)

export async function clearOutfitCodeParseCache(): Promise<void> {
  resetMemoryCache()
  await Promise.allSettled([...pendingCacheWrites])
  if (typeof indexedDB !== 'undefined') await clearSavedOutfitParseResults()
}
