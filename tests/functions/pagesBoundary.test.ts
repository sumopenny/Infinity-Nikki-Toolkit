import { expect, it, vi } from 'vitest'
import { onRequest } from '../../functions/_middleware'

it.each(['/api/like', '/page', '/assets/app.js'])(
  'returns a safe uncached failure when the downstream throws at %s',
  async (path) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await onRequest({
        request: new Request('https://example.test' + path),
        next: async () => {
          throw new Error('private database details')
        }
      })
      expect(response.status).toBe(500)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ error: 'SERVER_ERROR' })
      expect(log).toHaveBeenCalledWith('pages-request-failed')
    } finally {
      log.mockRestore()
    }
  }
)
