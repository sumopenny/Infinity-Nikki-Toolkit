import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SkeletonSweep from '../../src/components/SkeletonSweep.vue'
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16)
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const top = this.hasAttribute('data-far') ? 3000 : 20
    return {
      x: 10,
      y: top,
      top,
      left: 10,
      width: 120,
      height: 90,
      right: 130,
      bottom: top + 90,
      toJSON() {}
    }
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})
it('uses one fixed-angle band for visible skeletons, independent of list height', async () => {
  document.body.innerHTML =
    '<div style="height:20000px"><span data-image-pending data-image-skeleton></span><span data-image-pending data-image-skeleton></span><span data-image-pending data-image-skeleton data-far></span></div>'
  wrapper = mount(SkeletonSweep, { props: { global: true }, attachTo: document.body })
  await vi.advanceTimersByTimeAsync(16)
  expect(wrapper.findAll('.content-skeleton-band')).toHaveLength(1)
  expect(wrapper.findAll('mask rect')).toHaveLength(2)
  expect(wrapper.get('.content-skeleton-band rect').attributes('transform')).toBe('skewX(-18)')
  expect(wrapper.get('.content-skeleton-band rect').attributes('height')).toBe(
    String(window.innerHeight)
  )
  expect(wrapper.get('svg').attributes('style')).toContain('height: ' + window.innerHeight + 'px')
  expect(wrapper.findAll('linearGradient stop')).toHaveLength(5)
})
it('masks only the active modal and clips images to its scrolling panel', async () => {
  document.body.innerHTML =
    '<span data-image-pending data-image-skeleton></span><div role="dialog" aria-modal="true" style="overflow:hidden"><span data-image-pending data-image-skeleton></span></div>'
  wrapper = mount(SkeletonSweep, { props: { global: true }, attachTo: document.body })
  await vi.advanceTimersByTimeAsync(16)
  expect(wrapper.findAll('mask rect')).toHaveLength(1)
  document
    .querySelector('[role="dialog"] [data-image-pending]')!
    .removeAttribute('data-image-pending')
  await vi.advanceTimersByTimeAsync(32)
  expect(wrapper.find('svg').exists()).toBe(false)
  wrapper.unmount()
  wrapper = undefined
  expect(vi.getTimerCount()).toBe(0)
})

it('adapts the band width to a phone viewport while preserving its angle', async () => {
  vi.stubGlobal('innerWidth', 390)
  vi.stubGlobal('innerHeight', 844)
  document.body.innerHTML = '<span data-image-pending data-image-skeleton></span>'
  wrapper = mount(SkeletonSweep, { props: { global: true }, attachTo: document.body })
  await vi.advanceTimersByTimeAsync(16)
  expect(wrapper.get('.content-skeleton-band rect').attributes('width')).toBe('80')
  expect(wrapper.get('.content-skeleton-band rect').attributes('transform')).toBe('skewX(-18)')
  expect(wrapper.get('.content-skeleton-band rect').attributes('height')).toBe('844')
})
it('ignores unrelated DOM updates when no image is loading', async () => {
  const request = vi.spyOn(window, 'requestAnimationFrame')
  wrapper = mount(SkeletonSweep, { props: { global: true }, attachTo: document.body })
  await vi.advanceTimersByTimeAsync(32)
  const before = request.mock.calls.length
  const unrelated = document.createElement('p')
  unrelated.textContent = 'Counter update'
  document.body.append(unrelated)
  unrelated.style.color = 'red'
  await vi.advanceTimersByTimeAsync(32)
  expect(request).toHaveBeenCalledTimes(before)
  const bone = document.createElement('span')
  bone.setAttribute('data-image-pending', 'true')
  bone.setAttribute('data-image-skeleton', '')
  document.body.append(bone)
  await vi.advanceTimersByTimeAsync(32)
  expect(wrapper.findAll('.content-skeleton-band')).toHaveLength(1)
})
