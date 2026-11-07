import type { InjectionKey, ObjectDirective } from 'vue'

export const globalSkeletonSweepKey: InjectionKey<boolean> = Symbol('global-skeleton-sweep')
interface ImageState {
  source: string
  generation: number
  bone: HTMLSpanElement | null
  parent: HTMLElement
  opacity: string
  priority: string
  settled: boolean
  onLoad: () => void
  onError: () => void
  animation?: Animation
}
const states = new Map<HTMLImageElement, ImageState>()
const parents = new WeakMap<HTMLElement, { count: number; position: string }>()
let resize: ResizeObserver | undefined

function place(image: HTMLImageElement, state: ImageState) {
  if (!state.bone) return
  const style = getComputedStyle(image)
  Object.assign(state.bone.style, {
    left: image.offsetLeft + 'px',
    top: image.offsetTop + 'px',
    width: (image.offsetWidth || image.getBoundingClientRect().width) + 'px',
    height: (image.offsetHeight || image.getBoundingClientRect().height) + 'px',
    borderRadius: style.borderRadius
  })
}
function removeBone(state: ImageState) {
  state.bone?.remove()
  state.bone = null
}
function restore(image: HTMLImageElement, state: ImageState) {
  if (state.opacity) image.style.setProperty('opacity', state.opacity, state.priority)
  else image.style.removeProperty('opacity')
}
function fail(image: HTMLImageElement, state: ImageState) {
  if (state.settled) return
  state.generation++
  state.settled = true
  resize?.unobserve(image)
  if (!state.bone) return
  state.bone.removeAttribute('data-image-pending')
  state.bone.removeAttribute('aria-hidden')
  state.bone.setAttribute('role', 'img')
  state.bone.setAttribute('aria-label', image.alt || 'Image unavailable')
  state.bone.textContent = '×'
  state.bone.classList.add('image-skeleton-failed')
}
async function reveal(image: HTMLImageElement, state: ImageState) {
  if (!states.has(image)) return
  const recovering = state.bone?.classList.contains('image-skeleton-failed') && image.complete && image.naturalWidth > 0
  if (state.settled && !recovering) return
  state.settled = false
  const run = ++state.generation
  try {
    if (typeof image.decode === 'function') await image.decode()
  } catch {
    if (states.get(image) !== state || run !== state.generation) return
    // decode() can reject even after a successful native load; keep usable images visible.
    if (!image.complete || image.naturalWidth === 0) {
      fail(image, state)
      return
    }
  }
  if (states.get(image) !== state || run !== state.generation) return
  state.settled = true
  resize?.unobserve(image)
  restore(image, state)
  removeBone(state)
  if (image.animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    state.animation = image.animate(
      [{ opacity: 0 }, { opacity: getComputedStyle(image).opacity }],
      { duration: 220, easing: 'ease-out' }
    )
  }
}
function start(image: HTMLImageElement, state: ImageState) {
  state.generation++
  state.source = image.getAttribute('src') ?? ''
  state.animation?.cancel()
  removeBone(state)
  if (image.hasAttribute('data-image-failed') || !state.source) {
    state.settled = true
    restore(image, state)
    return
  }
  state.settled = false
  resize?.observe(image)
  const bone = document.createElement('span')
  bone.className = 'image-skeleton-block'
  bone.setAttribute('data-image-skeleton', '')
  bone.setAttribute('data-image-pending', 'true')
  bone.setAttribute('aria-hidden', 'true')
  state.bone = bone
  image.style.setProperty('opacity', '0', 'important')
  image.insertAdjacentElement('afterend', bone)
  place(image, state)
  if (image.complete && image.naturalWidth > 0) void reveal(image, state)
}
function attach(image: HTMLImageElement) {
  const parent = image.parentElement
  if (!parent) return
  const ownership = parents.get(parent)
  if (ownership) ownership.count++
  else if (getComputedStyle(parent).position === 'static' || !getComputedStyle(parent).position) {
    parents.set(parent, { count: 1, position: parent.style.position })
    parent.style.position = 'relative'
  }
  const state: ImageState = {
    source: '',
    generation: 0,
    bone: null,
    parent,
    settled: false,
    opacity: image.style.getPropertyValue('opacity'),
    priority: image.style.getPropertyPriority('opacity'),
    onLoad: () => void reveal(image, state),
    onError: () => fail(image, state)
  }
  states.set(image, state)
  image.addEventListener('load', state.onLoad)
  image.addEventListener('error', state.onError)
  if (typeof ResizeObserver !== 'undefined') {
    resize ??= new ResizeObserver((entries) => {
      for (const { target } of entries) {
        const item = states.get(target as HTMLImageElement)
        if (item) place(target as HTMLImageElement, item)
      }
    })
  }
  start(image, state)
}
function detach(image: HTMLImageElement) {
  const state = states.get(image)
  if (!state) return
  state.generation++
  state.animation?.cancel()
  removeBone(state)
  restore(image, state)
  image.removeEventListener('load', state.onLoad)
  image.removeEventListener('error', state.onError)
  resize?.unobserve(image)
  states.delete(image)
  const ownership = parents.get(state.parent)
  if (ownership && --ownership.count === 0) {
    if (state.parent.style.position === 'relative') state.parent.style.position = ownership.position
    parents.delete(state.parent)
  }
  if (!states.size) {
    resize?.disconnect()
    resize = undefined
  }
}
export const vImageSkeleton: ObjectDirective<HTMLImageElement, boolean | undefined> = {
  mounted(image, { value }) {
    if (value !== false) attach(image)
  },
  updated(image, { value }) {
    if (value === false) {
      detach(image)
      return
    }
    const state = states.get(image)
    if (!state) {
      attach(image)
      return
    }
    if (
      state.source !== (image.getAttribute('src') ?? '') ||
      image.hasAttribute('data-image-failed')
    )
      start(image, state)
    else place(image, state)
  },
  beforeUnmount(image) {
    const state = states.get(image)
    if (state) {
      state.generation++
      state.settled = true
    }
  },
  // Vue may use the sibling as the replacement anchor; remove it after patching.
  unmounted: detach
}
