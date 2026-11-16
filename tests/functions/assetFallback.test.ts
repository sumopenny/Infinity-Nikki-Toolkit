import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { expect, it, vi } from 'vitest'

it('serves missing assets as 404 without Functions and preserves SPA routes and real assets', async () => {
  const routes = JSON.parse(await readFile('public/_routes.json', 'utf8'))
  expect(routes.include).toEqual(['/api/*'])
  expect(routes.exclude).toContain('/assets/*')
  const root = resolve(tmpdir())
  const directory = await mkdtemp(join(root, 'nikki-assets-'))
  const controller = new AbortController()
  try {
    await mkdir(join(directory, 'assets'))
    await copyFile('public/assets/404.html', join(directory, 'assets/404.html'))
    await copyFile('public/_headers', join(directory, '_headers'))
    await writeFile(join(directory, 'index.html'), '<html>app-shell</html>')
    await writeFile(join(directory, 'assets/catalog.json'), '{"ok":true}')
    const { unstable_generateASSETSBinding } = await import('wrangler')
    const log = { log: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const serve = await unstable_generateASSETSBinding({
      directory,
      signal: controller.signal,
      log: log as unknown as Parameters<typeof unstable_generateASSETSBinding>[0]['log']
    })
    // The Pages handler accepts the standard Request fields; Wrangler types them as Miniflare's subclass.
    const request = (path: string) =>
      new Request('https://example.test' + path) as Parameters<typeof serve>[0]
    const missing = await serve(request('/assets/missing.json'))
    expect(missing.status).toBe(404)
    expect(missing.headers.get('cache-control')).toBe('no-store')
    expect(await missing.text()).not.toContain('app-shell')
    const asset = await serve(request('/assets/catalog.json'))
    expect(asset.status).toBe(200)
    expect(asset.headers.get('access-control-allow-origin')).toBe('*')
    expect(asset.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await asset.json()).toEqual({ ok: true })
    const page = await serve(request('/previous-page'))
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('app-shell')
  } finally {
    controller.abort()
    if (!resolve(directory).startsWith(root + sep)) throw new Error('Unexpected test directory')
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)
