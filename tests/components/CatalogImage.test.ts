import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CatalogImage from '../../src/components/CatalogImage.vue'

describe('public catalog images', () => {
  it('sets source policy and lazy-loading attributes before assigning src', () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!
    const observed: Array<{ policy: string | null; loading: string | null }> = []
    const setter = vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (
      this: HTMLImageElement,
      value: string
    ) {
      observed.push({
        policy: this.getAttribute('referrerpolicy'),
        loading: this.getAttribute('loading')
      })
      descriptor.set!.call(this, value)
    })
    try {
      const wrapper = mount(CatalogImage, { props: { src: '/source.png' } })
      expect(observed).toEqual([{ policy: 'strict-origin-when-cross-origin', loading: 'lazy' }])
      wrapper.unmount()
    } finally {
      setter.mockRestore()
    }
  })
  it('prioritizes only the first image and defers images beyond the first six', () => {
    const first = mount(CatalogImage, { props: { src: '/first.png', index: 0 } })
    const later = mount(CatalogImage, { props: { src: '/later.png', index: 6 } })
    expect(first.attributes()).toMatchObject({
      loading: 'eager',
      fetchpriority: 'high',
      decoding: 'async'
    })
    expect(later.attributes()).toMatchObject({ loading: 'lazy', fetchpriority: 'auto' })
    first.unmount()
    later.unmount()
  })

  it('keeps a retryable placeholder, prevents the card action and resets for a new source', async () => {
    const card = vi.fn()
    const wrapper = mount({
      components: { CatalogImage },
      props: { src: { default: '/original.png' } },
      setup: () => ({ card }),
      template: '<button @click="card"><CatalogImage :src="src" /></button>'
    })
    const image = wrapper.getComponent(CatalogImage)
    await image.get('img').trigger('error')
    expect(image.attributes('data-image-failed')).toBe('true')
    expect(image.attributes('src')).toMatch(/^data:image\/svg/)
    await image.get('img').trigger('keydown', { key: 'Enter' })
    expect(image.attributes('src')).toBe('/original.png')
    expect(card).not.toHaveBeenCalled()
    await image.get('img').trigger('error')
    await wrapper.setProps({ src: '/next.png' })
    expect(image.attributes('src')).toBe('/next.png')
    expect(image.attributes('data-image-failed')).toBeUndefined()
    wrapper.unmount()
  })
})
