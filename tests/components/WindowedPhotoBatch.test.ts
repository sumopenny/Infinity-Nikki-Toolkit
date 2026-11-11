import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import WindowedPhotoBatch from '../../src/components/WindowedPhotoBatch.vue'
afterEach(() => vi.unstubAllGlobals())
it('mounts only nearby cards and keeps a measured placeholder after leaving', async () => {
  let notify!: IntersectionObserverCallback
  const disconnect = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback
      }
      observe() {}
      disconnect = disconnect
    }
  )
  const wrapper = mount(WindowedPhotoBatch, {
    props: { count: 36 },
    slots: { default: '<article>photo</article>' }
  })
  expect(wrapper.find('article').exists()).toBe(false)
  const visible = async (value: boolean) => {
    notify([{ isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver)
    await nextTick()
  }
  await visible(true)
  expect(wrapper.find('article').exists()).toBe(true)
  vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({ height: 640 } as DOMRect)
  await visible(false)
  expect(wrapper.find('article').exists()).toBe(false)
  expect((wrapper.element as HTMLElement).style.height).toBe('640px')
  wrapper.unmount()
  expect(disconnect).toHaveBeenCalled()
})

it('estimates rows with the photo ratio, padding, mobile actions and actual gaps', async () => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    gridTemplateColumns: '208px 208px 208px',
    rowGap: '8px',
    columnGap: '8px',
    getPropertyValue: () => '34'
  } as unknown as CSSStyleDeclaration)
  const wrapper = mount(WindowedPhotoBatch, { props: { count: 6, aspectRatio: 2 } })
  await nextTick()
  // 208px card -> 190px image -> 95 + 18 + 34px per row, plus one 8px gap.
  expect((wrapper.element as HTMLElement).style.height).toBe('302px')
  await wrapper.setProps({ aspectRatio: 1 })
  expect((wrapper.element as HTMLElement).style.height).toBe('492px')
  await wrapper.setProps({ count: 3 })
  expect((wrapper.element as HTMLElement).style.height).toBe('242px')
  wrapper.unmount()
  vi.restoreAllMocks()
})
