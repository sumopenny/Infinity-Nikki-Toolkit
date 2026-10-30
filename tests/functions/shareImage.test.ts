import { afterEach, expect, it, vi } from 'vitest'
import { onRequestGet } from '../../functions/api/share-image'
afterEach(() => vi.unstubAllGlobals())
it('rejects arbitrary URLs and traversal before making a request', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  for (const path of [
    'https://example.com/a.png',
    '../secret',
    'items/icons/1.png?x=1',
    'outfits/1.png'
  ]) {
    expect(
      (
        await onRequestGet({
          request: new Request('https://local/api/share-image?path=' + encodeURIComponent(path))
        })
      ).status
    ).toBe(400)
  }
  expect(fetch).not.toHaveBeenCalled()
})
it('only forwards fixed public PNGs without request credentials', async () => {
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } })
  )
  vi.stubGlobal('fetch', fetch)
  const response = await onRequestGet({
    request: new Request('https://local/api/share-image?path=items/icons/123.png', {
      headers: { Cookie: 'private' }
    })
  })
  expect(response.status).toBe(200)
  expect(fetch.mock.calls[0]?.[0]).toBe('https://cdn.gongeo.us/images/items/icons/123.png')
  expect(response.headers.get('content-type')).toBe('image/png')
})
