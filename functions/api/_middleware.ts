import { recordServerError, type ErrorEnv } from '../_lib/errorReporting'

interface Context {
  request: Request
  env: ErrorEnv
  data: Record<string, unknown>
  next(): Promise<Response>
  waitUntil(promise: Promise<unknown>): void
}
/** 不读取请求正文/Cookie；只收集请求阶段、状态和关联编号。 */
export async function onRequest(context: Context): Promise<Response> {
  const pathname = new URL(context.request.url).pathname
  if (pathname === '/api/errors' || context.env.ERROR_REPORTING_ENABLED !== 'true')
    return context.next()
  const started = Date.now()
  let requestId: string = crypto.randomUUID()
  let response: Response, failure: unknown
  const route = pathname.replace(/^(\/api\/(?:outfit-code|home-build))\/.*$/, '$1/:key')
  try {
    response = await context.next()
    requestId = response.headers.get('X-Request-Id') || requestId
  } catch (error) {
    failure = error
    response = Response.json(
      { error: 'SERVER_ERROR' },
      { status: 500, headers: { 'cache-control': 'no-store' } }
    )
  }
  if (response.status >= 500) {
    const detail = context.data.diagnosticFailure as
      | {
          error?: unknown
          stage?: string
          operation?: string
          upstreamStatus?: number
          upstreamDurationMs?: number
          attempts?: number
          timedOut?: boolean
          upstreamErrorName?: string
        }
      | undefined
    context.waitUntil(
      recordServerError(
        context.env,
        detail?.error ?? failure ?? new Error(`HTTP ${response.status}: ${route}`),
        {
          route,
          method: context.request.method,
          status: response.status,
          requestId,
          durationMs: Date.now() - started,
          stage: detail?.stage,
          operation: detail?.operation,
          upstreamStatus: detail?.upstreamStatus,
          upstreamDurationMs: detail?.upstreamDurationMs,
          attempts: detail?.attempts,
          timedOut: detail?.timedOut,
          upstreamErrorName: detail?.upstreamErrorName
        }
      )
    )
  }
  const result = new Response(response.body, response)
  result.headers.set('X-Request-Id', requestId)
  return result
}
