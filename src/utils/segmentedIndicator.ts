import type { ObjectDirective } from 'vue'

type Indicator = { update: () => void; dispose: () => void }
const indicators = new WeakMap<HTMLElement, Indicator>()

/** Read the existing selection; CSS transitions retarget directly on rapid changes. */
export const vSegmentedIndicator: ObjectDirective<HTMLElement> = {
  mounted(el) {
    let frame = 0
    const observed = new Set<Element>()
    const update = () => {
      const buttons = Array.from(el.children).filter(
        (child): child is HTMLButtonElement => child instanceof HTMLButtonElement
      )
      for (const child of observed) {
        if (!buttons.includes(child as HTMLButtonElement)) {
          observer?.unobserve(child)
          observed.delete(child)
        }
      }
      for (const button of buttons) {
        if (!observed.has(button)) {
          observer?.observe(button)
          observed.add(button)
        }
      }
      const selected = buttons.find(
        (button) => button.getAttribute('aria-pressed') === 'true' ||
          button.getAttribute('aria-current') === 'page'
      )
      if (!selected || !selected.offsetWidth || !selected.offsetHeight) {
        el.classList.remove('segmented-ready', 'segmented-animate')
        cancelAnimationFrame(frame)
        return
      }
      el.style.setProperty('--segment-x', `${selected.offsetLeft}px`)
      el.style.setProperty('--segment-y', `${selected.offsetTop}px`)
      el.style.setProperty('--segment-width', `${selected.offsetWidth}px`)
      el.style.setProperty('--segment-height', `${selected.offsetHeight}px`)
      el.style.setProperty('--segment-radius', getComputedStyle(selected).borderRadius)
      if (!el.classList.contains('segmented-ready')) {
        el.classList.add('segmented-ready')
        // First appearance starts at the selected option, never from the origin.
        frame = requestAnimationFrame(() => el.classList.add('segmented-animate'))
      }
    }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    el.classList.add('segmented-control')
    observer?.observe(el)
    indicators.set(el, {
      update,
      dispose: () => {
        observer?.disconnect()
        cancelAnimationFrame(frame)
      }
    })
    update()
  },
  updated(el) {
    indicators.get(el)?.update()
  },
  beforeUnmount(el) {
    indicators.get(el)?.dispose()
    indicators.delete(el)
  }
}
