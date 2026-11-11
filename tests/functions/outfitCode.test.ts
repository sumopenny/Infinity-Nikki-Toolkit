import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestGet } from '../../functions/api/outfit-code/[id]'

const makeContext = (id: string) => {
  const request = new Request(`https://example.test/api/outfit-code/${id}`)
  return { request, params: { id } }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('outfit-code Pages Function', () => {
  it('fetches only the matching object and forwards its body and content type', async () => {
    const upstream = new Response('{"clothes":[]}', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' }
    })
    const fetchMock = vi.fn().mockResolvedValue(upstream)
    vi.stubGlobal('fetch', fetchMock)

    const response = await onRequestGet(makeContext('488547348102388135'))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://x6cn-clothdiydata.nuanpaper.com/default/488547348102388135.json',
      { signal: expect.any(AbortSignal), redirect: 'manual' }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-outfit-proxy-upstream-ms')).toMatch(/^\d+$/)
    await expect(response.text()).resolves.toBe('{"clothes":[]}')
  })

  it.each(['', 'not-an-id', '../123', '123.json', '-123'])(
    'leaves object existence to the upstream for %s',
    async (id) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }))
      vi.stubGlobal('fetch', fetchMock)

      const response = await onRequestGet(makeContext(id))

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({ error: 'upstream_rejected' })
      expect(fetchMock).toHaveBeenCalledWith(
        `https://x6cn-clothdiydata.nuanpaper.com/default/${encodeURIComponent(id)}.json`,
        expect.any(Object)
      )
    }
  )

  it.each(['81919035101291850', '1234567890123456789'])(
    'accepts numeric object id %s without a fixed length limit',
    async (id) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{"clothes":[]}'))
      vi.stubGlobal('fetch', fetchMock)
      const response = await onRequestGet(makeContext(id))
      expect(response.status).toBe(200)
      expect(fetchMock).toHaveBeenCalledWith(
        `https://x6cn-clothdiydata.nuanpaper.com/default/${id}.json`,
        expect.any(Object)
      )
    }
  )

  it('preserves an upstream 404 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })))

    const response = await onRequestGet(makeContext('488547348102388135'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'upstream_rejected' })
  })

  it('returns 502 when the upstream request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')))

    const response = await onRequestGet(makeContext('488547348102388135'))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'upstream_unavailable' })
  })

  it('returns 504 when the fixed upstream request times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')))
    const timeoutMock = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation(() => AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')))

    const response = await onRequestGet(makeContext('488547348102388135'))

    expect(response.status).toBe(504)
    expect(timeoutMock).toHaveBeenCalledWith(8_000)
    expect(response.headers.get('x-outfit-proxy-upstream-ms')).toMatch(/^\d+$/)
    await expect(response.json()).resolves.toEqual({ error: 'upstream_timeout' })
  })
})

it.each(['timeout', 'request'] as const)(
  'keeps %s protection active after response headers',
  async (source) => {
    const timeout = new AbortController(),
      client = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
    let signal!: AbortSignal
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        signal = init.signal
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              signal.addEventListener('abort', () => controller.error(signal.reason), {
                once: true
              })
            }
          })
        )
      })
    )
    const pending = onRequestGet({
      request: new Request('https://example.test', { signal: client.signal }),
      params: { id: '488547348102388135' }
    })
    await vi.waitFor(() => expect(signal).toBeDefined())
    expect(signal.aborted).toBe(false)
    const reason = new Error('body interrupted')
    ;(source === 'timeout' ? timeout : client).abort(reason)
    const response = await pending
    expect(response.status).toBe(source === 'timeout' ? 504 : 499)
    await expect(response.json()).resolves.toEqual({
      error: source === 'timeout' ? 'upstream_timeout' : 'request_aborted'
    })
    expect(signal.aborted).toBe(true)
  }
)
it('does not cancel a shared upstream when only one caller leaves', async () => {
  const client = new AbortController()
  let body!: ReadableStreamDefaultController<Uint8Array>
  let signal!: AbortSignal
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      signal = init.signal
      return new Response(
        new ReadableStream({
          start(controller) {
            body = controller
          }
        })
      )
    })
  )
  const first = onRequestGet({
    ...makeContext('488547348102388135'),
    request: new Request('https://example.test', { signal: client.signal })
  })
  const second = onRequestGet(makeContext('488547348102388135'))
  await vi.waitFor(() => expect(body).toBeDefined())
  client.abort()
  expect((await first).status).toBe(499)
  expect(signal.aborted).toBe(false)
  body.enqueue(new TextEncoder().encode('{"clothes":[]}'))
  body.close()
  expect((await second).status).toBe(200)
  expect(fetch).toHaveBeenCalledOnce()
})

/** 模拟 Cache API，保留过期记录以验证应用自己的到期检查。 */
function edgeCache() {
  const values = new Map<string, Response>()
  const cache = {
    match: vi.fn(async (key: Request) => values.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, value: Response) => {
      values.set(key.url, value.clone())
    })
  }
  vi.stubGlobal('caches', { default: cache })
  return { cache, values }
}

it('stores only an internal public response for one hour, then refetches after expiry', async () => {
  const { cache, values } = edgeCache()
  const fetchMock = vi.fn(async () => new Response('{"clothes":[]}'))
  vi.stubGlobal('fetch', fetchMock)
  const writes: Promise<unknown>[] = []
  const context = {
    ...makeContext('488547348102388135'),
    waitUntil: (p: Promise<unknown>) => {
      writes.push(p)
    }
  }
  const first = await onRequestGet(context)
  await Promise.all(writes)
  expect(first.headers.get('x-outfit-cache')).toBe('MISS')
  expect(first.headers.get('cache-control')).toBe('private, no-store')
  const entry = [...values.values()][0]
  expect(entry.headers.get('cache-control')).toBe('public, max-age=3600')
  const hit = await onRequestGet(context)
  expect(hit.headers.get('x-outfit-cache')).toBe('HIT')
  expect(hit.headers.get('cache-control')).toBe('private, no-store')
  expect(hit.headers.get('x-outfit-proxy-upstream-ms')).toBeNull()
  expect(hit.headers.get('server-timing')).not.toContain('upstream')
  expect(await hit.text()).toBe('{"clothes":[]}')
  expect(fetchMock).toHaveBeenCalledOnce()
  entry.headers.set('x-outfit-cache-expires', String(Date.now() - 1))
  expect((await onRequestGet(context)).headers.get('x-outfit-cache')).toBe('MISS')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(cache.put).toHaveBeenCalledTimes(2)
})

it.each([
  [404, 'missing'],
  [502, 'bad gateway'],
  [504, 'timeout'],
  [200, '<html>error</html>'],
  [200, '{"clothes":[]'],
  [200, '{}'],
  [200, '{"clothes":[{"cloth":{"id":-1}}]}']
])('never caches an invalid upstream response (%s, %s)', async (status, body) => {
  const { cache } = edgeCache()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status }))
  )
  expect((await onRequestGet(makeContext('488547348102388135'))).status).not.toBe(200)
  expect(cache.put).not.toHaveBeenCalled()
})

it('accepts native map syntax and preserves the original bytes', async () => {
  const { cache } = edgeCache()
  const body =
    '{"Content":{"Content":{"patternData":[:1025740294:0],"wearingClothes":[1025740294]}}}'
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body))
  )
  const response = await onRequestGet(makeContext('488547348102388135'))
  expect(response.status).toBe(200)
  expect(await response.text()).toBe(body)
  expect(cache.put).toHaveBeenCalledOnce()
})

it('fails closed on interrupted and oversized bodies without caching', async () => {
  const { cache } = edgeCache()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.error(new Error('truncated'))
            }
          })
        )
    )
  )
  expect((await onRequestGet(makeContext('488547348102388135'))).status).toBe(502)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array(1024 * 1024 + 1)))
  )
  const response = await onRequestGet(makeContext('488547348102388135'))
  expect(response.status).toBe(502)
  expect(await response.json()).toEqual({ error: 'upstream_body_too_large' })
  expect(cache.put).not.toHaveBeenCalled()
})

it('keeps successful parsing available when cache reads or writes fail', async () => {
  const { cache } = edgeCache()
  cache.match.mockRejectedValue(new Error('cache unavailable'))
  cache.put.mockRejectedValue(new Error('cache unavailable'))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"clothes":[]}'))
  )
  const writes: Promise<unknown>[] = []
  const response = await onRequestGet({
    ...makeContext('488547348102388135'),
    waitUntil: (p) => {
      writes.push(p)
    }
  })
  await Promise.all(writes)
  expect(response.status).toBe(200)
})

it('isolates object IDs and excludes caller query parameters and credentials from cache keys', async () => {
  const { cache } = edgeCache()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"clothes":[]}'))
  )
  const id = '488547348102388135'
  await onRequestGet({
    request: new Request(`https://example.test/api/outfit-code/${id}?extra=1`, {
      headers: { Cookie: 'private=1' }
    }),
    params: { id }
  })
  const hit = await onRequestGet(makeContext(id))
  expect(hit.headers.get('x-outfit-cache')).toBe('HIT')
  const other = await onRequestGet(makeContext('488547348102388136'))
  expect(other.headers.get('x-outfit-cache')).toBe('MISS')
  expect(fetch).toHaveBeenCalledTimes(2)
  const key = cache.put.mock.calls[0][0]
  expect(key.url).toBe(`https://example.test/api/outfit-code/${id}?edge-cache=v1`)
  expect(key.headers.get('cookie')).toBeNull()
})

it('preserves a bodyless 404 and rejects oversized Content-Length without caching', async () => {
  const { cache } = edgeCache()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 }))
  )
  expect((await onRequestGet(makeContext('488547348102388135'))).status).toBe(404)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"clothes":[]}', { headers: { 'content-length': '1048577' } }))
  )
  expect((await onRequestGet(makeContext('488547348102388135'))).status).toBe(502)
  expect(cache.put).not.toHaveBeenCalled()
})
