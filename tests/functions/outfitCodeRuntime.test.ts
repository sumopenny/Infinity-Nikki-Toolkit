import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'

/** 使用真实 workerd 的 Request 校验，防止 Node fetch mock 掩盖边缘运行时差异。 */
it('Cloudflare 运行时允许固定上游请求、缓存命中，并拒绝重定向', async () => {
  const bundled = await build({
    stdin: {
      contents: `
        import worker from './worker/index.ts';
        globalThis.fetch = async (input, init) => {
          const upstream = new Request(input, init);
          if (upstream.redirect !== 'manual') throw new Error('Unexpected redirect mode');
          if (upstream.url.endsWith('/488547348102388136.json'))
            return new Response(null, { status: 302, headers: { Location: 'https://other.invalid/' } });
          return new Response('{"clothes":[]}', { headers: { 'Content-Type': 'application/octet-stream' } });
        };
        export default {
          fetch(request, env, ctx) {
            return worker.fetch(request, env, ctx);
          }
        };
      `,
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false
  })
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: 'outfit-code-runtime-test',
          compatibilityDate: '2026-09-19',
          manifest: {
            mainModule: 'index.js',
            modules: { 'index.js': { type: 'esm', contents: bundled.outputFiles[0].text } }
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
    const redirected = await runtime.dispatchFetch(
      'http://localhost/api/outfit-code/488547348102388136'
    )
    expect(redirected.status).toBe(502)
    expect(await redirected.json()).toEqual({ error: 'upstream_rejected' })
  } finally {
    await runtime.dispose()
  }
}, 15000)
