import { pagesBundle } from '../fixtures/pagesBundle'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'

/** 使用真实 workerd 的 Request 校验，防止 Node fetch mock 掩盖边缘运行时差异。 */
it('Cloudflare 运行时允许固定上游请求、缓存命中，并拒绝重定向', async () => {
  const script =
    `        globalThis.fetch = async (input, init) => {
          const upstream = new Request(input, init);
          if (upstream.redirect !== 'manual') throw new Error('Unexpected redirect mode');
          if (upstream.url.endsWith('/%2F.json')) return new Response(null, { status: 404 });
          if (upstream.url.endsWith('/488547348102388136.json'))
            return new Response(null, { status: 302, headers: { Location: 'https://other.invalid/' } });
          return new Response('{"clothes":[]}', { headers: { 'Content-Type': 'application/octet-stream' } });
        };
` + pagesBundle()
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: 'outfit-code-runtime-test',
          compatibilityDate: '2026-09-19',
          manifest: {
            mainModule: 'index.js',
            modules: { 'index.js': { type: 'esm', contents: script } }
          }
        }
      }
    ]
  })
  try {
    const url = 'http://localhost/api/outfit-code/488547348102388135'
    const response = await runtime.dispatchFetch(url)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-outfit-cache')).toBe('MISS')
    expect(await response.text()).toBe('{"clothes":[]}')
    // waitUntil 写入是后台任务，等待缓存可见而不使用固定睡眠。
    await expect
      .poll(async () => {
        const hit = await runtime.dispatchFetch(url)
        await hit.text()
        return hit.headers.get('x-outfit-cache')
      })
      .toBe('HIT')
    const encoded = await runtime.dispatchFetch(
      'http://localhost/api/outfit-code/%3488547348102388135'
    )
    expect(encoded.status).toBe(200)
    expect(encoded.headers.get('x-outfit-cache')).toBe('HIT')
    await encoded.text()
    const missing = await runtime.dispatchFetch('http://localhost/api/outfit-code/%2F')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'upstream_rejected' })
    const redirected = await runtime.dispatchFetch(
      'http://localhost/api/outfit-code/488547348102388136'
    )
    expect(redirected.status).toBe(502)
    expect(await redirected.json()).toEqual({ error: 'upstream_rejected' })
  } finally {
    await runtime.dispose()
  }
}, 15000)
