import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pruneDiagnostics } from '../../scripts/error-retention.mjs'
import { archiveUpload } from '../fixtures/archiveCloud'
import { sampleEvent } from '../utils/errorReporting/fixture'

let runtime: Miniflare
let directory: string
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nikki-worker-'))
  await mkdir(join(directory, 'assets'))
  await mkdir(join(directory, 'scripts'))
  await copyFile('public/_headers', join(directory, '_headers'))
  await writeFile(join(directory, 'index.html'), '<html>app-shell</html>')
  await writeFile(join(directory, 'assets/catalog.json'), '{"ok":true}')
  await writeFile(join(directory, 'assets/app.js'), 'export default 1')
  await writeFile(join(directory, 'assets/app.css'), 'body{}')
  await writeFile(
    join(directory, 'assets/parser.wasm'),
    new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])
  )
  for (const name of ['sw.js', 'manifest.webmanifest', 'pwa-192.png'])
    await copyFile('public/' + name, join(directory, name))
  await writeFile(join(directory, 'scripts/pearpal-cookie.user.js'), '// userscript')
  // A real static file under /api must never bypass API dispatch.
  await mkdir(join(directory, 'api'))
  await writeFile(join(directory, 'api/like'), 'must-not-serve')
  const bundle = await build({
    entryPoints: ['worker/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022'
  })
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: 'worker-integration-test',
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-09-19',
      d1Databases: ['DB', 'RESONANCE_DB', 'ERROR_DB'],
      bindings: {
        ERROR_REPORTING_ENABLED: 'true',
        ERROR_RATE_LIMIT_SALT: 'local-test-only-salt-at-least-32-characters',
        ERROR_SERVER_BUILD_ID: 'test-worker-version'
      },
      assets: {
        routerConfig: { has_user_worker: true },
        directory,
        binding: 'ASSETS',
        run_worker_first: ['/api', '/api/*'],
        assetConfig: { html_handling: 'none', not_found_handling: 'none' }
      }
    })
  )
  for (const [binding, files] of [
    ['DB', ['migrations/0001_create_like_counter.sql']],
    [
      'RESONANCE_DB',
      [
        'migrations-resonance/0001_cloud.sql',
        'migrations-resonance/0002_wardrobe_cloud.sql',
        'migrations-resonance/0003_archive_cloud.sql'
      ]
    ],
    ['ERROR_DB', ['migrations-errors/0001_error_diagnostics.sql']]
  ] as const) {
    const db = await runtime.getD1Database(binding)
    for (const file of files)
      await db.exec((await readFile(file, 'utf8')).replace(/--[^\n]*/g, '').replace(/\s+/g, ' '))
  }
}, 60000)
afterAll(async () => {
  await runtime?.dispose()
  if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep))
    await rm(directory, { recursive: true, force: true })
})
const request = (path: string, init?: Parameters<Miniflare['dispatchFetch']>[1]) =>
  runtime.dispatchFetch('https://example.test' + path, init)

it('keeps deployment settings aligned with the tested asset routing', async () => {
  const config = await readFile('wrangler.toml', 'utf8')
  expect(config).toContain('run_worker_first = ["/api", "/api/*"]')
  expect(config).toContain('not_found_handling = "none"')
  expect(config).toContain('html_handling = "none"')
  expect(config).not.toContain('pages_build_output_dir')
})
it('serves real assets and pages with correct MIME types and headers', async () => {
  for (const path of ['/', '/previous-page', '/deep/page/']) {
    const response = await request(path)
    expect(response.status, path).toBe(200)
    expect(await response.text()).toContain('app-shell')
  }
  for (const [path, type] of [
    ['/assets/catalog.json', 'application/json'],
    ['/assets/app.js', 'javascript'],
    ['/assets/app.css', 'text/css'],
    ['/assets/parser.wasm', 'application/wasm'],
    ['/scripts/pearpal-cookie.user.js', 'text/plain'],
    ['/manifest.webmanifest', 'manifest'],
    ['/sw.js', 'javascript'],
    ['/pwa-192.png', 'image/png']
  ]) {
    const response = await request(path)
    expect(response.status, path).toBe(200)
    expect(response.headers.get('content-type'), path).toContain(type)
    if (path.startsWith('/assets/')) {
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    }
  }
  expect(await (await request('/previous-page', { method: 'HEAD' })).text()).toBe('')
})
it('never falls back to HTML for missing resources, API paths, or wrong methods', async () => {
  for (const path of [
    '/assets/old.js',
    '/assets/missing.json',
    '/assets/missing.wasm',
    '/assets/extensionless',
    '/scripts/missing',
    '/missing.png'
  ]) {
    for (const headers of [{}, { 'sec-fetch-mode': 'navigate' }] as Record<string, string>[]) {
      const response = await request(path, { headers })
      expect(response.status, path).toBe(404)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.text()).not.toContain('app-shell')
    }
  }
  for (const path of ['/api', '/api/unknown', '/api/outfit-code/a/b'])
    expect((await request(path)).status).toBe(404)
  for (const method of ['PUT', 'OPTIONS', 'HEAD'])
    expect((await request('/api/like', { method })).status).toBe(405)
  expect((await request('/previous-page', { method: 'POST' })).status).toBe(405)
})
it('dispatches all API routes and preserves middleware and input checks', async () => {
  expect(await (await request('/api/like')).json()).toEqual({ count: 0 })
  expect(await (await request('/api/like/', { method: 'POST' })).json()).toEqual({ count: 1 })
  expect((await request('/api/resonance/pearpal', { method: 'POST' })).status).toBe(410)
  expect((await request('/api/resonance/pearpal')).status).toBe(405)
  expect((await request('/api/share-image')).status).toBe(400)
  expect((await request('/api/home-build/%2F')).status).toBe(400)
  expect((await request('/api/outfit-code/%2F')).status).toBe(404)
  expect((await request('/api/outfit-code/%ZZ')).status).toBe(400)
  expect((await request('/api/like')).headers.get('x-request-id')).toBeTruthy()
  for (const path of ['/api/resonance/cloud?action=session', '/api/archive/cloud?action=summary']) {
    const response = await request(path)
    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(500)
    expect(response.headers.get('content-type')).toContain('application/json')
  }
})
it('supports secure shared sessions through the production entrypoint', async () => {
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'https://example.test',
    'X-Resonance-Request': '1'
  }
  const response = await request('/api/resonance/cloud?action=register', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'worker_test', password: '123456' })
  })
  expect(response.status).toBe(200)
  const cookie = response.headers.get('set-cookie')!
  expect(cookie).toContain('HttpOnly; SameSite=Strict')
  expect(cookie).toContain('Secure')
  const account = ((await response.json()) as { user: { id: string } }).user.id
  const authenticated = { ...headers, Cookie: cookie.split(';')[0], 'X-Resonance-Account': account }
  expect(
    (await request('/api/resonance/cloud?action=session', { headers: authenticated })).status
  ).toBe(200)
  for (const path of ['/api/archive/cloud?action=summary'])
    expect((await request(path, { headers: authenticated })).status).toBe(200)
  const post = (path: string, body: unknown) =>
    request(path, { method: 'POST', headers: authenticated, body: JSON.stringify(body) })
  expect((await post('/api/archive/cloud?action=upload', archiveUpload(0))).status).toBe(200)
  expect((await post('/api/archive/cloud?action=upload', archiveUpload(0))).status).toBe(409)
  const snapshot = await (
    await request('/api/archive/cloud?action=snapshot', { headers: authenticated })
  ).json()
  expect(snapshot).toMatchObject({ resonance: { revision: 1 }, wardrobe: { revision: 1 } })
  expect(
    (
      await request('/api/archive/cloud?action=snapshot', {
        headers: { ...authenticated, 'X-Resonance-Account': 'someone-else' }
      })
    ).status
  ).toBe(409)
  expect(
    (
      await request('/api/resonance/cloud?action=logout', {
        method: 'POST',
        headers: { ...authenticated, Origin: 'https://evil.test' },
        body: '{}'
      })
    ).status
  ).toBe(403)
  expect(
    (
      await request('/api/resonance/cloud?action=logout', {
        method: 'POST',
        headers: authenticated,
        body: '{}'
      })
    ).status
  ).toBe(200)
})
it('stores diagnostics and prunes expired events with real D1 SQL and cascading breadcrumbs', async () => {
  const event = sampleEvent()
  event.occurredAt = Date.now()
  const response = await request('/api/errors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.test',
      'sec-fetch-site': 'same-origin',
      'X-Error-Report': '1',
      'CF-Connecting-IP': '127.0.0.1'
    },
    body: JSON.stringify(event)
  })
  expect(response.status).toBe(201)
  const db = await runtime.getD1Database('ERROR_DB')
  expect(await db.prepare('SELECT COUNT(*) n FROM error_events').first('n')).toBe(1)
  const now = Date.now()
  const query = async (sql: string) => [await db.prepare(sql).all()]
  expect((await pruneDiagnostics(query, now)).deletedEvents).toBe(0)
  await db
    .prepare('UPDATE error_events SET received_at=?')
    .bind(now - 30 * 86400000 - 1)
    .run()
  expect((await pruneDiagnostics(query, now)).deletedEvents).toBe(1)
  expect(await db.prepare('SELECT COUNT(*) n FROM error_breadcrumbs').first('n')).toBe(0)
  expect(
    await db.prepare('SELECT latest_event_id FROM error_groups').first('latest_event_id')
  ).toBeNull()
  expect((await pruneDiagnostics(query, now)).deletedEvents).toBe(0)
  expect(await (await request('/api/like')).json()).toEqual({ count: 1 })
})
it('retains request-level diagnostics across Worker middleware and waitUntil', async () => {
  const likes = await runtime.getD1Database('DB')
  await likes.exec('DROP TABLE like_counter')
  const response = await request('/api/like')
  expect(response.status).toBe(500)
  const requestId = response.headers.get('x-request-id')
  expect(requestId).toBeTruthy()
  const diagnostics = await runtime.getD1Database('ERROR_DB')
  await expect
    .poll(async () =>
      diagnostics
        .prepare('SELECT payload_json FROM error_events WHERE request_id=?')
        .bind(requestId)
        .first<string>('payload_json')
    )
    .toBeTruthy()
  const payload = JSON.parse(
    (await diagnostics
      .prepare('SELECT payload_json FROM error_events WHERE request_id=?')
      .bind(requestId)
      .first<string>('payload_json'))!
  )
  expect(payload.build.buildId).toBe('test-worker-version')
  expect(payload.device.runtime).toBe('Cloudflare Workers')
  expect(payload.context.requestId).toBe(requestId)
})

it('executes the actual scheduled export against isolated D1', async () => {
  // Miniflare's generated types currently misidentify the returned service proxy as Request.
  const fetcher = (await runtime.getWorker()) as unknown as {
    scheduled(options: { scheduledTime: number; cron: string }): Promise<{ outcome: string }>
  }
  const result = await fetcher.scheduled({
    scheduledTime: Date.now() + 181 * 86400000,
    cron: '25 19 * * *'
  })
  expect(result.outcome).toBe('ok')
  const db = await runtime.getD1Database('ERROR_DB')
  for (const table of [
    'error_events',
    'error_breadcrumbs',
    'error_groups',
    'error_release_stats',
    'error_rate_limits'
  ]) {
    expect(await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first('n')).toBe(0)
  }
  const resonance = await runtime.getD1Database('RESONANCE_DB')
  expect(await resonance.prepare('SELECT COUNT(*) n FROM cloud_users').first('n')).toBe(1)
})
