import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LoadingCatalogImage from '../../src/components/LoadingCatalogImage.vue'

enableAutoUnmount(afterEach)
const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode')
const decode = vi.fn<() => Promise<void>>()
beforeEach(() => {
  decode.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: decode })
})
afterEach(() => {
  vi.restoreAllMocks()
  if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode)
  else delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode
})
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
it('keeps its skeleton through download and decode, then independently reveals the image', async () => {
  const decoding = deferred()
  decode.mockReturnValueOnce(decoding.promise)
  const wrapper = mount(LoadingCatalogImage, {
    props: { src: '/image.png' },
    attrs: { alt: 'Outfit', index: 0 }
  })
  expect(wrapper.find('[data-image-skeleton]').exists()).toBe(true)
  expect(wrapper.get('img').attributes()).toMatchObject({
    loading: 'eager',
    fetchpriority: 'high',
    alt: 'Outfit'
  })
  await wrapper.get('img').trigger('load')
  expect(decode).toHaveBeenCalledOnce()
  expect(wrapper.attributes('data-image-pending')).toBe('true')
  expect(wrapper.classes()).not.toContain('is-ready')
  decoding.resolve()
  await flushPromises()
  expect(wrapper.classes()).toContain('is-ready')
  expect(wrapper.find('[data-image-skeleton]').exists()).toBe(false)
  expect(wrapper.emitted('load')).toHaveLength(1)
})
it('ends failed downloads with a retry that does not activate the parent card', async () => {
  const click = vi.fn()
  const wrapper = mount({
    components: { LoadingCatalogImage },
    setup: () => ({ click }),
    template: '<button @click="click"><LoadingCatalogImage src="/image.png" /></button>'
  })
  const image = wrapper.getComponent(LoadingCatalogImage)
  await image.get('img').trigger('error')
  expect(image.find('[data-image-skeleton]').exists()).toBe(false)
  expect(image.attributes('data-image-pending')).toBeUndefined()
  await image.get('.catalog-image-retry').trigger('keydown', { key: 'Enter' })
  expect(click).not.toHaveBeenCalled()
  expect(image.emitted('retry')).toHaveLength(1)
  expect(image.get('img').attributes('src')).toBe('/image.png')
  expect(image.find('[data-image-skeleton]').exists()).toBe(true)
  await image.get('img').trigger('load')
  await flushPromises()
  expect(image.classes()).toContain('is-ready')
})
it('also ends a failed decode with a retryable placeholder', async () => {
  decode.mockRejectedValueOnce(new Error('decode failed'))
  const wrapper = mount(LoadingCatalogImage, { props: { src: '/bad.png' } })
  await wrapper.get('img').trigger('load')
  await flushPromises()
  expect(wrapper.classes()).toContain('is-failed')
  expect(wrapper.find('[data-image-skeleton]').exists()).toBe(false)
  expect(wrapper.find('[role="button"]').exists()).toBe(true)
  expect(wrapper.emitted('load')).toBeUndefined()
})
it('ignores a stale decode when the source changes and loads the replacement', async () => {
  const previous = deferred()
  decode.mockReturnValueOnce(previous.promise)
  const wrapper = mount(LoadingCatalogImage, { props: { src: '/old.png' } })
  const oldImage = wrapper.get('img').element
  await wrapper.get('img').trigger('load')
  await wrapper.setProps({ src: '/new.png' })
  oldImage.dispatchEvent(new Event('error'))
  previous.resolve()
  await flushPromises()
  expect(wrapper.classes()).not.toContain('is-ready')
  expect(wrapper.emitted('load')).toBeUndefined()
  await wrapper.get('img').trigger('load')
  await flushPromises()
  expect(wrapper.classes()).toContain('is-ready')
  expect(wrapper.emitted('load')).toHaveLength(1)
})
it('handles cached images whose load event happened before mounting', async () => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(100)
  const wrapper = mount(LoadingCatalogImage, { props: { src: '/cached.png' } })
  await flushPromises()
  expect(decode).toHaveBeenCalledOnce()
  expect(wrapper.classes()).toContain('is-ready')
})
it('shows images without decode support and ignores decode results after unmounting', async () => {
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode
  const wrapper = mount(LoadingCatalogImage, { props: { src: '/supported.png' } })
  await wrapper.get('img').trigger('load')
  expect(wrapper.classes()).toContain('is-ready')
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: decode })
  const pending = deferred()
  decode.mockReturnValueOnce(pending.promise)
  const next = mount(LoadingCatalogImage, { props: { src: '/later.png' } })
  await next.get('img').trigger('load')
  next.unmount()
  pending.resolve()
  await flushPromises()
  expect(next.emitted('load')).toBeUndefined()
})

it('keeps a valid cached image visible when the optional decode call rejects', async () => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(3456)
  decode.mockRejectedValueOnce(new Error('transient decode failure'))
  const wrapper = mount(LoadingCatalogImage, { props: { src: '/valid.png' } })
  await flushPromises()
  expect(wrapper.classes()).toContain('is-ready')
  expect(wrapper.classes()).not.toContain('is-failed')
  expect(wrapper.find('[data-image-skeleton]').exists()).toBe(false)
  expect(wrapper.emitted('error')).toBeUndefined()
})
