import * as loader from '@assemblyscript/loader'

type Measure = <T>(stage: string, action: () => Promise<T>) => Promise<T>
export const WASM_DOWNLOAD_TIMEOUT_MS = 12_000

/** Share one lazy instance; a failed or stalled download must not poison later retries. */
export function createWasmLoader<T extends WebAssembly.Exports>(
  url: string,
  measure: Measure = (_stage, action) => action()
): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    if (!pending) {
      pending = measure('wasm_download', async () => {
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          return await Promise.race([
            (async () => {
              const response = await fetch(url, { signal: controller.signal })
              if (!response.ok) throw new Error(`WASM HTTP ${response.status}`)
              return response.arrayBuffer()
            })(),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => {
                const error = new Error('WASM download timed out')
                reject(error)
                controller.abort(error)
              }, WASM_DOWNLOAD_TIMEOUT_MS)
            })
          ])
        } finally {
          clearTimeout(timer)
        }
      })
        .then((bytes) => measure('wasm_initialize', () => loader.instantiate(bytes, {})))
        .then((module) => module.exports as unknown as T)
        .catch((error: unknown) => {
          pending = null
          throw error
        })
    }
    return pending
  }
}
