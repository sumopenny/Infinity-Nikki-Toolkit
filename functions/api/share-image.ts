import catalog from '../../src/data/nuan5ResourceCatalog.json'
/** Fixed public catalog source only; never accept arbitrary URLs or forward credentials. */
const allowedResources = new Set(
  Object.entries(catalog.resources).flatMap(([kind, entries]) => {
    const template = catalog.templates[kind as keyof typeof catalog.templates]
    return entries.map((entry) =>
      template.baseUrl.replaceAll(
        template.replace,
        encodeURIComponent(
          kind === 'pose' ? ((('image' in entry && entry.image) || '') as string) : entry.key
        )
      )
    )
  })
)
export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const path = new URL(request.url).searchParams.get('path') ?? ''
  const resourceUrl = new URL(request.url).searchParams.get('resource')
  if (
    resourceUrl
      ? !allowedResources.has(resourceUrl)
      : !/^items\/(?:icons|makeups)\/\d{1,12}\.png$/.test(path)
  )
    return new Response('Invalid image', { status: 400 })
  const unavailable = (message = 'Image unavailable') =>
    new Response(message, { status: 502, headers: { 'cache-control': 'no-store' } })
  try {
    const upstream = await fetch(resourceUrl || `https://cdn.gongeo.us/images/${path}`, {
      // Workers supports manual/follow only; non-2xx responses below reject redirects.
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'image/png' }
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
