// @vitest-environment node
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { warmLookbookParser } from '../../src/utils/outfit/lookbookWasmClient'
afterEach(() => vi.unstubAllGlobals())
it('retries a failed initialization and shares the successful WASM instance', async () => {
  const bytes = readFileSync('src/assets/lookbook-parser.wasm')
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response(bytes))
  vi.stubGlobal('fetch', fetcher)
  await expect(warmLookbookParser()).rejects.toThrow('Failed to fetch')
  await Promise.all([warmLookbookParser(), warmLookbookParser()])
  await warmLookbookParser()
  expect(fetcher).toHaveBeenCalledTimes(2)
})
