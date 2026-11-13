import catalog from '../../src/data/photo/photoResourceCatalog.json'
import itemImages from '../../src/data/wardrobe/itemImageMap.json'
import itemIcons from '../../src/data/wardrobe/itemIconMap.json'
import outfitImages from '../../src/data/wardrobe/outfitImageMap.json'
import {
  IMAGEKIT_IMAGES,
  IMAGEKIT_DETAILS,
  encodeImagePath,
  optimizedImageKitUrl
} from '../../src/utils/imagekit'

/** Exact catalog allowlist; no arbitrary hosts, query strings, or redirects. */
const allowedResources = new Set<string>()
for (const [kind, entries] of Object.entries(catalog.resources)) {
  const template = catalog.templates[kind as keyof typeof catalog.templates]
  for (const entry of entries) {
    const filename = 'image' in entry ? entry.image : undefined
    if (typeof filename === 'string' && filename)
      allowedResources.add(
        optimizedImageKitUrl(
          template.baseUrl.replaceAll(template.replace, encodeImagePath(filename))
        )
      )
  }
}
for (const [map, base] of [
  [itemImages, IMAGEKIT_DETAILS],
  [itemIcons, IMAGEKIT_IMAGES + 'IconClothes/'],
  [outfitImages, IMAGEKIT_IMAGES + 'outfits/']
] as const) {
  for (const [id, filename] of Object.entries(map)) {
    if (/^\d+$/.test(id) && typeof filename === 'string')
      allowedResources.add(optimizedImageKitUrl(base + encodeImagePath(filename)))
  }
}
export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const resourceUrl = new URL(request.url).searchParams.get('resource')
  if (!resourceUrl || !allowedResources.has(resourceUrl))
    return new Response('Invalid image', { status: 400 })
  const unavailable = (message = 'Image unavailable') =>
    new Response(message, { status: 502, headers: { 'cache-control': 'no-store' } })
  try {
    const upstream = await fetch(resourceUrl, {
      // Workers supports manual/follow only; non-2xx responses below reject redirects.
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      // 只向图床标明本站来源，不转发来访页面路径、查询参数或凭据。
      headers: { Accept: 'image/webp', Referer: new URL(request.url).origin + '/' }
    })
    if (
      !upstream.ok ||
      !/^image\/(png|webp|jpeg)/.test(upstream.headers.get('content-type') || '')
    ) {
      console.warn('[share-image]', { stage: 'upstream-response', status: upstream.status })
      return unavailable()
    }
    const reader = upstream.body?.getReader()
    if (!reader) return unavailable()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 5 * 1024 * 1024) {
          await reader.cancel()
          return unavailable('Image too large')
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new Response(bytes, {
      headers: {
        'content-type': upstream.headers.get('content-type')!,
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff'
      }
    })
  } catch (error) {
    console.warn('[share-image]', {
      stage: 'fetch-read',
      category: error instanceof Error ? error.name : 'UnknownError'
    })
    return unavailable()
  }
}
