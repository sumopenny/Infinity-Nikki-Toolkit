import { afterEach, expect, it, vi } from 'vitest'
import {
  createPhotoThumbnailCache,
  thumbnailDimensions,
  generatePhotoThumbnail
} from '../../src/utils/photoThumbnail'
import type { PhotoDisplayItem } from '../../src/utils/photoGrouping'

const photo = (id: string) => ({ id, name: `${id}.jpg`, url: null }) as PhotoDisplayItem
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('preserves portrait and landscape ratios and never enlarges a small image', () => {
  expect(thumbnailDimensions(3840, 2160, 512)).toEqual({ width: 512, height: 288 })
  expect(thumbnailDimensions(2160, 3840, 512)).toEqual({ width: 288, height: 512 })
  expect(thumbnailDimensions(100, 50, 512)).toEqual({ width: 100, height: 50 })
})

it('encodes a scaled thumbnail and frees decoder and canvas resources even on encoding failure', async () => {
  const close = vi.fn(),
    drawImage = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 3840, height: 2160, close }))
  )
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob: (done: (blob: Blob | null) => void) => done(null)
  }
  vi.stubGlobal('document', { createElement: () => canvas })
  const item = { ...photo('a'), loadImageBlob: async () => new Blob(['original']) }
  await expect(generatePhotoThumbnail(item, 512)).rejects.toThrow('Thumbnail encoding failed')
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 288)
  expect(close).toHaveBeenCalledOnce()
  expect(canvas.width).toBe(0)
  expect(canvas.height).toBe(0)
  expect(item.url).toBeNull()
})

it('falls back to an image element and releases its original URL after encoding', async () => {
  vi.stubGlobal('createImageBitmap', undefined)
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  class FakeImage {
    naturalWidth = 1200
    naturalHeight = 2400
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(value: string) {
      if (value) queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', FakeImage)
  const blob = new Blob(['thumbnail'])
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (done: (blob: Blob) => void) => done(blob)
  }
  vi.stubGlobal('document', { createElement: () => canvas })
  expect(
    await generatePhotoThumbnail(
      { ...photo('a'), loadImageBlob: async () => new Blob(['original']) },
      512
    )
  ).toBe(blob)
  expect(revoke).toHaveBeenCalledOnce()
  expect(canvas.width).toBe(0)
})

it('shares work, protects displayed URLs, then evicts the oldest unused thumbnail', async () => {
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const generate = vi.fn(async () => new Blob(['thumbnail']))
  const cache = createPhotoThumbnailCache({ maxCount: 1, generate })
  const a = photo('a'),
    b = photo('b')
  const first = new AbortController(),
    duplicate = new AbortController(),
    second = new AbortController()
  const [url, sameUrl] = await Promise.all([
    cache.load(a, first.signal),
    cache.load(a, duplicate.signal)
  ])
  expect(url).toBe(sameUrl)
  expect(generate).toHaveBeenCalledTimes(1)
  await cache.load(b, second.signal)
  expect(cache.stats().count).toBe(2)
  first.abort()
  expect(revoke).not.toHaveBeenCalled()
  duplicate.abort()
  expect(revoke).toHaveBeenCalledWith(url)
  expect(cache.stats().count).toBe(1)
  expect(a.url).toBeNull()
  second.abort()
  cache.dispose()
  expect(cache.stats().count).toBe(0)
})

it('limits active decodes, cancels queued work and discards a completed obsolete decode', async () => {
  const finishes: Array<(blob: Blob) => void> = []
  const generate = vi.fn(() => new Promise<Blob>((resolve) => finishes.push(resolve)))
  const cache = createPhotoThumbnailCache({ concurrency: 1, generate })
  const first = new AbortController(),
    second = new AbortController()
  const p1 = cache.load(photo('a'), first.signal).catch((error) => error.name)
  const p2 = cache.load(photo('b'), second.signal).catch((error) => error.name)
  expect(generate).toHaveBeenCalledTimes(1)
  second.abort()
  expect(await p2).toBe('AbortError')
  first.abort()
  expect(await p1).toBe('AbortError')
  finishes[0](new Blob(['unused']))
  await vi.waitFor(() => expect(cache.stats().running).toBe(0))
  expect(generate).toHaveBeenCalledTimes(1)
  expect(cache.stats()).toMatchObject({ count: 0, bytes: 0, queued: 0 })
  cache.dispose()
})

it('cleans failed work so retry succeeds, invalidates replaced objects and enforces byte budget', async () => {
  const generate = vi
    .fn()
    .mockRejectedValueOnce(new Error('decode failed'))
    .mockResolvedValue(new Blob(['12345']))
  const cache = createPhotoThumbnailCache({ maxBytes: 4, generate })
  const original = photo('same')
  const a = new AbortController()
  await expect(cache.load(original, a.signal)).rejects.toThrow('decode failed')
  await cache.load(original, a.signal)
  a.abort()
  expect(cache.stats().count).toBe(0)
  const b = new AbortController()
  await cache.load(photo('same'), b.signal)
  expect(generate).toHaveBeenCalledTimes(3)
  b.abort()
  cache.dispose()
})

it('reuses an idle cached thumbnail and removes deleted photos after their last user leaves', async () => {
  const generate = vi.fn(async () => new Blob(['ok']))
  const cache = createPhotoThumbnailCache({ generate })
  const item = photo('a'),
    a = new AbortController(),
    b = new AbortController()
  await cache.load(item, a.signal)
  a.abort()
  await cache.load(item, b.signal)
  expect(generate).toHaveBeenCalledTimes(1)
  cache.retainPhotos(new Set())
  expect(cache.stats().count).toBe(1)
  b.abort()
  expect(cache.stats().count).toBe(0)
  cache.dispose()
})

it('keeps multiple size tiers of retained photos but clears all tiers of removed photos', async () => {
  const cache = createPhotoThumbnailCache({ generate: async () => new Blob(['ok']) })
  const a = photo('a'),
    b = photo('b'),
    controller = new AbortController()
  await Promise.all([
    cache.load(a, controller.signal, 512),
    cache.load(a, controller.signal, 768),
    cache.load(b, controller.signal, 512)
  ])
  controller.abort()
  cache.retainPhotos(new Set([a]))
  expect(cache.stats().count).toBe(2)
  cache.retainPhotos(new Set())
  expect(cache.stats().count).toBe(0)
  cache.dispose()
})
