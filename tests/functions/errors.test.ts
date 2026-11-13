import { describe, expect, it, vi } from 'vitest'
import {
  handleErrorReport,
  storeErrorEvent,
  type ErrorDatabase,
  type ErrorEnv
} from '../../functions/_lib/errorReporting'
import { onRequest as middleware } from '../../functions/api/_middleware'
import { onRequestGet as homeBuildEndpoint } from '../../functions/api/home-build/[key]'
import { sampleEvent } from '../utils/errorReporting/fixture'
import { onRequest as wardrobeEndpoint } from '../../functions/api/wardrobe/cloud'
import type { CloudDB } from '../../functions/_lib/cloudShared'

/** 纯对象 D1 替身；不启动 Wrangler、SQLite 或 IndexedDB。SQL 真正执行留给云端验收。 */
function fakeDatabase() {
  const events = new Map<string, string>()
  let writes = 0
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const db: ErrorDatabase = {
    prepare(sql) {
      let values: unknown[] = []
      const statement = {
        sql,
        get values() {
          return values
        },
        bind(...args: unknown[]) {
          values = args
          return statement
        },
        async first<T>() {
          calls.push({ sql, values })
          if (sql.startsWith('SELECT payload_hash')) {
            const value = events.get(String(values[0]))
            return (value ? { payload_hash: value } : null) as T | null
          }
          if (sql.startsWith('INSERT INTO error_rate_limits')) return { count: 1 } as T
          return null
        },
        async run() {
          return {}
        }
      }
      return statement
    },
    async batch(statements) {
      const insert = statements[0] as unknown as { sql: string; values: unknown[] }
      calls.push(insert)
      const id = String(insert.values[0]),
        hash = String(insert.values[2])
      const inserted = !events.has(id)
      if (inserted) {
        events.set(id, hash)
        writes++
      }
      return [
        { success: true, results: inserted ? [{ event_id: id }] : [] },
        { success: true, results: [] }
      ]
    }
  }
  const env: ErrorEnv = {
    ERROR_DB: db,
    ERROR_REPORTING_ENABLED: 'true',
    ERROR_RATE_LIMIT_SALT: 'test-only-non-secret-salt-00000000000000'
  }
  return { db, env, calls, writes: () => writes, events }
}
function request(body: unknown = sampleEvent(), extra: HeadersInit = {}) {
  return new Request('https://example.com/api/errors', {
    method: 'POST',
    headers: {
      Origin: 'https://example.com',
      'Content-Type': 'application/json',
      'X-Error-Report': '1',
      ...extra
    },
    body: JSON.stringify(body)
  })
}
describe('error intake contract without a database', () => {
  it('keeps the service inert without configuration', async () => {
    const state = fakeDatabase()
    const result = await handleErrorReport(request(), {
      ...state.env,
      ERROR_REPORTING_ENABLED: 'false'
    })
    expect(result.status).toBe(503)
    expect(state.calls).toHaveLength(0)
  })
  it('does not create a database when the binding is missing', async () => {
    expect((await handleErrorReport(request(), { ERROR_REPORTING_ENABLED: 'true' })).status).toBe(
      503
    )
  })
  it('never exposes a public read endpoint', async () => {
    const { env } = fakeDatabase()
    const result = await handleErrorReport(new Request('https://example.com/api/errors'), env)
    expect(result.status).toBe(405)
  })
  it.each([
    { Origin: 'https://attacker.invalid' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'X-Error-Report': '0' }
  ] as Record<string, string>[])(
    'rejects forbidden origins/headers before writing: %j',
    async (headers) => {
      const state = fakeDatabase()
      expect((await handleErrorReport(request(sampleEvent(), headers), state.env)).status).toBe(403)
      expect(state.calls).toHaveLength(0)
    }
  )
  it('limits the actual request body even without a Content-Length header', async () => {
    const state = fakeDatabase()
    expect(
      (await handleErrorReport(request({ padding: 'x'.repeat(66000) }), state.env)).status
    ).toBe(413)
    expect(state.writes()).toBe(0)
  })
  it('rejects invalid protocol and client-supplied server errors', async () => {
    const state = fakeDatabase()
    expect((await handleErrorReport(request({}), state.env)).status).toBe(400)
    expect(
      (await handleErrorReport(request({ ...sampleEvent(), type: 'server' }), state.env)).status
    ).toBe(400)
    expect(state.writes()).toBe(0)
  })
  it('reports acceptance only after the storage call completes', async () => {
    const state = fakeDatabase()
    const response = await handleErrorReport(request(), state.env)
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ accepted: true, replayed: false })
    expect(state.writes()).toBe(1)
  })
  it('handles identical retries idempotently', async () => {
    const state = fakeDatabase()
    await handleErrorReport(request(), state.env)
    const response = await handleErrorReport(request(), state.env)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ replayed: true })
    expect(state.writes()).toBe(1)
  })
  it('rejects reuse of an event ID with changed contents', async () => {
    const state = fakeDatabase()
    await handleErrorReport(request(), state.env)
    expect(
      (await handleErrorReport(request({ ...sampleEvent(), action: 'different' }), state.env))
        .status
    ).toBe(409)
    expect(state.writes()).toBe(1)
  })
  it('binds diagnostic contents as SQL parameters', async () => {
    const state = fakeDatabase(),
      event = sampleEvent()
    event.error.message = "'); DROP TABLE error_events; --"
    await storeErrorEvent(state.env, event)
    const insert = state.calls.find((call) => call.sql.startsWith('INSERT INTO error_events'))!
    expect(insert.sql).not.toContain('DROP TABLE')
    expect(insert.values).toContain(event.error.message)
  })
  it('does not claim success when D1 fails', async () => {
    const state = fakeDatabase(),
      log = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.db.batch = async () => {
      throw new Error('D1 unavailable')
    }
    try {
      const result = await handleErrorReport(request(), state.env)
      expect(result.status).toBe(503)
      expect(await result.json()).not.toHaveProperty('accepted', true)
    } finally {
      log.mockRestore()
    }
  })
  it('does not affect successful API responses', async () => {
    const state = fakeDatabase(),
      tasks: Promise<unknown>[] = []
    const response = await middleware({
      request: new Request('https://example.com/api/like'),
      env: state.env,
      data: {},
      next: async () => Response.json({ count: 123 }),
      waitUntil: (task) => tasks.push(task)
    })
    expect(await response.json()).toEqual({ count: 123 })
    expect(response.headers.get('X-Request-Id')).toBeTruthy()
    expect(tasks).toHaveLength(0)
  })
  it('filters outfit 504 responses and reports from older clients before writing to D1', async () => {
    const state = fakeDatabase()
    const waitUntil = vi.fn()
    const response = await middleware({
      request: new Request('https://example.test/api/outfit-code/test'),
      env: state.env, data: {}, next: async () => new Response(null, { status: 504 }), waitUntil
    })
    expect(response.status).toBe(504)
    expect(waitUntil).not.toHaveBeenCalled()
    const event = sampleEvent()
    event.module = 'outfits'
    event.action = 'parse'
    event.error.message = 'Lookbook object request failed with 504'
    expect((await handleErrorReport(request(event), state.env)).status).toBe(200)
    expect(state.writes()).toBe(0)
    event.error.message = 'Lookbook object request failed with 502'
    expect((await handleErrorReport(request(event), state.env)).status).toBe(201)
  })

  it('stores final home proxy diagnostics once with the response request ID', async () => {
    const state = fakeDatabase(),
      tasks: Promise<unknown>[] = [],
      data = {}
    const request = new Request('https://example.test/api/home-build/UDB66QH')
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('private upstream body', { status: 503 }))
    try {
      const response = await middleware({
        request,
        env: state.env,
        data,
        next: () => homeBuildEndpoint({ request, params: { key: 'UDB66QH' }, data }),
        waitUntil: (task) => tasks.push(task)
      })
      await Promise.all(tasks)
      expect(response.status).toBe(502)
      expect(state.writes()).toBe(1)
      const serialized = JSON.stringify(state.calls)
      expect(serialized).toContain('upstream_response_invalid')
      expect(serialized).toContain('upstreamStatus')
      expect(serialized).toContain('503')
      expect(serialized).toContain('home-build-fetch')
      expect(serialized).toContain(response.headers.get('X-Request-Id'))
      expect(serialized).not.toContain('private upstream body')
      expect(serialized).not.toContain('UDB66QH')
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally {
      fetcher.mockRestore()
    }
  })
  it('records original server failures without leaking them to the response', async () => {
    const state = fakeDatabase(),
      tasks: Promise<unknown>[] = []
    const response = await middleware({
      request: new Request('https://example.com/api/like'),
      env: state.env,
      data: {},
      next: async () => {
        throw new Error('private database exception')
      },
      waitUntil: (task) => tasks.push(task)
    })
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('private database exception')
    await Promise.all(tasks)
    expect(state.writes()).toBe(1)
  })
  it('never recursively reports the reporting endpoint', async () => {
    const state = fakeDatabase(),
      waitUntil = vi.fn()
    const response = await middleware({
      request: request(),
      env: state.env,
      data: {},
      next: async () => new Response('', { status: 503 }),
      waitUntil
    })
    expect(response.status).toBe(503)
    expect(waitUntil).not.toHaveBeenCalled()
  })
  it('stores the original wardrobe failure, operation, stage and correlated response ID', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const state = fakeDatabase(),
        tasks: Promise<unknown>[] = [],
        data = {}
      const cause = new Error('wardrobe-database-fixture')
      const request = new Request('https://example.test/api/wardrobe/cloud?action=summary', {
        headers: { Cookie: `resonance_session=${'a'.repeat(64)}` }
      })
      const db = {
        prepare() {
          throw cause
        }
      } as unknown as CloudDB
      const response = await middleware({
        request,
        env: state.env,
        data,
        next: () => wardrobeEndpoint({ request, env: { RESONANCE_DB: db }, data }),
        waitUntil: (task) => tasks.push(task)
      })
      await Promise.all(tasks)
      expect(response.status).toBe(500)
      expect(state.writes()).toBe(1)
      const serialized = JSON.stringify(state.calls)
      expect(serialized).toContain('wardrobe-database-fixture')
      expect(serialized).toContain('summary')
      expect(serialized).toContain('session')
      expect(serialized).toContain(response.headers.get('X-Request-Id'))
      expect(serialized).not.toContain('a'.repeat(64))
    } finally {
      log.mockRestore()
    }
  })
})
