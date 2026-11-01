import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'

it('serves share images in real workerd and rejects upstream redirects', async () => {
  const bundled = await build({
    stdin: {
      contents: `
        import { onRequestGet } from './functions/api/share-image.ts';
        globalThis.fetch = async (input, init) => {
          // Construct a real workerd Request so unsupported fetch options cannot be hidden by mocks.
          const request = new Request(input, init);
          if (request.redirect !== 'manual') throw new Error('Invalid redirect mode');
          if (request.headers.has('Cookie') || request.headers.has('Authorization')) {
            throw new Error('Credentials forwarded');
          }
          if (request.url.endsWith('/2.png')) {
            return new Response(null, { status: 302, headers: { Location: 'https://example.com/private.png' } });
          }
          return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
        };
        export default { fetch(request) { return onRequestGet({ request }); } };
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
          name: 'share-image-runtime-test',
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
    const response = await runtime.dispatchFetch(
      'http://localhost/api/share-image?path=items/icons/1.png',
      { headers: { Cookie: 'private', Authorization: 'Bearer private' } }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80, 78, 71])
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')
    for (const resource of [
      'https://nikkigallery.vip/static/img/photography/T_Icon_Unicorn_03.png',
      'https://cdn.nikkialbums.com/light/1090030001.webp',
      'https://cdn.nikkialbums.com/filter/1090020001.webp'
    ]) {
      const result = await runtime.dispatchFetch(
        'http://localhost/api/share-image?resource=' + encodeURIComponent(resource)
      )
      expect(result.status).toBe(200)
      await result.arrayBuffer()
    }
    const redirect = await runtime.dispatchFetch(
      'http://localhost/api/share-image?path=items/icons/2.png'
    )
    expect(redirect.status).toBe(502)
    expect(redirect.headers.get('cache-control')).toBe('no-store')
  } finally {
    await runtime.dispose()
  }
}, 15000)
