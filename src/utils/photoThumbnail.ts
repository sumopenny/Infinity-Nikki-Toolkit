import type { PhotoDisplayItem } from './photoGrouping'
import { readPhotoBlob, formatFileSize } from './file-system/photoUrl'

const cancelled = () => new DOMException('Thumbnail load cancelled', 'AbortError')

export function thumbnailDimensions(width: number, height: number, limit: number) {
  const scale = Math.min(1, limit / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

/** Creates a separate, temporary thumbnail; never assigns an original-image URL to the photo. */
export async function generatePhotoThumbnail(
  photo: PhotoDisplayItem,
  limit: number
): Promise<Blob> {
  const source = await readPhotoBlob(photo)
  photo.fileSize = source.size
  photo.fileSizeText = formatFileSize(source.size)
  if (source instanceof File) photo.lastModified = source.lastModified
  let bitmap: ImageBitmap | undefined
  let image: HTMLImageElement | undefined
  let sourceUrl: string | undefined
  const canvas = document.createElement('canvas')
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(source)
      } catch {
        /* Use the HTML image decoder below. */
      }
    }
    if (!bitmap) {
      sourceUrl = URL.createObjectURL(source)
      image = new Image()
      await new Promise<void>((resolve, reject) => {
        image!.onload = () => resolve()
        image!.onerror = () => reject(new Error('Photo image decode failed'))
        image!.src = sourceUrl!
      })
    }
    const dimensions = thumbnailDimensions(
      bitmap?.width ?? image!.naturalWidth,
      bitmap?.height ?? image!.naturalHeight,
      limit
    )
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Thumbnail canvas is unavailable')
    context.drawImage(bitmap ?? image!, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Thumbnail encoding failed'))),
        'image/webp',
        0.8
      )
    })
  } finally {
    bitmap?.close()
    if (image) {
      image.onload = null
      image.onerror = null
      image.src = ''
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    canvas.width = canvas.height = 0
  }
}

interface Entry {
  photo: PhotoDisplayItem
  size: number
  fingerprint: string
  users: number
  used: number
  bytes: number
  retained?: boolean
  url?: string
  promise: Promise<string>
  resolve: (url: string) => void
  reject: (error: unknown) => void
}

/** Each caller holds its URL until its signal aborts, including after the promise resolves. */
export function createPhotoThumbnailCache(
  options: {
    maxCount?: number
    maxBytes?: number
    concurrency?: number
    generate?: typeof generatePhotoThumbnail
  } = {}
) {
  const entries = new Set<Entry>()
  const queue: Entry[] = []
  let running = 0
  let clock = 0
  let disposed = false
  const generate = options.generate ?? generatePhotoThumbnail
  const remove = (entry: Entry) => {
    entries.delete(entry)
    if (entry.url) {
      URL.revokeObjectURL(entry.url)
      entry.url = undefined
    }
  }
  const trim = () => {
    const ready = [...entries].filter((entry) => entry.url)
    let count = ready.length
    let bytes = ready.reduce((total, entry) => total + entry.bytes, 0)
    for (const entry of ready.filter((entry) => !entry.users).sort((a, b) => a.used - b.used)) {
      if (count <= (options.maxCount ?? 150) && bytes <= (options.maxBytes ?? 48 * 1024 * 1024))
        break
      bytes -= entry.bytes
      count--
      remove(entry)
    }
  }
  const drain = () => {
    while (!disposed && running < (options.concurrency ?? 2) && queue.length) {
      const entry = queue.shift()!
      if (!entry.users) {
        remove(entry)
        entry.reject(cancelled())
        continue
      }
      running++
      void generate(entry.photo, entry.size)
        .then(
          (blob) => {
            if (disposed || !entry.users || !entries.has(entry)) {
              remove(entry)
              entry.reject(cancelled())
              return
            }
            entry.bytes = blob.size
            entry.fingerprint = `${entry.photo.fileSize ?? ''}:${entry.photo.lastModified ?? ''}`
            entry.url = URL.createObjectURL(blob)
            entry.resolve(entry.url)
            trim()
          },
          (error) => {
            remove(entry)
            entry.reject(error)
          }
        )
        .finally(() => {
          running--
          drain()
        })
    }
  }
  const load = (photo: PhotoDisplayItem, signal: AbortSignal, size = 768): Promise<string> => {
    if (disposed || signal.aborted) return Promise.reject(cancelled())
    const fingerprint = `${photo.fileSize ?? ''}:${photo.lastModified ?? ''}`
    let entry = [...entries].find(
      (candidate) =>
        candidate.photo === photo &&
        candidate.size === size &&
        candidate.fingerprint === fingerprint
    )
    if (!entry) {
      let resolve!: Entry['resolve'], reject!: Entry['reject']
      const promise = new Promise<string>((yes, no) => {
        resolve = yes
        reject = no
      })
      entry = { photo, size, fingerprint, users: 0, used: 0, bytes: 0, promise, resolve, reject }
      entries.add(entry)
      queue.push(entry)
    }
    const current = entry
    current.users++
    current.used = ++clock
    const result = new Promise<string>((resolve, reject) => {
      const release = () => {
        current.users--
        reject(cancelled())
        if (!current.users && current.url && current.retained === false) remove(current)
        if (!current.users && !current.url) {
          const index = queue.indexOf(current)
          if (index >= 0) {
            queue.splice(index, 1)
            remove(current)
            current.reject(cancelled())
          }
        }
        trim()
      }
      signal.addEventListener('abort', release, { once: true })
      current.promise.then(
        (url) => {
          if (!signal.aborted) resolve(url)
        },
        (error) => {
          signal.removeEventListener('abort', release)
          if (!signal.aborted) current.users--
          reject(error)
        }
      )
    })
    drain()
    return result
  }
  return {
    load,
    retainPhotos(photos: Set<PhotoDisplayItem>) {
      for (const entry of entries) {
        entry.retained = photos.has(entry.photo)
        if (!entry.retained && !entry.users && entry.url) remove(entry)
      }
    },
    dispose() {
      disposed = true
      for (const entry of entries) {
        entry.reject(cancelled())
        remove(entry)
      }
      queue.length = 0
    },
    stats: () => ({
      count: [...entries].filter((entry) => entry.url).length,
      bytes: [...entries].reduce((sum, entry) => sum + entry.bytes, 0),
      running,
      queued: queue.length
    })
  }
}
