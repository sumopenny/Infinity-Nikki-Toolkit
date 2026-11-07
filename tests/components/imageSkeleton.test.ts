import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { vImageSkeleton } from '../../src/utils/imageSkeleton'

const wrappers: ReturnType<typeof mount>[] = []
const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode')
const decode = vi.fn<() => Promise<void>>()
beforeEach(() => {
  decode.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: decode })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    top: 20,
    left: 10,
    width: 120,
    height: 90,
    right: 130,
    bottom: 110,
    toJSON() {}
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode)
  else delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode
  document.body.innerHTML = ''
})
function page() {
  const wrapper = mount(
    {
      directives: { imageSkeleton: vImageSkeleton },
      props: { source: { default: '/old.png' } },
      template:
        '<section><img v-image-skeleton :src="source" alt="Picture" style="object-fit: contain" /></section>'
    },
    { attachTo: document.body }
  )
  wrappers.push(wrapper)
  return wrapper
}
it('preserves image geometry and waits for decoding before removing its skeleton', async () => {
  let finish!: () => void
  decode.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const wrapper = page()
  const image = wrapper.get('img')
  expect(image.attributes('style')).toContain('object-fit: contain')
  expect(wrapper.get('[data-image-pending]').attributes('style')).toContain('width: 120px')
  await image.trigger('load')
  expect(wrapper.find('[data-image-pending]').exists()).toBe(true)
  finish()
  await flushPromises()
  expect(wrapper.find('[data-image-skeleton]').exists()).toBe(false)
  expect(image.element.style.opacity).toBe('')
})
it('ignores late decoding after changing the source, and removes all state after unmount', async () => {
  let finish!: () => void
  decode.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const wrapper = page()
  await wrapper.get('img').trigger('load')
  await wrapper.setProps({ source: '/new.png' })
  finish()
  await flushPromises()
  expect(wrapper.find('[data-image-pending]').exists()).toBe(true)
  await wrapper.get('img').trigger('load')
  await flushPromises()
  expect(wrapper.find('[data-image-skeleton]').exists()).toBe(false)
  await wrapper.setProps({ source: '/third.png' })
  expect(document.querySelectorAll('[data-image-pending]')).toHaveLength(1)
  wrapper.unmount()
  wrappers.splice(0)
  expect(document.querySelector('[data-image-pending]')).toBeNull()
})
it('stops the sweep on a failed download and resets when a new source is selected', async () => {
  const wrapper = page()
  await wrapper.get('img').trigger('error')
  expect(wrapper.find('[data-image-pending]').exists()).toBe(false)
  expect(wrapper.get('[role="img"]').text()).toBe('×')
  await wrapper.setProps({ source: '/replacement.png' })
  expect(wrapper.find('[role="img"]').exists()).toBe(false)
  expect(wrapper.find('[data-image-pending]').exists()).toBe(true)
})
it('ends failed decodes instead of leaving an infinite skeleton', async () => {
  decode.mockRejectedValueOnce(new Error('bad image'))
  const wrapper = page()
  await wrapper.get('img').trigger('load')
  await flushPromises()
  expect(wrapper.find('[data-image-pending]').exists()).toBe(false)
  expect(wrapper.find('[role="img"]').exists()).toBe(true)
})
it('handles already cached images without waiting for a second load event', async () => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(120)
  const wrapper = page()
  await flushPromises()
  expect(decode).toHaveBeenCalledOnce()
  expect(wrapper.find('[data-image-skeleton]').exists()).toBe(false)
})

it('shows an already loaded image when decode rejects without invalidating its pixels', async () => {
  const wrapper = page()
  const image = wrapper.get('img').element
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    naturalWidth: { configurable: true, value: 3456 }
  })
  decode.mockRejectedValueOnce(new Error('transient decode failure'))
  await wrapper.get('img').trigger('load')
  await flushPromises()
  expect(wrapper.find('.image-skeleton-failed').exists()).toBe(false)
  expect(wrapper.find('[data-image-skeleton]').exists()).toBe(false)
  expect(image.style.opacity).toBe('')
})
it('recovers from a temporary error if a later native load succeeds', async () => {
  const wrapper = page()
  await wrapper.get('img').trigger('error')
  expect(wrapper.find('.image-skeleton-failed').exists()).toBe(true)
  Object.defineProperties(wrapper.get('img').element, {
    complete: { configurable: true, value: true },
    naturalWidth: { configurable: true, value: 3456 }
  })
  await wrapper.get('img').trigger('load')
  await flushPromises()
  expect(wrapper.find('.image-skeleton-failed').exists()).toBe(false)
  expect(wrapper.get('img').element.style.opacity).toBe('')
})
