import { afterEach, expect, it, vi } from 'vitest'
import { onRequest } from '../functions/api/wardrobe/cloud'
import type { CloudDB } from '../functions/_lib/cloudShared'

afterEach(() => vi.restoreAllMocks())
it('passes the original wardrobe failure and stage to server diagnostics while keeping the response safe', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const failure = new Error('private database failure')
  const data: Record<string, unknown> = {}
  const db = {
    prepare() {
      throw failure
    }
  } as unknown as CloudDB
  const response = await onRequest({
    request: new Request('https://example.test/api/wardrobe/cloud?action=summary', {
      headers: { Cookie: `resonance_session=${'a'.repeat(64)}` }
    }),
    env: { RESONANCE_DB: db },
    data
  })
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'SERVER_ERROR' })
  expect(data.diagnosticFailure).toEqual({ error: failure, operation: 'summary', stage: 'session' })
  expect(response.headers.get('X-Request-Id')).toMatch(/^[a-f0-9-]{36}$/)
  expect(JSON.stringify(log.mock.calls)).not.toContain('private database failure')
})
it('does not collect expected configuration errors as unexpected database failures', async () => {
  const data = {}
  const response = await onRequest({
    request: new Request('https://example.test/api/wardrobe/cloud?action=summary'),
    env: {},
    data
  })
  expect(response.status).toBe(503)
  expect(data).toEqual({})
})
