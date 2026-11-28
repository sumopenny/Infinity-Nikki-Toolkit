import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parseOutfitCode, clearOutfitCodeParseCache } from '../../src/utils/outfit/outfitCodeParser'
import { diagnosticMetadata } from '../../src/utils/errorReporting/errorReporter'
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  warm: vi.fn(),
  decode: vi.fn()
}))
vi.mock('../../src/utils/file-system/directoryStorage', () => ({
  getSavedOutfitParseResult: mocks.read,
  saveOutfitParseResult: mocks.save,
  clearSavedOutfitParseResults: vi.fn()
}))
vi.mock('../../src/utils/outfit/lookbookWasmClient', () => ({
  decodeLookbookShareCodePathId: vi.fn(async () => '123'),
  warmLookbookParser: mocks.warm,
  decodeLookbookPayload: mocks.decode
}))
const code = '1tARmUbRRuR#'
const value = { code, wearingClothes: [], dyeItems: [] }
beforeEach(async () => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
  await clearOutfitCodeParseCache()
  mocks.read.mockReset().mockResolvedValue(null)
  mocks.save.mockReset().mockResolvedValue(undefined)
  mocks.warm.mockReset().mockResolvedValue(undefined)
  mocks.decode.mockReset().mockResolvedValue({ ok: true, value })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('shares one retry and caches success after a transient connection failure', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('private URL'))
    .mockResolvedValueOnce(new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  const a = parseOutfitCode(code),
    b = parseOutfitCode(code)
  await vi.advanceTimersByTimeAsync(299)
  expect(fetcher).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(await a).toEqual(value)
  expect(await b).toEqual(value)
  await parseOutfitCode(code)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(mocks.save).toHaveBeenCalledTimes(1)
})

it('falls back after one second and ignores a late cache result', async () => {
  let finish!: (value: unknown) => void
  mocks.read.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const fetcher = vi.fn(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  const parsing = parseOutfitCode(code)
  await vi.advanceTimersByTimeAsync(999)
  expect(fetcher).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(await parsing).toEqual(value)
  finish({ ...value, wearingClothes: [{ itemId: 1020100001, clothType: 10, outfitId: null }] })
  await vi.advanceTimersByTimeAsync(0)
  expect(await parseOutfitCode(code)).toEqual(value)
})

it('does not count slow WASM loading toward the network timeout', async () => {
  mocks.warm.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 11000)))
  const fetcher = vi.fn(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  const parsing = parseOutfitCode(code)
  await vi.advanceTimersByTimeAsync(11000)
  expect(await parsing).toEqual(value)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('aborts a hanging body and stops after two independent 15-second attempts', async () => {
  const signals: AbortSignal[] = []
  const fetcher = vi.fn(async (_url, init) => {
    signals.push(init.signal)
    return new Response(new ReadableStream({ start() {} }))
  })
  vi.stubGlobal('fetch', fetcher)
  const parsing = parseOutfitCode(code).catch((error) => error)
  await vi.advanceTimersByTimeAsync(15000)
  expect(signals[0].aborted).toBe(true)
  await vi.advanceTimersByTimeAsync(300)
  expect(fetcher).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(15000)
  const error = await parsing
  expect(error).toMatchObject({ reason: 'timeout' })
  expect(diagnosticMetadata(error)).toMatchObject({
    stage: 'network',
    context: { outfitParseFinal: true, attempts: 2, durationMs: 30300 }
  })
  expect(mocks.save).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it.each([502, 503, 504])('retries temporary HTTP %s once', async (status) => {
  const fetcher = vi
    .fn()
    .mockImplementationOnce(async () => Response.json({ error: 'upstream_timeout' }, { status }))
    .mockResolvedValueOnce(new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  const parsing = parseOutfitCode(code)
  await vi.advanceTimersByTimeAsync(300)
  expect(await parsing).toEqual(value)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it.each([
  [400, '', 'invalid', 'service'],
  [404, '', 'invalid', 'service'],
  [502, 'upstream_invalid_payload', 'unavailable', 'data'],
  [502, 'upstream_body_too_large', 'unavailable', 'data']
])('does not retry permanent HTTP %s %s', async (status, upstreamCode, kind, reason) => {
  const fetcher = vi.fn(async () =>
    Response.json({ error: upstreamCode }, { status: Number(status) })
  )
  vi.stubGlobal('fetch', fetcher)
  const error = await parseOutfitCode(code).catch((error) => error)
  expect(error).toMatchObject({ kind, reason })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('does not retry an abort', async () => {
  const fetcher = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
  vi.stubGlobal('fetch', fetcher)
  await expect(parseOutfitCode(code)).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('cancels the network when WASM loading fails and permits a later manual retry', async () => {
  mocks.warm.mockRejectedValueOnce(new Error('download failed'))
  let signal!: AbortSignal
  const fetcher = vi.fn((_url, init) => {
    signal = init.signal
    return new Promise<Response>(() => {})
  })
  vi.stubGlobal('fetch', fetcher)
  await expect(parseOutfitCode(code)).rejects.toMatchObject({ reason: 'wasm' })
  expect(signal.aborted).toBe(true)
  await vi.advanceTimersByTimeAsync(30300)
  expect(fetcher).toHaveBeenCalledTimes(1)
  fetcher.mockImplementation(async () => new Response('{}'))
  expect(await parseOutfitCode(code)).toEqual(value)
})

it('classifies data failure without retry or caching', async () => {
  mocks.decode.mockResolvedValue({ ok: false, errorCode: 'json_invalid' })
  const fetcher = vi.fn(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  const error = await parseOutfitCode(code).catch((error) => error)
  expect(error).toMatchObject({ reason: 'data' })
  expect(diagnosticMetadata(error)).toMatchObject({ stage: 'decode', context: { attempts: 1 } })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(mocks.save).not.toHaveBeenCalled()
})
