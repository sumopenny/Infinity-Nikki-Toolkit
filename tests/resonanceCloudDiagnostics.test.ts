import { afterEach, expect, it, vi } from 'vitest'
import { handleCloud, type CloudDB } from '../functions/_lib/resonanceCloud'
afterEach(() => vi.restoreAllMocks())
it.each(['session'])('correlates %s errors without exposing raw diagnostics', async (operation) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const user = { id: 'private-user', username: 'private-name' }
  const db = {
    prepare(sql: string) {
      return {
        bind() {
          return this
        },
        async first() {
          if (operation === 'session') throw new Error('SECRET sql token password')
          return sql.includes('rate_limits') ? { count: 1 } : user
        }
      }
    },
    async batch() {
      throw new TypeError('SECRET sql token password')
    }
  } as unknown as CloudDB
  const response = await handleCloud(
    new Request(`https://example.test/?action=${operation}`, {
      headers: { Cookie: `resonance_session=${'a'.repeat(64)}`, 'X-Resonance-Account': user.id }
    }),
    { RESONANCE_DB: db }
  )
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'SERVER_ERROR' })
  expect(log).toHaveBeenCalledWith('resonance-cloud', {
    operation,
    stage: 'session',
    category: 'runtime',
    requestId: response.headers.get('X-Request-Id')
  })
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/SECRET|private-user|private-name|password/)
  expect(response.headers.get('X-Request-Id')).toMatch(/^[a-f0-9-]{36}$/)
})

it.each(['snapshot', 'upload', 'delete'])(
  'rejects removed single-module operation %s before database access',
  async (action) => {
    const prepare = vi.fn()
    const response = await handleCloud(
      new Request('https://example.test/?action=' + action, {
        method: action === 'snapshot' ? 'GET' : 'POST',
        headers: { Origin: 'https://example.test', 'X-Resonance-Request': '1' }
      }),
      { RESONANCE_DB: { prepare } as unknown as CloudDB }
    )
    expect(response.status).toBe(400)
    expect(prepare).not.toHaveBeenCalled()
  }
)
