import { afterEach, expect, it, vi } from 'vitest'
import { jsonResource } from '../../src/utils/resourceRecovery'
import { diagnosticMetadata } from '../../src/utils/errorReporting/errorReporter'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('rejects HTML and retries with a fresh request', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('<html/>', { headers: { 'content-type': 'text/html' } }))
    .mockResolvedValueOnce(Response.json({ ok: true }))
  vi.stubGlobal('fetch', fetcher)
  const load = jsonResource('/assets/catalog.json')
  const error = await load().catch((e) => e)
  expect(diagnosticMetadata(error)).toMatchObject({
    type: 'resource',
    context: { resourcePath: '/assets/catalog.json' }
  })
  expect(await load()).toEqual({ ok: true })
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('aborts a stalled request and makes the next attempt independently', async () => {
  vi.useFakeTimers()
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) =>
          init.signal.addEventListener('abort', () => reject(init.signal.reason))
        )
    )
    .mockResolvedValueOnce(Response.json([1]))
  vi.stubGlobal('fetch', fetcher)
  const load = jsonResource('/assets/catalog.json')
  const failed = load().catch((e) => e)
  await vi.advanceTimersByTimeAsync(12000)
  expect(diagnosticMetadata(await failed).context?.timedOut).toBe(true)
  expect(await load()).toEqual([1])
})
