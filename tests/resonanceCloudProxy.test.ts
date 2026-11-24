import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer, type ViteDevServer } from 'vite'
import { resonanceCloudProxy } from '../scripts/resonance-cloud-proxy'

let upstream: Server
let local: Server
let vite: ViteDevServer
let origin: string
let target: string

/** 用本地 HTTP 服务核实代理的来源、Cookie 和请求体。 */
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

beforeAll(async () => {
  upstream = createHttpServer(async (req, res) => {
    if (
      (req.headers.origin && req.headers.origin !== target) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      res.writeHead(403)
      res.end()
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const logout = req.url?.includes('logout')
    res.setHeader('set-cookie', [
      `resonance_session=${logout ? '' : 'test-session'}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${logout ? 0 : 34560000}`,
      'unrelated=value; Secure; HttpOnly'
    ])
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        origin: req.headers.origin,
        cookie: req.headers.cookie,
        body: Buffer.concat(chunks).toString(),
        path: req.url
      })
    )
  })
  target = await listen(upstream)
  vite = await createServer({
    configFile: false,
    appType: 'custom',
    server: {
      middlewareMode: true,
      proxy: {
        '^/api/resonance/cloud(?:\\?|$)': resonanceCloudProxy(target),
        '^/api/wardrobe/cloud(?:\\?|$)': resonanceCloudProxy(target)
      }
    },
    optimizeDeps: { noDiscovery: true, include: [] }
  })
  local = createHttpServer(vite.middlewares)
  origin = await listen(local)
})

afterAll(async () => {
  await vite?.close()
  for (const server of [local, upstream])
    if (server) {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
})

it('forwards same-origin login upstream and adapts only the resonance cookie for local HTTP', async () => {
  const body = JSON.stringify({ username: 'tester', password: 'test-password' })
  const response = await fetch(`${origin}/api/resonance/cloud?action=login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Resonance-Request': '1' },
    body
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    origin: target,
    body,
    path: '/api/resonance/cloud?action=login'
  })
  const cookies = response.headers.getSetCookie()
  expect(cookies[0]).toContain('HttpOnly; SameSite=Strict; Max-Age=34560000')
  expect(cookies[0]).not.toMatch(/;\s*Secure/i)
  expect(cookies[1]).toContain('Secure')
})

it('forwards saved sessions and the logout cookie without a local database', async () => {
  const response = await fetch(`${origin}/api/resonance/cloud?action=session`, {
    headers: { Cookie: 'resonance_session=test-session' }
  })
  expect(await response.json()).toMatchObject({ cookie: 'resonance_session=test-session' })
  const logout = await fetch(`${origin}/api/resonance/cloud?action=logout`, {
    method: 'POST',
    headers: { Origin: origin }
  })
  expect(logout.headers.getSetCookie()[0]).toContain('resonance_session=;')
  expect(logout.headers.getSetCookie()[0]).toContain('Max-Age=0')
})

it('does not rewrite hostile origins or bypass Fetch Metadata checks', async () => {
  const cases: Record<string, string>[] = [
    { Origin: 'https://untrusted.example' },
    { Origin: origin, 'Sec-Fetch-Site': 'cross-site' }
  ]
  for (const headers of cases) {
    const response = await fetch(`${origin}/api/resonance/cloud?action=login`, {
      method: 'POST',
      headers
    })
    expect(response.status).toBe(403)
  }
})

it('forwards wardrobe uploads to the same remote service with the existing account cookie', async () => {
  const body = JSON.stringify({
    requestId: 'fixture',
    revision: 0,
    schemaVersion: 1,
    data: { imported: true }
  })
  const response = await fetch(`${origin}/api/wardrobe/cloud?action=upload`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: 'resonance_session=shared-session',
      'X-Resonance-Request': '1',
      'X-Resonance-Account': 'account'
    },
    body
  })
  expect(await response.json()).toMatchObject({
    origin: target,
    cookie: 'resonance_session=shared-session',
    body,
    path: '/api/wardrobe/cloud?action=upload'
  })
})
