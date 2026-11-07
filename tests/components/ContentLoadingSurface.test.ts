import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ContentLoadingSurface from '../../src/components/ContentLoadingSurface.vue'

let wrappers: ReturnType<typeof mount>[] = []
const cancel = vi.fn()
const animate = vi.fn(
  (_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel }) as unknown as Animation
)
beforeEach(() => {
  vi.useFakeTimers()
  animate.mockClear()
  cancel.mockClear()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const element = this as HTMLElement
    const hidden = element.hasAttribute('data-hidden')
    const top = Number(element.getAttribute('data-top') || 10)
    return {
      x: 0,
      y: top,
      left: 0,
      top,
      width: hidden ? 0 : 100,
      height: hidden ? 0 : 100,
      right: hidden ? 0 : 100,
      bottom: hidden ? 0 : top + 100,
      toJSON() {}
    }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16)
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
})
afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount())
  wrappers = []
  vi.restoreAllMocks()
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function create(slots: Record<string, string> = {}) {
  const wrapper = mount(ContentLoadingSurface, {
    props: { loading: true, label: 'Loading records' },
    slots: {
      skeleton:
        '<div><div data-skeleton-block data-top="10"></div><div data-skeleton-block data-top="150"></div></div>',
      default:
        '<div><h3 data-load-block data-top="10">Title</h3><div data-load-block data-top="150">Image</div><div data-load-block data-hidden>Hidden desktop content</div></div>',
      ...slots
    }
  })
  wrappers.push(wrapper)
  return wrapper
}
it('shows matching placeholders and one shared sweeping layer before content is ready', async () => {
  const wrapper = create()
  expect(wrapper.attributes('aria-busy')).toBe('true')
  expect(wrapper.find('.content-loaded-layer').exists()).toBe(false)
  expect(wrapper.get('[role="status"]').text()).toBe('Loading records')
  await vi.advanceTimersByTimeAsync(16)
  expect(wrapper.findAll('.content-skeleton-band')).toHaveLength(1)
  expect(wrapper.findAll('mask rect')).toHaveLength(2)
})
it('overlaps skeleton and content, staggers visible blocks by 60ms and cleans up', async () => {
  const wrapper = create()
  await wrapper.setProps({ loading: false })
  await nextTick()
  expect(wrapper.find('.content-loaded-layer').exists()).toBe(true)
  expect(wrapper.find('.content-skeleton-layer.is-overlay').exists()).toBe(true)
  expect(animate).toHaveBeenCalledTimes(4)
  expect(
    animate.mock.calls.map((call) => (call as unknown as [unknown, { delay: number }])[1].delay)
  ).toEqual([0, 60, 0, 60])
  expect(animate.mock.calls[0]?.[0]).toEqual([
    { opacity: 0, transform: 'translateY(8px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ])
  await vi.advanceTimersByTimeAsync(340)
  expect(wrapper.attributes('data-loading-surface')).toBe('ready')
  expect(wrapper.find('.content-skeleton-layer').exists()).toBe(false)
  expect(cancel).toHaveBeenCalledTimes(4)
})
it('cancels an unfinished reveal when a new loading cycle starts or the page unmounts', async () => {
  const wrapper = create()
  await wrapper.setProps({ loading: false })
  await nextTick()
  await wrapper.setProps({ loading: true })
  expect(cancel).toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  expect(wrapper.attributes('data-loading-surface')).toBe('loading')
  expect(wrapper.find('.content-skeleton-layer').exists()).toBe(true)
  wrapper.unmount()
  wrappers = []
  expect(vi.getTimerCount()).toBe(0)
})
it('immediately shows content under reduced motion without leaving a skeleton overlay', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const wrapper = create()
  await wrapper.setProps({ loading: false })
  await nextTick()
  await nextTick()
  expect(animate).not.toHaveBeenCalled()
  expect(wrapper.attributes('data-loading-surface')).toBe('ready')
  expect(wrapper.find('.content-skeleton-layer').exists()).toBe(false)
})

it('reveals each visual row together and finishes according to rows rather than block count', async () => {
  const wrapper = create({
    skeleton:
      '<div><div data-skeleton-block data-top="10"></div><div data-skeleton-block data-top="11.6"></div><div data-skeleton-block data-top="150"></div><div data-skeleton-block data-top="150"></div></div>',
    default:
      '<div><div data-load-block data-top="150">Lower left</div><div data-load-block data-top="10">Upper left</div><div data-load-block data-top="10.8">Upper middle</div><div data-load-block data-top="11.6">Upper right</div><div data-load-block data-top="150">Lower right</div><div data-load-block data-hidden>Hidden</div><div data-load-block data-top="2000">Below viewport</div></div>'
  })
  await wrapper.setProps({ loading: false })
  await nextTick()
  expect(animate.mock.calls.map(([, options]) => options.delay)).toEqual([
    0, 0, 0, 60, 60, 0, 0, 60, 60
  ])
  expect(animate.mock.calls.every(([, options]) => options.duration === 260)).toBe(true)
  await vi.advanceTimersByTimeAsync(339)
  expect(wrapper.attributes('data-loading-surface')).toBe('revealing')
  await vi.advanceTimersByTimeAsync(1)
  expect(wrapper.attributes('data-loading-surface')).toBe('ready')
  expect(wrapper.find('.content-skeleton-layer').exists()).toBe(false)
})

it('keeps one shared sweep for pending images after data loading ends and clears it when they settle', async () => {
  const wrapper = create({
    default:
      '<div><span class="image-one" data-image-pending><span data-image-skeleton></span></span><span class="image-two" data-image-pending><span data-image-skeleton></span></span><p>Ready text</p></div>'
  })
  await wrapper.setProps({ loading: false })
  await nextTick()
  await vi.advanceTimersByTimeAsync(16)
  expect(wrapper.attributes('data-loading-surface')).toBe('ready')
  expect(wrapper.get('.content-loaded-layer').text()).toContain('Ready text')
  expect(wrapper.findAll('.content-skeleton-band')).toHaveLength(1)
  expect(wrapper.findAll('mask rect')).toHaveLength(2)
  wrapper.get('.image-one').element.removeAttribute('data-image-pending')
  await vi.advanceTimersByTimeAsync(32)
  expect(wrapper.findAll('mask rect')).toHaveLength(1)
  wrapper.get('.image-two').element.removeAttribute('data-image-pending')
  await vi.advanceTimersByTimeAsync(32)
  expect(wrapper.find('.content-skeleton-light').exists()).toBe(false)
})

it('releases reserved height after normal and reduced-motion reveals', async () => {
  for (const reduced of [false, true]) {
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }))
    const wrapper = create()
    await wrapper.setProps({ loading: false })
    await nextTick()
    await vi.advanceTimersByTimeAsync(400)
    expect((wrapper.element as HTMLElement).style.minHeight).toBe('')
  }
})
