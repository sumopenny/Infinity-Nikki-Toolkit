import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAnimatedHeadFrame } from '../../src/composables/useAnimatedHeadFrame'
import {
  headFrames,
  type AnimatedHeadFrame,
  headFramePlayerAssets
} from '../../src/utils/animatedHeadFrames'

const animations = Object.values(headFrames)
  .map((frame) => frame.animation)
  .filter((animation): animation is AnimatedHeadFrame => animation !== undefined)

const mocks = vi.hoisted(() => ({ instances: [] as any[] }))
vi.mock('@esotericsoftware/spine-player', () => ({
  SpinePlayer: class {
    canvas = document.createElement('canvas')
    loseContext = vi.fn()
    context = { gl: { getExtension: () => ({ loseContext: this.loseContext }) } }
    dispose = vi.fn()
    setAnimation = vi.fn()
    play = vi.fn()
    pause = vi.fn()
    constructor(
      public host: HTMLElement,
      public config: any
    ) {
      mocks.instances.push(this)
    }
  }
}))

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ bones: [{ name: 'root' }] }))
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  mocks.instances.length = 0
  vi.useRealTimers()
  document.body.replaceChildren()
})

it('maps every texture page to WebP while keeping skeleton and atlas URLs unchanged', () => {
  expect(Object.keys(headFrames)).toHaveLength(76)
  expect(Object.values(headFrames).every((frame) => frame.image.endsWith('.png'))).toBe(true)
  expect(headFrames['1070020004'].animation).toBeUndefined()
  const frames = animations
  expect(new Set(frames.map((f) => f.json)).size).toBe(50)
  const frame = frames.find((f) => f.textures.length === 3)!
  const assets = headFramePlayerAssets(frame)
  expect(assets.jsonUrl).not.toContain('?')
  expect(assets.atlasUrl).not.toContain('?')
  expect(Object.entries(assets.rawDataURIs)).toHaveLength(3)
  for (const [key, url] of Object.entries(assets.rawDataURIs)) expect(url).toBe(key + '?tr=f-webp')
})

it('composites rendered frames, supports pause, and releases the player on selection/close/unmount', async () => {
  const scope = effectScope()
  const selection = ref(animations[0])
  const active = ref(true)
  const repaint = vi.fn()
  const result = scope.run(() => useAnimatedHeadFrame(selection, active, ref(0), repaint))!
  try {
    await flushPromises()
    const first = mocks.instances[0]
    expect(first.config.rawDataURIs[first.config.jsonUrl]).toContain('"bones"')
    first.config.success(first)
    expect(first.setAnimation).toHaveBeenCalledWith(selection.value.defaultAnimation, true)
    first.config.draw(first)
    expect(result.canvas.value).toBe(first.canvas)
    expect(repaint).toHaveBeenCalled()
    result.togglePause()
    expect(first.pause).toHaveBeenCalledOnce()
    result.togglePause()
    expect(first.play).toHaveBeenCalledTimes(2)
    selection.value = animations[1]
    await flushPromises()
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(first.loseContext).toHaveBeenCalledOnce()
    first.config.draw(first)
    expect(result.canvas.value).toBeNull()
    const second = mocks.instances[1]
    active.value = false
    await nextTick()
    expect(second.dispose).toHaveBeenCalledOnce()
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull()
    active.value = true
    await flushPromises()
    scope.stop()
    expect(mocks.instances[2].dispose).toHaveBeenCalledOnce()
  } finally {
    scope.stop()
  }
})

it.each(['network', 'empty', 'http', 'invalid'])(
  'contains %s JSON failures and permits retry',
  async (failure) => {
    vi.mocked(fetch).mockImplementationOnce(async () => {
      if (failure === 'network') throw new TypeError('Failed to fetch')
      if (failure === 'empty') return new Response('')
      if (failure === 'http') return new Response('', { status: 503 })
      return Response.json({ error: 'unavailable' })
    })
    const scope = effectScope()
    const retry = ref(0)
    const result = scope.run(() =>
      useAnimatedHeadFrame(ref(animations[0]), ref(true), retry, vi.fn())
    )!
    try {
      await flushPromises()
      expect(result.failed.value).toBe(true)
      expect(mocks.instances).toHaveLength(0)
      retry.value++
      await flushPromises()
      expect(result.failed.value).toBe(false)
      expect(mocks.instances).toHaveLength(1)
    } finally {
      scope.stop()
    }
  }
)

it('aborts a pending skeleton request when closed and discards its late result', async () => {
  let resolve!: (response: Response) => void
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const scope = effectScope()
  const active = ref(true)
  scope.run(() => useAnimatedHeadFrame(ref(animations[0]), active, ref(0), vi.fn()))
  try {
    await flushPromises()
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!
    active.value = false
    await nextTick()
    expect(signal.aborted).toBe(true)
    resolve(Response.json({ bones: [] }))
    await flushPromises()
    expect(mocks.instances).toHaveLength(0)
  } finally {
    scope.stop()
  }
})

it('handles load failure and timeout, then retries without retaining failed players', async () => {
  vi.useFakeTimers()
  const scope = effectScope()
  const retry = ref(0)
  const result = scope.run(() =>
    useAnimatedHeadFrame(ref(animations[0]), ref(true), retry, vi.fn())
  )!
  try {
    await flushPromises()
    mocks.instances[0].config.error(mocks.instances[0], '404')
    await vi.runAllTicks()
    expect(result.failed.value).toBe(true)
    expect(result.canvas.value).toBeNull()
    expect(mocks.instances[0].dispose).toHaveBeenCalledOnce()
    retry.value++
    await flushPromises()
    expect(result.failed.value).toBe(false)
    await vi.advanceTimersByTimeAsync(30000)
    expect(result.failed.value).toBe(true)
    expect(mocks.instances[1].dispose).toHaveBeenCalledOnce()
  } finally {
    scope.stop()
  }
})
