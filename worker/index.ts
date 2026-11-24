import { onRequest as middleware } from '../functions/api/_middleware'
import { onRequestGet as likeGet, onRequestPost as likePost } from '../functions/api/like'
import { onRequest as resonance } from '../functions/api/resonance/cloud'
import { onRequest as archive } from '../functions/api/archive/cloud'
import { onRequestGet as outfit } from '../functions/api/outfit-code/[id]'
import { onRequestGet as home } from '../functions/api/home-build/[key]'
import { onRequestGet as image } from '../functions/api/share-image'
import { onRequestPost as pearpal } from '../functions/api/resonance/pearpal'
import { onRequest as errors } from '../functions/api/errors'
import type { CloudEnv } from '../functions/_lib/cloudShared'
import type { ErrorEnv } from '../functions/_lib/errorReporting'
import { pruneDiagnostics } from '../scripts/error-retention.mjs'

export type Env = CloudEnv &
  ErrorEnv &
  Parameters<typeof likeGet>[0]['env'] & {
    ASSETS: { fetch(request: Request): Promise<Response> }
    VERSION_METADATA?: { id: string; tag: string; timestamp: string }
  }
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}
const failure = (status: number, error: string, allow?: string) =>
  Response.json(
    { error },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...(allow ? { Allow: allow } : {})
      }
    }
  )

async function api(request: Request, env: Env, execution: ExecutionContext): Promise<Response> {
  const pathname = new URL(request.url).pathname.replace(/\/$/, '')
  const context = {
    request,
    env,
    data: {} as Record<string, unknown>,
    waitUntil: (promise: Promise<unknown>) => execution.waitUntil(promise)
  }
  const dispatch = async () => {
    const method = request.method
    const select = (methods: string[], handler: () => Promise<Response> | Response) =>
      methods.includes(method) ? handler() : failure(405, 'method_not_allowed', methods.join(', '))
    switch (pathname) {
      case '/api/like':
        return select(['GET', 'POST'], () =>
          method === 'GET' ? likeGet(context) : likePost(context)
        )
      case '/api/resonance/cloud':
        return select(['GET', 'POST'], () => resonance(context))
      case '/api/archive/cloud':
        return select(['GET', 'POST'], () => archive(context))
      case '/api/share-image':
        return select(['GET'], () => image(context))
      case '/api/resonance/pearpal':
        return select(['POST'], pearpal)
      case '/api/errors':
        return select(['POST'], () => errors(context))
    }
    const match = /^\/api\/(outfit-code|home-build)\/([^/]+)$/.exec(pathname)
    if (!match) return failure(404, 'not_found')
    let value: string
    try {
      value = decodeURIComponent(match[2])
    } catch {
      return failure(400, 'invalid_path')
    }
    return select(['GET'], () =>
      match[1] === 'outfit-code'
        ? outfit({ ...context, params: { id: value } })
        : home({ ...context, params: { key: value } })
    )
  }
  return middleware({ ...context, next: dispatch })
}

export default {
  async fetch(request: Request, env: Env, execution: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const runtimeEnv = {
      ...env,
      ERROR_SERVER_BUILD_ID: env.ERROR_SERVER_BUILD_ID || env.VERSION_METADATA?.id
    }
    try {
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        return await api(request, runtimeEnv, execution)
      }
      if (!['GET', 'HEAD'].includes(request.method))
        return failure(405, 'method_not_allowed', 'GET, HEAD')
      const asset = await env.ASSETS.fetch(request)
      if (asset.status !== 404) return asset
      // Resource misses must never become HTML app shells, including navigation requests.
      if (
        /^\/(assets|scripts|licenses)(\/|$)/.test(url.pathname) ||
        /\.[^/]+\/?$/.test(url.pathname)
      ) {
        const headers = new Headers({
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff'
        })
        if (url.pathname.startsWith('/assets/')) headers.set('access-control-allow-origin', '*')
        return new Response(request.method === 'HEAD' ? null : 'Not found', {
          status: 404,
          headers
        })
      }
      url.pathname = '/index.html'
      return env.ASSETS.fetch(new Request(url, request))
    } catch {
      // Never log request bodies, cookies, URLs containing credentials, or arbitrary thrown values.
      console.error('worker-request-failed')
      return failure(500, 'SERVER_ERROR')
    }
  },
  async scheduled(controller: { scheduledTime: number }, env: Env): Promise<void> {
    if (!env.ERROR_DB) throw new Error('ERROR_DB binding required for retention')
    try {
      const db = env.ERROR_DB
      const result = await pruneDiagnostics(async (sql: string) => {
        const results = await db.batch([db.prepare(sql)])
        if (results.some((result) => result.success === false))
          throw new Error('Retention query failed')
        return results
      }, controller.scheduledTime)
      console.log('diagnostic-retention-complete', result)
    } catch {
      console.error('diagnostic-retention-failed')
      throw new Error('Diagnostic retention failed')
    }
  }
}
