import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as visibility from '../../src/utils/storedImageVisibility'

afterEach(() => vi.restoreAllMocks())
import CatalogQuality from '../../src/components/CatalogQuality.vue'

describe('catalog quality', () => {
  it('renders crown quality as an accessible icon with unique SVG definitions', () => {
    const wrapper = mount({
      components: { CatalogQuality },
      template:
        '<div><CatalogQuality :quality="8" /><CatalogQuality :quality="8" language="en" /></div>'
    })
    const [first, second] = wrapper.findAllComponents(CatalogQuality)
    expect(first.text()).toBe('')
    expect(first.get('[role="img"]').attributes('aria-label')).toBe('星冕')
    expect(second.get('[role="img"]').attributes('aria-label')).toBe('Crown')
    expect(first.find('svg').exists()).toBe(true)
    expect(first.get('clipPath').attributes('id')).not.toBe(second.get('clipPath').attributes('id'))
    expect(first.get('svg > path').attributes('fill')).toBe(
      `url(#${first.get('linearGradient').attributes('id')})`
    )
    wrapper.unmount()
  })
  it('pauses offscreen and in background, and releases observation on quality change', async () => {
    let notify!: (visible: boolean) => void
    const stop = vi.fn()
    const observe = vi
      .spyOn(visibility, 'observeStoredImageVisibility')
      .mockImplementation((_element, callback) => {
        notify = callback
        return stop
      })
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const wrapper = mount(CatalogQuality, { props: { quality: 8 } })
    await nextTick()
    const state = () =>
      (wrapper.element as HTMLElement).style.getPropertyValue('--crown-play-state')
    notify(true)
    expect(state()).toBe('running')
    notify(false)
    expect(state()).toBe('paused')
    notify(true)
    hidden.mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(state()).toBe('paused')
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(state()).toBe('running')
    await wrapper.setProps({ quality: 5 })
    expect(stop).toHaveBeenCalledOnce()
    expect(observe).toHaveBeenCalledOnce()
    expect(state()).toBe('')
    wrapper.unmount()
  })
  it('preserves ordinary stars and missing-quality fallback', async () => {
    const wrapper = mount(CatalogQuality, { props: { quality: 5 } })
    expect(wrapper.text()).toBe('5 ★')
    expect(wrapper.find('svg').exists()).toBe(false)
    await wrapper.setProps({ quality: undefined })
    expect(wrapper.text()).toBe('未知')
    wrapper.unmount()
  })
})
