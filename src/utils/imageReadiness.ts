/** One decode lifecycle shared by component and directive adapters. */
export function createImageReadiness() {
  let revision = 0
  let decoding: HTMLImageElement | null = null
  return {
    reset() {
      revision++
      decoding = null
    },
    async load(image: HTMLImageElement): Promise<'ready' | 'failed' | 'stale'> {
      if (decoding === image) return 'stale'
      const run = revision
      decoding = image
      let usable = true
      try {
        if (typeof image.decode === 'function') await image.decode()
      } catch {
        usable = image.complete && image.naturalWidth > 0
      }
      if (run !== revision) return 'stale'
      decoding = null
      return usable ? 'ready' : 'failed'
    }
  }
}
