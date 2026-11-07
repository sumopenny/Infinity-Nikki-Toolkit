import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { vCardReveal } from '../../src/utils/cardReveal'

it('remembers cards within a grid and starts fresh for a new grid', async () => {
  let reveal!: (entries: Partial<IntersectionObserverEntry>[]) => void
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof reveal) {
        reveal = callback
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
  const animate = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
  const view = mount(
    {
      directives: { cardReveal: vCardReveal },
      props: { visible: Boolean, grid: Number },
      template: `<section :key="grid"><div v-if="visible" v-card-reveal="'card'"></div></section>`
    },
    { props: { visible: true, grid: 1 } }
  )
  try {
    reveal([{ target: view.get('div').element, isIntersecting: true, intersectionRatio: 1 }])
    expect(animate).toHaveBeenCalledTimes(1)
    await view.setProps({ visible: false })
    await view.setProps({ visible: true })
    expect(view.get('div').classes()).not.toContain('card-reveal-pending')
    await view.setProps({ grid: 2 })
    expect(view.get('div').classes()).toContain('card-reveal-pending')
    reveal([{ target: view.get('div').element, isIntersecting: true, intersectionRatio: 1 }])
    expect(animate).toHaveBeenCalledTimes(2)
  } finally {
    view.unmount()
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    vi.unstubAllGlobals()
  }
})

it('registers offscreen first-load cards once their loading surface is ready', async () => {
  const observe = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = observe
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn() })
  const wrapper = mount({
    directives: { cardReveal: vCardReveal },
    template:
      '<section data-loading-surface="revealing"><article v-card-reveal="\'below\'"><div data-load-block></div></article></section>'
  })
  try {
    expect(observe).not.toHaveBeenCalled()
    wrapper.element.setAttribute('data-loading-surface', 'ready')
    wrapper.get('article').element.dispatchEvent(new Event('nuan-content-ready', { bubbles: true }))
    expect(observe).toHaveBeenCalledOnce()
    expect(wrapper.get('article').classes()).toContain('card-reveal-pending')
  } finally {
    wrapper.unmount()
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    vi.unstubAllGlobals()
  }
})
