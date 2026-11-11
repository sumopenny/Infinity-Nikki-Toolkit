import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import LazyPhotoImage from '../../src/components/LazyPhotoImage.vue'
import type { PhotoDisplayItem } from '../../src/utils/photoGrouping'

it('preserves the original URL by default for other image grids', async () => {
  const loadPhoto = vi.fn(async () => 'blob:loaded')
  const wrapper = mount(LazyPhotoImage, {
    props: {
      photo: { id: 'a', name: 'a.jpg', url: 'blob:original' } as PhotoDisplayItem,
      loadPhoto,
      failureText: 'failed'
    }
  })
  expect(wrapper.get('img').attributes('src')).toBe('blob:original')
  expect(loadPhoto).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('reloads a refreshed database image with the same ID and ignores the previous asynchronous result', async () => {
  const first = { id: 'same', name: 'same.webp', url: null } as PhotoDisplayItem
  const second = { ...first }
  const completions: Array<(url: string) => void> = []
  const loadPhoto = vi.fn(() => new Promise<string>((resolve) => completions.push(resolve)))
  const wrapper = mount(LazyPhotoImage, {
    props: { photo: first, loadPhoto, failureText: 'failed' }
  })
  try {
    await wrapper.setProps({ photo: second })
    completions[0]('blob:stale')
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    completions[1]('blob:current')
    await flushPromises()
    expect(wrapper.get('img').attributes('src')).toBe('blob:current')
  } finally {
    wrapper.unmount()
  }
})

it('uses a separate thumbnail even when the original is loaded and releases it on unmount', async () => {
  let signal: AbortSignal | undefined
  const loadPhoto = vi.fn(async (_photo, inputSignal) => {
    signal = inputSignal
    return 'blob:thumbnail'
  })
  const wrapper = mount(LazyPhotoImage, {
    props: {
      photo: { id: 'a', name: 'a.jpg', url: 'blob:original' } as PhotoDisplayItem,
      useSourceUrl: false,
      loadPhoto,
      failureText: 'failed'
    }
  })
  await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('blob:thumbnail')
  wrapper.unmount()
  expect(signal?.aborted).toBe(true)
})

it('retries a failed thumbnail and reloads when the size-specific loader changes', async () => {
  const loadPhoto = vi
    .fn()
    .mockRejectedValueOnce(new Error('failed'))
    .mockResolvedValue('blob:small')
  const wrapper = mount(LazyPhotoImage, {
    props: {
      photo: { id: 'a', name: 'a.jpg', url: null } as PhotoDisplayItem,
      useSourceUrl: false,
      loadPhoto,
      failureText: 'failed'
    }
  })
  await flushPromises()
  await wrapper.get('.photo-load-failed button').trigger('click')
  await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('blob:small')
  await wrapper.setProps({ loadPhoto: async () => 'blob:large' })
  await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('blob:large')
  wrapper.unmount()
})
