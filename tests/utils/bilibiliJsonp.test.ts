// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readBilibiliEvolution } from '../../src/utils/bilibiliEvolution'
const payload = {
  code: 0,
  data: {
    pages: [{ cid: 123456, page: 1, part: '【3.0限定共鸣】测试套装-满进动画', duration: 40 }]
  }
}
const script = () =>
  document.head.querySelector<HTMLScriptElement>('script[src*="api.bilibili.com"]')!
const callback = (s: HTMLScriptElement) => new URL(s.src).searchParams.get('callback')!
const callbacks = window as unknown as Record<string, (data: unknown) => void>
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it('reads the fixed Bilibili JSONP source, validates data and cleans up', async () => {
  const result = readBilibiliEvolution()
  const s = script()
  const key = callback(s)
  expect(new URL(s.src).hostname).toBe('api.bilibili.com')
  expect(s.referrerPolicy).toBe('no-referrer')
  callbacks[key](payload)
  expect(await result).toEqual([expect.objectContaining({ cid: '123456', name: '测试套装' })])
  expect(script()).toBeNull()
  expect(callbacks[key]).toBeUndefined()
})
it.each(['network', 'missing', 'invalid'])(
  'rejects %s failures without retaining scripts',
  async (failure) => {
    const result = readBilibiliEvolution()
    const rejected = expect(result).rejects.toThrow()
    const s = script()
    if (failure === 'network') s.dispatchEvent(new Event('error'))
    if (failure === 'missing') s.dispatchEvent(new Event('load'))
    if (failure === 'invalid') callbacks[callback(s)]({ code: -412 })
    await rejected
    expect(script()).toBeNull()
  }
)
it('times out, ignores late callbacks and allows a new request to succeed', async () => {
  const first = readBilibiliEvolution()
  const key = callback(script())
  const rejected = expect(first).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(10000)
  await rejected
  const second = readBilibiliEvolution()
  const next = callback(script())
  expect(next).not.toBe(key)
  callbacks[key](payload)
  callbacks[next](payload)
  expect(await second).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(60000)
  expect(callbacks[key]).toBeUndefined()
})
it('cleans up when inserting the script throws', async () => {
  vi.spyOn(document.head, 'append').mockImplementation(() => {
    throw new Error('blocked')
  })
  await expect(readBilibiliEvolution()).rejects.toThrow('could not be loaded')
  expect(vi.getTimerCount()).toBe(0)
})
