import type { ObjectDirective } from 'vue'

// 网格卸载后释放历史；长期浏览同一网格只保留最近展示的卡片。
const histories = new WeakMap<Element, Set<string>>()
const historyLimit = 2048
const waiting = new Map<HTMLElement, () => void>()
const pending = new Map<HTMLElement, { key: string; seen: Set<string> }>()
let observer: IntersectionObserver | undefined

function stopObserving(card: HTMLElement) {
  waiting.get(card)?.()
  waiting.delete(card)
  pending.delete(card)
  observer?.unobserve(card)
  if (!pending.size) {
    observer?.disconnect()
    observer = undefined
  }
  card.classList.remove('card-reveal-pending')
}

// 根据当前布局找出同一行前面的卡片数量，兼容响应式列数和分批网格。
function columnIndex(card: HTMLElement) {
  let column = 0
  let previous = card.previousElementSibling
  while (
    previous instanceof HTMLElement &&
    previous.hasAttribute('data-reveal-card') &&
    previous.offsetTop === card.offsetTop
  ) {
    column++
    previous = previous.previousElementSibling
  }
  return column
}

function onIntersection(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    const card = entry.target as HTMLElement
    const item = pending.get(card)
    if (!item || !entry.isIntersecting || entry.intersectionRatio < 0.15) continue
    const { key, seen } = item
    const replay = seen.has(key)
    seen.add(key)
    if (seen.size > historyLimit) seen.delete(seen.values().next().value!)
    stopObserving(card)
    if (
      replay ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      card.contains(document.activeElement)
    )
      continue

    const delay = columnIndex(card) * 70
    card.animate(
      [
        { opacity: 0, transform: 'translateY(40px)' },
        { opacity: 1, transform: 'translateY(-2px)', offset: 0.78 },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      { duration: 500, delay, easing: 'ease-out', fill: 'backwards' }
    )

    const covers = card.querySelectorAll(
      '.lazy-photo-image, .stored-image, .photo-frame > img, .wardrobe-cover > img, .camera-resources img, :scope > img'
    )
    for (const cover of covers) {
      cover.animate(
        [
          { transform: 'scale(1.08)', composite: 'add' },
          { transform: 'scale(1)', composite: 'add' }
        ],
        { duration: 700, delay, easing: 'ease-out', fill: 'backwards' }
      )
    }
  }
}

function register(card: HTMLElement, value: string) {
  card.setAttribute('data-reveal-card', '')
  // First-load blocks are animated by the shared skeleton surface.
  const loadingSurface = card.closest('[data-loading-surface]')
  if (loadingSurface && loadingSurface.getAttribute('data-loading-surface') !== 'ready') {
    const onReady = () => {
      waiting.get(card)?.()
      waiting.delete(card)
      if (!card.querySelector('[data-load-revealed]') && !card.hasAttribute('data-load-revealed'))
        register(card, value)
    }
    loadingSurface.addEventListener('nuan-content-ready', onReady)
    waiting.set(card, () => loadingSurface.removeEventListener('nuan-content-ready', onReady))
    return
  }
  const grid = card.parentElement
  if (
    !grid ||
    !window.IntersectionObserver ||
    !card.animate ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return
  let seen = histories.get(grid)
  if (!seen) {
    seen = new Set()
    histories.set(grid, seen)
  }
  if (seen.has(value)) return
  pending.set(card, { key: value, seen })
  card.classList.add('card-reveal-pending')
  observer ??= new IntersectionObserver(onIntersection, { threshold: 0.15 })
  observer.observe(card)
}
export const vCardReveal: ObjectDirective<HTMLElement, string> = {
  mounted(card, { value }) {
    register(card, value)
  },
  beforeUnmount(card) {
    stopObserving(card)
  }
}
