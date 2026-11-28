import {
  warmLookbookParser,
  decodeLookbookShareCodePathId,
  decodeLookbookPayload
} from './lookbookWasmClient'
import { parseNativeOutfitPayload } from './nativePayload'
import { throwIfSignalAborted } from '../abortSignal'
import { annotateDiagnosticError } from '../errorReporting/errorReporter'
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
const LOOKBOOK_REQUEST_TIMEOUT_MS = 15_000

const parsedResultCache = new Map<string, LookbookDecodeResult>()
const pendingParseRequests = new Map<string, Promise<LookbookDecodeResult>>()
const pendingCacheWrites = new Set<Promise<void>>()
let parseCacheGeneration = 0

export type LookbookParseError = 'invalid' | 'unavailable'
export type LookbookFailureReason =
  'network' | 'timeout' | 'service' | 'wasm' | 'data' | 'unavailable'

export class OutfitCodeParseError extends Error {
  readonly kind: LookbookParseError

  constructor(
    kind: LookbookParseError,
    message: string,
    readonly reason: LookbookFailureReason = 'unavailable',
    readonly retryable = false,
    readonly httpStatus?: number,
    readonly upstreamCode?: string
  ) {
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
  customizedItemIds?: number[]
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
    !Array.isArray(result.dyeItems) ||
    (result.customizedItemIds !== undefined &&
      (!Array.isArray(result.customizedItemIds) ||
        !result.customizedItemIds.every((id) => Number.isSafeInteger(id) && id > 0)))
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

/** One shared parse owns at most two network attempts; WASM has its own loader timeout. */
async function requestLookbookParse(code: string): Promise<LookbookDecodeResult> {
  const pathId = await measureLookbook('share_code_decode', () =>
    decodeLookbookShareCodePathId(code)
  )
  if (!pathId) throw new OutfitCodeParseError('invalid', 'Invalid lookbook code')
  const started = performance.now()
  const controller = new AbortController()
  let attempts = 0
  const request = async () => {
    for (;;) {
      throwIfSignalAborted(controller.signal)
      attempts++
      try {
        return await requestLookbookPayload(
          LOOKBOOK_DATA_PROXY_BASE_URL + '/' + pathId,
          controller.signal
        )
      } catch (error) {
        if (
          controller.signal.aborted ||
          attempts >= 2 ||
          !(error instanceof OutfitCodeParseError) ||
          !error.retryable
        )
          throw error
        lookbookTiming('network_retry', started, { attempt: attempts, reason: error.reason })
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }
  }
  try {
    const [payload] = await Promise.all([
      request(),
      warmLookbookParser().catch(() => {
        throw new OutfitCodeParseError('unavailable', 'Lookbook parser loading failed', 'wasm')
      })
    ])
    return await normalizeLookbookPayload(code, payload)
  } catch (error) {
    if (error instanceof OutfitCodeParseError && error.kind !== 'invalid') {
      annotateDiagnosticError(error, {
        module: 'outfits',
        action: 'parse',
        stage: error.reason === 'wasm' ? 'wasm' : error.reason === 'data' ? 'decode' : 'network',
        code: error.reason,
        context: {
          outfitParseFinal: true,
          durationMs: Math.round(performance.now() - started),
          attempts,
          status: error.httpStatus,
          upstreamCode: error.upstreamCode
        }
      })
    }
    throw error
  } finally {
    controller.abort()
  }
}

/** Timeout covers headers and body only, including fetch implementations that stall. */
async function requestLookbookPayload(url: string, signal: AbortSignal): Promise<string> {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  let onAbort!: () => void
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', onAbort, { once: true })
    if (controller.signal.aborted) onAbort()
  })
  const timer = setTimeout(
    () =>
      controller.abort(
        new OutfitCodeParseError('unavailable', 'Lookbook request timed out', 'timeout', true)
      ),
    LOOKBOOK_REQUEST_TIMEOUT_MS
  )
  try {
    return await Promise.race([
      (async () => {
        const started = performance.now()
        const response = await measureLookbook('request_headers', () =>
          fetch(url, {
            signal: controller.signal,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            headers: { Accept: 'application/json, application/octet-stream' }
          })
        )
        lookbookTiming('proxy_response', started, {
          status: response.status,
          source: 'proxy',
          cache: response.headers.get('x-outfit-cache'),
          serverTiming: response.headers.get('server-timing')
        })
        if ([400, 404, 499].includes(response.status)) {
          void response.body?.cancel().catch(() => undefined)
          if (response.status === 499)
            throw new DOMException('Lookbook request cancelled', 'AbortError')
          throw new OutfitCodeParseError(
            'invalid',
            'Invalid lookbook code',
            'service',
            false,
            response.status
          )
        }
        const payload = await measureLookbook('response_body', () => response.text())
        if (response.ok) return payload
        let upstreamCode: string | undefined
        try {
          const value = JSON.parse(payload)?.error
          if (
            [
              'upstream_timeout',
              'upstream_unavailable',
              'upstream_rejected',
              'upstream_invalid_payload',
              'upstream_body_too_large',
              'request_aborted'
            ].includes(value)
          )
            upstreamCode = value
        } catch {
          /* Error pages need not be JSON. */
        }
        const dataError =
          upstreamCode === 'upstream_invalid_payload' || upstreamCode === 'upstream_body_too_large'
        if (upstreamCode === 'request_aborted')
          throw new DOMException('Lookbook request cancelled', 'AbortError')
        throw new OutfitCodeParseError(
          'unavailable',
          'Lookbook object request failed with ' +
            response.status +
            (upstreamCode ? ' (' + upstreamCode + ')' : ''),
          dataError
            ? 'data'
            : response.status === 504 || upstreamCode === 'upstream_timeout'
              ? 'timeout'
              : 'service',
          !dataError && [502, 503, 504].includes(response.status),
          response.status,
          upstreamCode
        )
      })(),
      cancelled
    ])
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason
    if (
      error instanceof OutfitCodeParseError ||
      (error instanceof Error && error.name === 'AbortError')
    )
      throw error
    throw new OutfitCodeParseError(
      'unavailable',
      'Lookbook network request failed',
      'network',
      true
    )
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', onAbort)
    controller.abort()
  }
}

async function normalizeLookbookPayload(
  code: string,
  payload: string
): Promise<LookbookDecodeResult> {
  let decoded
  try {
    decoded = await measureLookbook('payload_decode', () =>
      decodeLookbookPayload<LookbookDecodeResult>(code, payload)
    )
  } catch {
    throw new OutfitCodeParseError('unavailable', 'Lookbook WASM normalization failed', 'data')
  }
  if (!decoded.ok) {
    const message =
      decoded.errorCode === 'json_invalid'
        ? 'Lookbook upstream returned malformed JSON'
        : decoded.errorCode === 'clothes_missing'
          ? 'Lookbook upstream response is missing clothes'
          : `Lookbook upstream response could not be normalized (${decoded.errorCode})`
    throw new OutfitCodeParseError('unavailable', message, 'data')
  }
  if (!isCachedParseResult(decoded.value, code))
    throw new OutfitCodeParseError('unavailable', 'Lookbook result failed validation', 'data')
  lookbookTiming('source_success', performance.now(), { source: 'proxy' })

  if (payload.includes('"attachmentData"')) {
    let attachments
    try {
      attachments = parseNativeOutfitPayload(payload)?.Content?.Content?.attachmentData
    } catch {
      throw new OutfitCodeParseError(
        'unavailable',
        'Lookbook attachment data could not be parsed',
        'data'
      )
    }
    decoded.value.customizedItemIds = Object.entries(attachments ?? {})
      .filter(
        ([id, value]) =>
          Number.isSafeInteger(Number(id)) &&
          Number(id) > 0 &&
          value !== null &&
          typeof value === 'object' &&
          Object.keys(value).length > 0
      )
      .map(([id]) => Number(id))
  }
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

/** A slow optional cache must not block online parsing or overwrite its result later. */
async function readParseCacheWithTimeout(code: string): Promise<LookbookDecodeResult | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const started = performance.now()
  try {
    return await Promise.race([
      measureLookbook('indexeddb_read', () => readCachedOutfitResult(code)),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          lookbookTiming('indexeddb_timeout', started)
          resolve(null)
        }, 1000)
      })
    ])
  } finally {
    clearTimeout(timer)
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
    const resultFromCache = await readParseCacheWithTimeout(code)
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
