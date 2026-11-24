import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { handleCloud, type CloudDB, type CloudEnv } from '../functions/_lib/resonanceCloud'

let mf: Miniflare
let env: CloudEnv
let cookie = ''
let account = ''
/** 使用实际本地 D1 SQL 引擎验证事务、账户隔离与覆盖，不用模拟 SQL 字符串断言。 */
async function request(
  action: string,
  body?: unknown,
  overrides: Record<string, string> = {},
  environment = env
) {
  const req = new Request(`https://example.test/api/resonance/cloud?action=${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.test',
      'X-Resonance-Request': '1',
      Cookie: cookie,
      'X-Resonance-Account': account,
      'CF-Connecting-IP': '127.0.0.1',
      ...overrides
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  if (environment !== env) return handleCloud(req, environment)
  const response = await mf.dispatchFetch(req.url, {
    method: req.method,
    headers: Object.fromEntries(req.headers),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: Object.fromEntries(response.headers)
  })
}
beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents:
        "import {handleCloud} from './functions/_lib/resonanceCloud.ts'; export default {fetch:handleCloud}",
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022'
  })
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-09-19',
      d1Databases: ['RESONANCE_DB']
    })
  )
  const db = await mf.getD1Database('RESONANCE_DB')
  const sql = await readFile('migrations-resonance/0001_cloud.sql', 'utf8')
  await db.exec(sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' '))
  env = { RESONANCE_DB: db as unknown as CloudDB }
}, 30000)
afterAll(async () => {
  await mf?.dispose()
})

describe('cloud accounts', () => {
  it('requires a configured binding and rejects cross-origin writes', async () => {
    expect((await request('session', undefined, {}, {})).status).toBe(503)
    expect((await request('register', {}, { Origin: 'https://attacker.test' })).status).toBe(403)
    expect((await request('register', {}, { 'X-Resonance-Request': '' })).status).toBe(403)
    expect((await request('register', { username: "x' OR 1=1", password: '123456' })).status).toBe(
      400
    )
  })
  it('registers a case-insensitive account with a six-character password and secure persistent cookie', async () => {
    const response = await request('register', { username: 'Nikki_Test', password: '123456' })
    expect(response.status).toBe(200)
    expect(response.headers.get('Set-Cookie')).toContain(
      'HttpOnly; SameSite=Strict; Max-Age=34560000; Secure'
    )
    cookie = response.headers.get('Set-Cookie')!.split(';')[0]
    const value = (await response.json()) as { user: { id: string; username: string } }
    account = value.user.id
    expect(value.user.username).toBe('nikki_test')
    const stored = await env
      .RESONANCE_DB!.prepare('SELECT password_hash FROM cloud_users WHERE id=?')
      .bind(account)
      .first<{ password_hash: string }>()
    expect(stored?.password_hash).toMatch(/^argon2id-v1\$/)
    expect(stored?.password_hash).not.toContain('123456')
    expect((await request('register', { username: 'NIKKI_TEST', password: '123456' })).status).toBe(
      409
    )
  }, 30000)
  it('isolates accounts and rejects missing sessions on logout', async () => {
    expect((await request('logout', {}, { Cookie: '' })).status).toBe(401)
    expect((await request('logout', {}, { 'X-Resonance-Account': 'another-user' })).status).toBe(
      409
    )
    expect(await (await request('session')).json()).toMatchObject({ user: { id: account } })
  })
  it('limits login attempts before hashing and uses a generic credential error', async () => {
    const response = await request('login', { username: 'nikki_test', password: 'wrong1' })
    expect(await response.json()).toEqual({ error: 'CREDENTIALS' })
    await env
      .RESONANCE_DB!.prepare("UPDATE cloud_rate_limits SET count=10 WHERE key='account:nikki_test'")
      .run()
    expect((await request('login', { username: 'nikki_test', password: '123456' })).status).toBe(
      429
    )
  }, 30000)
  it('logs out without deleting the account', async () => {
    expect((await request('logout', {})).status).toBe(200)
    expect(await (await request('session')).json()).toEqual({ user: null })
    expect(
      await env.RESONANCE_DB!.prepare('SELECT id FROM cloud_users WHERE id=?').bind(account).first()
    ).toMatchObject({ id: account })
  })
})
