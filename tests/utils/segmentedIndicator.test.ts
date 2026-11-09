// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, withDirectives } from 'vue'
import { mount } from '@vue/test-utils'
import { vSegmentedIndicator } from '../../src/utils/segmentedIndicator'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('segmented indicator', () => {
  function setup() {
    let resize = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback
        }
        observe() {}
        unobserve() {}
        disconnect = disconnect
      }
    )
    let top = 4
    let width = 120
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.textContent === 'First' ? 70 : width
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(36)
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.textContent === 'First' ? 4 : 78
    })
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(() => top)
    const selected = ref(0)
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          withDirectives(
            h(
              'div',
              ['First', 'Second'].map((label, index) =>
                h('button', { 'aria-pressed': selected.value === index }, label)
              )
            ),
            [[vSegmentedIndicator]]
          )
      })
    )
    return {
      wrapper,
      selected,
      resize: () => resize(),
      disconnect,
      layout: (y: number, w: number) => {
        top = y
        width = w
      }
    }
  }

  it('measures unequal options and follows the latest selection without a queued animation', async () => {
    const { wrapper, selected } = setup()
    const el = wrapper.element as HTMLElement
    expect(el.style.getPropertyValue('--segment-width')).toBe('70px')
    selected.value = 1
    await nextTick()
    expect(el.style.getPropertyValue('--segment-x')).toBe('78px')
    expect(el.style.getPropertyValue('--segment-width')).toBe('120px')
    selected.value = 0
    await nextTick()
    selected.value = 1
    await nextTick()
    expect(el.style.getPropertyValue('--segment-x')).toBe('78px')
    wrapper.unmount()
  })

  it('repositions after wrapping or resizing and disconnects on unmount', async () => {
    const { wrapper, selected, layout, resize, disconnect } = setup()
    selected.value = 1
    await nextTick()
    layout(44, 160)
    resize()
    const el = wrapper.element as HTMLElement
    expect(el.style.getPropertyValue('--segment-y')).toBe('44px')
    expect(el.style.getPropertyValue('--segment-width')).toBe('160px')
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('hides the indicator when no option is selected and restores it when selection returns', async () => {
    const { wrapper, selected } = setup()
    selected.value = -1
    await nextTick()
    expect(wrapper.classes()).not.toContain('segmented-ready')
    selected.value = 1
    await nextTick()
    expect(wrapper.classes()).toContain('segmented-ready')
    wrapper.unmount()
  })
})
