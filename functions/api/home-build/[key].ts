import { methodNotAllowed } from '../../_lib/http'

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const KEY_PATTERN = /^[A-Za-z0-9]{1,29}$/

interface HomeBuildContext {
  params: Record<string, string | undefined>
  request?: Request
  data?: Record<string, unknown>
}

function jsonError(status: number, code: string): Response {
  return Response.json(
    { ok: false, errorCode: code },
    {
      status,
      headers: { 'cache-control': 'no-store' }
    }
  )
}

/** 只代理家园方案固定 CDN 的对象键，限制响应大小以避免代理被用于大流量转发。 */
export async function onRequestGet(context: HomeBuildContext): Promise<Response> {
  let key: string
  try {
    key = decodeURIComponent(context.params.key ?? '')
  } catch {
    return jsonError(400, 'resource_key_invalid')
  }
  if (!KEY_PATTERN.test(key)) return jsonError(400, 'resource_key_invalid')

  const started = Date.now()
  const timeout = AbortSignal.timeout(15_000)
  const signal = context.request ? AbortSignal.any([timeout, context.request.signal]) : timeout
  let attempts = 0
  let upstream: Response | undefined
  const fail = (status: number, code: string, stage: string, error?: unknown) => {
    if (context.data) {
      // Do not retain the resource key, upstream body or URL-bearing exception messages.
      context.data.diagnosticFailure = {
        error: new Error(code),
        operation: 'home-build-fetch',
        stage,
        upstreamStatus: upstream?.status,
        upstreamDurationMs: Date.now() - started,
        attempts,
        timedOut: timeout.aborted,
        upstreamErrorName: error instanceof Error ? error.name : undefined
      }
    }
    return jsonError(status, code)
  }
  const interrupted = (stage: string, error?: unknown) =>
    context.request?.signal.aborted
      ? fail(499, 'request_aborted', stage)
      : timeout.aborted
        ? fail(504, 'upstream_timeout', stage, error)
        : null

  // One retry for transient failures, sharing the original deadline (including body reads).
  for (let attempt = 0; attempt < 2; attempt++) {
    const aborted = interrupted('fetch')
    if (aborted) return aborted
    attempts++
    upstream = undefined
    try {
      upstream = await fetch(`https://x6cn-home-build-data.nuanpaper.com/default/${key}`, {
        headers: { Range: 'bytes=0-' },
        signal,
        redirect: 'manual'
      })
    } catch (error) {
      const aborted = interrupted('fetch', error)
      if (aborted) return aborted
      if (attempt === 0) continue
      return fail(502, 'upstream_unavailable', 'fetch', error)
    }
    if (attempt === 0 && [502, 503, 504].includes(upstream.status)) {
      void upstream.body?.cancel().catch(() => {})
      continue
    }
    break
  }
  if (!upstream) return fail(502, 'upstream_unavailable', 'fetch')
  const aborted = interrupted('response')
  if (aborted) return aborted
  if (upstream.status !== 200 && upstream.status !== 206) {
    void upstream.body?.cancel().catch(() => {})
    if (upstream.status === 404 || upstream.status === 410)
      return fail(404, 'home_build_not_found', 'response')
    return fail(502, 'upstream_response_invalid', 'response')
  }
  const declaredLength = Number(upstream.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_RESPONSE_BYTES) {
    void upstream.body?.cancel().catch(() => {})
    return fail(413, 'response_too_large', 'response')
  }
  if (!upstream.body) return fail(502, 'upstream_body_missing', 'response')

  const reader = upstream.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        return fail(413, 'response_too_large', 'read-body')
      }
      chunks.push(value)
    }
  } catch (error) {
    return interrupted('read-body', error) ?? fail(502, 'upstream_read_failed', 'read-body', error)
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(body.byteLength),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  })
}

export const onRequest = methodNotAllowed('GET')
