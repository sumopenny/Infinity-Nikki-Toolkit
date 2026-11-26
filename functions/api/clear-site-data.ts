import { cookieFor, headers } from '../_lib/cloudShared'

/** 只接受本站主动发起的清理；不访问云端数据库，也不删除云端存档。 */
export function onRequest({ request }: { request: Request }): Response {
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } })
  if (
    request.headers.get('Origin') !== new URL(request.url).origin ||
    request.headers.get('X-Site-Reset') !== '1'
  )
    return new Response(null, { status: 403, headers })
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      'Clear-Site-Data': '"cache", "cookies", "storage"',
      // 不支持 Clear-Site-Data 的浏览器也必须清除本站 HttpOnly 登录 Cookie。
      'Set-Cookie': cookieFor(request, '', true)
    }
  })
}
