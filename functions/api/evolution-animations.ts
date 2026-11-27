import { animationBvid, parseBilibiliEvolution } from '../../src/utils/bilibiliEvolution'
import { failure, methodNotAllowed } from '../_lib/http'

interface Context {
  request: Request
  waitUntil(promise: Promise<unknown>): void
}

/** 缓存保留一天，五分钟内直接返回；刷新失败时仍可使用最后一次有效结果。 */
export async function onRequestGet({ request, waitUntil }: Context): Promise<Response> {
  const key = new Request(new URL('/api/evolution-animations', request.url))
  const cache = (caches as CacheStorage & { default: Cache }).default
  const cached = await cache.match(key).catch(() => undefined)
  const cachedAt = Number(cached?.headers.get('x-fetched-at'))
  const response = (body: BodyInit | null, fetchedAt: number, stale = false) =>
    new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': stale
          ? 'no-store'
          : `public, max-age=${Math.max(0, 300 - Math.floor((Date.now() - fetchedAt) / 1000))}`,
        'x-fetched-at': String(fetchedAt),
        'x-animation-stale': String(stale),
        'x-content-type-options': 'nosniff'
      }
    })
  if (cached && Date.now() - cachedAt < 300000) return response(cached.body, cachedAt)
  try {
    const upstream = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${animationBvid}`,
      {
        headers: { Accept: 'application/json', Referer: 'https://www.bilibili.com/' },
        redirect: 'manual',
        signal: AbortSignal.timeout(8000)
      }
    )
    if (!upstream.ok) throw new Error('Bilibili unavailable')
    const parts = parseBilibiliEvolution(await upstream.json())
    const body = JSON.stringify(parts)
    const fetchedAt = Date.now()
    waitUntil(
      cache
        .put(
          key,
          new Response(body, {
            headers: {
              'content-type': 'application/json',
              'cache-control': 'public, max-age=86400',
              'x-fetched-at': String(fetchedAt)
            }
          })
        )
        .catch(() => undefined)
    )
    return response(body, fetchedAt)
  } catch {
    return cached
      ? response(cached.body, cachedAt, true)
      : failure(502, 'animation_list_unavailable')
  }
}

export const onRequest = methodNotAllowed('GET')
