import { afterEach, expect, it, vi } from 'vitest'
import { createWasmLoader, WASM_DOWNLOAD_TIMEOUT_MS } from '../../src/utils/wasmLoader'

const emptyModule = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it.each(['request', 'body'])(
  'times out a stalled %s and permits a fresh shared attempt',
  async (stage) => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        stage === 'request'
          ? new Promise(() => {})
          : Promise.resolve({ ok: true, arrayBuffer: () => new Promise(() => {}) })
      )
      .mockResolvedValue({ ok: true, arrayBuffer: async () => emptyModule.buffer })
    vi.stubGlobal('fetch', fetchMock)
    const load = createWasmLoader('/test.wasm')
    const pending = load()
    expect(load()).toBe(pending)
    const rejection = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(WASM_DOWNLOAD_TIMEOUT_MS)
    await rejection
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    const retry = load()
    expect(load()).toBe(retry)
    await expect(retry).resolves.toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(load()).toBe(retry)
    expect(vi.getTimerCount()).toBe(0)
  }
)

it('retries HTTP and initialization failures and preserves measurement stages', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })
      .mockResolvedValue({ ok: true, arrayBuffer: async () => emptyModule.buffer })
  )
  const stages: string[] = []
  const load = createWasmLoader('/test.wasm', (stage, action) => {
    stages.push(stage)
    return action()
  })
  await expect(load()).rejects.toThrow('503')
  await expect(load()).rejects.toThrow()
  await expect(load()).resolves.toBeDefined()
  expect(stages).toEqual([
    'wasm_download',
    'wasm_download',
    'wasm_initialize',
    'wasm_download',
    'wasm_initialize'
  ])
})
