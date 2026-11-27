import { failure } from './_lib/http'

interface Context {
  request: Request
  next(input?: Request | string): Promise<Response>
}

/** 404.html 关闭 Pages 隐式 SPA 回退；仅普通页面允许显式回退首页。 */
export async function onRequest({ request, next }: Context): Promise<Response> {
  const { pathname } = new URL(request.url)
  try {
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      try {
        decodeURIComponent(pathname)
      } catch {
        return failure(400, 'invalid_path')
      }
      return await next()
    }
    if (!['GET', 'HEAD'].includes(request.method))
      return failure(405, 'method_not_allowed', 'GET, HEAD')
    const response = await next()
    if (response.status !== 404) return response
    if (/^\/(assets|scripts|licenses)(\/|$)/.test(pathname) || /\.[^/]+\/?$/.test(pathname)) {
      const headers = new Headers({
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      })
      if (pathname.startsWith('/assets/')) headers.set('access-control-allow-origin', '*')
      return new Response(request.method === 'HEAD' ? null : 'Not found', { status: 404, headers })
    }
    const url = new URL(request.url)
    // Pages 会把 /index.html 规范化重定向到 /；直接取根路径才能保持深链 URL。
    url.pathname = '/'
    return await next(new Request(url, request))
  } catch {
    console.error('pages-request-failed')
    return failure(500, 'SERVER_ERROR')
  }
}
