import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { onRequestGet, onRequest } from '../../functions/api/evolution-animations'
const row = { cid: 123456, page: 1, part: '【3.0限定共鸣】新套装-满进动画', duration: 40 }
let cached: Response | undefined
let puts: Promise<unknown>[]
const upstream = vi.fn()
const put = vi.fn()
const context = () => ({
  request: new Request('https://example.com/api/evolution-animations?bvid=untrusted'),
  waitUntil: (p: Promise<unknown>) => {
    puts.push(p)
  }
})
beforeEach(() => {
  cached = undefined
  puts = []
  upstream.mockReset()
  put.mockReset()
  put.mockImplementation(async (_key, response) => {
    cached = response
  })
  vi.stubGlobal('caches', { default: { match: vi.fn(async () => cached?.clone()), put } })
  vi.stubGlobal('fetch', upstream)
  upstream.mockResolvedValue(Response.json({ code: 0, data: { pages: [row] } }))
})
afterEach(() => vi.unstubAllGlobals())
it('makes one fixed upstream request and serves subsequent reads from cache', async () => {
  const first = await onRequestGet(context())
  await Promise.all(puts)
  expect((await first.json())[0].name).toBe('新套装')
  expect(upstream).toHaveBeenCalledTimes(1)
  expect(upstream.mock.calls[0][0]).toBe(
    'https://api.bilibili.com/x/web-interface/view?bvid=BV1p1sC6ZE6a'
  )
  const second = await onRequestGet(context())
  expect(second.status).toBe(200)
  expect(upstream).toHaveBeenCalledTimes(1)
})
it('serves the last good list when refreshing an expired cache fails', async () => {
  cached = Response.json([{ name: 'last good' }], {
    headers: { 'x-fetched-at': String(Date.now() - 600000) }
  })
  upstream.mockRejectedValue(new Error('timeout'))
  const result = await onRequestGet(context())
  expect(result.headers.get('x-animation-stale')).toBe('true')
  expect(await result.json()).toEqual([{ name: 'last good' }])
  expect(put).not.toHaveBeenCalled()
})
it.each([{ code: -412 }, { code: 0, data: { pages: [] } }])(
  'does not cache upstream errors or an empty list',
  async (value) => {
    upstream.mockResolvedValue(Response.json(value))
    expect((await onRequestGet(context())).status).toBe(502)
    expect(put).not.toHaveBeenCalled()
  }
)
it('does not cache an upstream HTTP failure', async () => {
  upstream.mockResolvedValue(new Response('', { status: 403 }))
  expect((await onRequestGet(context())).status).toBe(502)
})
it('rejects unsupported methods', () => expect(onRequest().status).toBe(405))
