import { isValidOutfitPayload, readOutfitBody } from '../../_lib/outfitPayload'

interface OutfitCodeFunctionContext {
  request: Request
  params: { id?: string }
  waitUntil?: (promise: Promise<unknown>) => void
}
interface Snapshot {
  body: Uint8Array | string
  status: number
  headers: Record<string, string>
}
interface Flight {
  controller: AbortController
  promise: Promise<Snapshot>
  consumers: number
}
const UPSTREAM_BASE_URL = 'https://x6cn-clothdiydata.nuanpaper.com/default/'
const CACHE_TTL_SECONDS = 3600
const inFlight = new Map<string, Flight>()
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

/** 固定上游完整读取，8 秒限制同时覆盖响应头与正文；失败结果永不缓存。 */
async function fetchSnapshot(id: string, controller: AbortController): Promise<Snapshot> {
  const started = Date.now()
  const timeout = AbortSignal.timeout(8000)
  const abort = () => controller.abort(timeout.reason)
  timeout.addEventListener('abort', abort, { once: true })
  if (timeout.aborted) abort()
  let headersMs: number | undefined
  let bodyMs: number | undefined
  let result: Snapshot
  try {
    controller.signal.throwIfAborted()
    const upstream = await fetch(UPSTREAM_BASE_URL + encodeURIComponent(id) + '.json', {
      signal: controller.signal,
      // workerd 不支持 error 模式；manual 不跟随跳转，下面统一拒绝非 200 响应。
      redirect: 'manual'
    })
    headersMs = Date.now() - started
    if (upstream.status !== 200) {
      // 错误正文不参与解析；即使上游没有正文，也保留明确的 400/404 状态。
      void upstream.body?.cancel().catch(() => undefined)
      result = {
        status: upstream.status === 400 || upstream.status === 404 ? upstream.status : 502,
        body: JSON.stringify({ error: 'upstream_rejected' }),
        headers: { ...JSON_HEADERS }
      }
    } else {
      const body = await readOutfitBody(upstream)
      bodyMs = Date.now() - started - headersMs
      controller.signal.throwIfAborted()
      if (!isValidOutfitPayload(body)) throw new Error('upstream_invalid_payload')
      result = {
        status: 200,
        body,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'application/octet-stream'
        }
      }
      const requestId = upstream.headers.get('x-oss-request-id')
      if (requestId) result.headers['x-outfit-proxy-request-id'] = requestId
    }
  } catch (error) {
    const reason =
      error instanceof Error &&
      ['upstream_body_too_large', 'upstream_invalid_payload'].includes(error.message)
        ? error.message
        : 'upstream_unavailable'
    result = {
      status: timeout.aborted ? 504 : 502,
      body: JSON.stringify({ error: timeout.aborted ? 'upstream_timeout' : reason }),
      headers: { ...JSON_HEADERS }
    }
  } finally {
    timeout.removeEventListener('abort', abort)
  }
  const total = Date.now() - started
  result.headers['server-timing'] = [
    headersMs === undefined ? '' : `upstream_headers;dur=${headersMs}`,
    headersMs === undefined ? '' : `upstream_body;dur=${bodyMs ?? total - headersMs}`,
    `upstream_total;dur=${total}`
  ]
    .filter(Boolean)
    .join(', ')
  // 收到头时仍表示上游响应头耗时；头到达前失败时沿用原来的总耗时语义。
  result.headers['x-outfit-proxy-upstream-ms'] = String(headersMs ?? total)
  return result
}

/** 每位调用者独立取消；只有最后一位离开才中止共享回源。 */
async function consumeFlight(flight: Flight, signal: AbortSignal): Promise<Snapshot> {
  flight.consumers++
  let abort!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  try {
    return await Promise.race([flight.promise, cancelled])
  } finally {
    signal.removeEventListener('abort', abort)
    if (--flight.consumers === 0) flight.controller.abort()
  }
}

/** 浏览器保持禁缓存，Cloudflare 独立内部响应缓存一小时；缓存故障降级为回源。 */
export async function onRequestGet(context: OutfitCodeFunctionContext): Promise<Response> {
  const id = context.params.id ?? ''
  const started = Date.now()
  // 版本化内部键不携带用户 Cookie、查询参数或其他请求头。
  const key = new Request(
    new URL(`/api/outfit-code/${encodeURIComponent(id)}?edge-cache=v1`, context.request.url)
  )
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default
  try {
    context.request.signal.throwIfAborted()
    const cached = await cache?.match(key)
    if (
      cached?.status === 200 &&
      Number(cached.headers.get('x-outfit-cache-expires')) > Date.now()
    ) {
      return new Response(cached.body, {
        headers: {
          'content-type': cached.headers.get('content-type') || 'application/octet-stream',
          'cache-control': 'private, no-store',
          'x-outfit-cache': 'HIT',
          'server-timing': `cache;dur=${Date.now() - started}`
        }
      })
    }
    // Cache 返回的流可能是 tee 分支；等待 cancel 会被另一个分支阻塞。
    void cached?.body?.cancel().catch(() => undefined)
  } catch {
    // 缓存 API 不可用时不影响正常解析。
  }
  const cacheMs = Date.now() - started
  if (context.request.signal.aborted)
    return Response.json(
      { error: 'request_aborted' },
      { status: 499, headers: { ...JSON_HEADERS, 'cache-control': 'no-store' } }
    )
  let flight = inFlight.get(key.url)
  if (!flight || flight.controller.signal.aborted) {
    const controller = new AbortController()
    const promise = fetchSnapshot(id, controller).then((snapshot) => {
      if (snapshot.status === 200 && cache && !controller.signal.aborted) {
        const cached = new Response(snapshot.body, {
          headers: {
            'content-type': snapshot.headers['content-type'],
            'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
            'x-outfit-cache-expires': String(Date.now() + CACHE_TTL_SECONDS * 1000)
          }
        })
        // 写入失败不改变成功响应；waitUntil 让后台任务在响应结束后仍可执行。
        const write = Promise.resolve()
          .then(() => cache.put(key, cached))
          .catch(() => undefined)
        context.waitUntil?.(write)
      }
      return snapshot
    })
    const current: Flight = { controller, consumers: 0, promise }
    current.promise = promise.finally(() => {
      if (inFlight.get(key.url) === current) inFlight.delete(key.url)
    })
    flight = current
    inFlight.set(key.url, current)
  }
  try {
    const snapshot = await consumeFlight(flight, context.request.signal)
    return new Response(snapshot.body, {
      status: snapshot.status,
      headers: {
        ...snapshot.headers,
        'cache-control': 'private, no-store',
        'x-outfit-cache': 'MISS',
        'server-timing': `cache;dur=${cacheMs}, ${snapshot.headers['server-timing']}`
      }
    })
  } catch {
    return Response.json(
      { error: 'request_aborted' },
      {
        status: 499,
        headers: { ...JSON_HEADERS, 'cache-control': 'no-store', 'x-outfit-cache': 'MISS' }
      }
    )
  }
}
