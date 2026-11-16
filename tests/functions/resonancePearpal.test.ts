import { afterEach, expect, it, vi } from 'vitest'
import { onRequestPost } from '../../functions/api/resonance/pearpal'
afterEach(() => vi.unstubAllGlobals())
it('retires the proxy without forwarding credentials', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const response = await onRequestPost()
  expect(response.status).toBe(410)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ error: 'pearpal_proxy_retired' })
  expect(fetcher).not.toHaveBeenCalled()
})
