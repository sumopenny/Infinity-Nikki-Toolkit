import type { ObjectDirective } from 'vue'

const seen = new Set<string>()
const pending = new Map<HTMLElement, string>()
let observer: IntersectionObserver | undefined

function stopObserving(card: HTMLElement) {
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
  while (previous instanceof HTMLElement && previous.hasAttribute('data-reveal-card') &&
         previous.offsetTop === card.offsetTop) {
    column++
    previous = previous.previousElementSibling
  }
  return column
}

function onIntersection(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    const card = entry.target as HTMLElement
    const key = pending.get(card)
    if (key === undefined || !entry.isIntersecting || entry.intersectionRatio < 0.15) continue
    const replay = seen.has(key)
    seen.add(key)
    stopObserving(card)
    if (replay || window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        card.contains(document.activeElement)) continue

    const delay = columnIndex(card) * 70
    card.animate([
      { opacity: 0, transform: 'translateY(40px)' },
      { opacity: 1, transform: 'translateY(-2px)', offset: 0.78 },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 500, delay, easing: 'ease-out', fill: 'backwards' })

    const covers = card.querySelectorAll('.lazy-photo-image, .stored-image, .photo-frame > img, .wardrobe-cover > img, .camera-resources img, :scope > img')
    for (const cover of covers) {
      cover.animate([
        { transform: 'scale(1.08)', composite: 'add' },
        { transform: 'scale(1)', composite: 'add' }
      ], { duration: 700, delay, easing: 'ease-out', fill: 'backwards' })
    }
  }
}

export const vCardReveal: ObjectDirective<HTMLElement, string> = {
  mounted(card, { value }) {
    card.setAttribute('data-reveal-card', '')
    if (seen.has(value) || !window.IntersectionObserver || !card.animate ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    pending.set(card, value)
    card.classList.add('card-reveal-pending')
    observer ??= new IntersectionObserver(onIntersection, { threshold: 0.15 })
    observer.observe(card)
  },
  beforeUnmount(card) {
    stopObserving(card)
  }
}
