// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { onRequest } from '../../functions/api/clear-site-data'

it.each([
  ['POST', 'https://example.test', '1', 204],
  ['GET', 'https://example.test', '1', 405],
  ['OPTIONS', 'https://example.test', '1', 405],
  ['POST', 'https://other.test', '1', 403],
  ['POST', '', '1', 403],
  ['POST', 'https://example.test', '', 403]
])('guards site reset: %s %s %s', async (method, origin, marker, status) => {
  const prepare = vi.fn()
  const fetch = vi.fn()
  const context = {
    env: { ASSETS: { fetch }, RESONANCE_DB: { prepare } },
    request: new Request('https://example.test/api/clear-site-data', {
      method,
      headers: { Origin: origin, 'X-Site-Reset': marker }
    })
  }
  const response = await onRequest(context)
  expect(response.status).toBe(status)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(prepare).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  if (status === 204) {
    expect(response.headers.get('Clear-Site-Data')).toBe('"cache", "cookies", "storage"')
    expect(response.headers.get('Set-Cookie')).toContain('resonance_session=;')
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0; Secure')
  } else {
    expect(response.headers.has('Clear-Site-Data')).toBe(false)
    expect(response.headers.has('Set-Cookie')).toBe(false)
  }
})
