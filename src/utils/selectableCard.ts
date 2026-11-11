import type { ObjectDirective } from 'vue'

interface CardInteraction {
  selected: boolean
  selectionMode: boolean
  disabled?: boolean
  toggle: () => void
  preview: () => void
}

const imageArea = '.photo-frame, .camera-cover'
const action = 'button, a, input, select, textarea, [contenteditable="true"]'
const states = new WeakMap<
  HTMLElement,
  {
    options: CardInteraction
    destroy: () => void
    cancel: () => void
  }
>()

/** 五类卡片共用选择手势；只缩放图片，按钮与单击预览保持独立。 */
export const vSelectableCard: ObjectDirective<HTMLElement, CardInteraction> = {
  mounted(element, binding) {
    let options = binding.value
    let suppressClickUntil = 0
    let touchMenuActive = false
    let menuResetTimer: number | undefined
    let releaseMenuTracking = () => {}
    let cancelGesture = () => {}
    const state = {
      options,
      cancel: () => cancelGesture(),
      destroy: () => {
        cancelGesture()
        clearTouchMenu()
        element.removeEventListener('click', click)
        element.removeEventListener('keydown', keydown)
        element.removeEventListener('pointerdown', pointerdown)
        element.removeEventListener('contextmenu', contextmenu, true)
      }
    }
    const interactive = (target: EventTarget | null) =>
      target instanceof Element ? target.closest(action) : null

    function clearTouchMenu() {
      touchMenuActive = false
      window.clearTimeout(menuResetTimer)
      menuResetTimer = undefined
      releaseMenuTracking()
      releaseMenuTracking = () => {}
    }

    // 原生菜单可能在 pointercancel 后出现，菜单拦截单独保持到手指离开。
    function trackTouchMenu() {
      clearTouchMenu()
      touchMenuActive = true
      function released(event: Event) {
        if ('touches' in event && (event as TouchEvent).touches.length) return
        // 允许先派发 pointerup、随后派发 contextmenu 的浏览器完成本轮事件。
        window.clearTimeout(menuResetTimer)
        menuResetTimer = window.setTimeout(clearTouchMenu, 0)
      }
      document.addEventListener('pointerup', released)
      document.addEventListener('touchend', released, { passive: true })
      document.addEventListener('touchcancel', released, { passive: true })
      window.addEventListener('blur', clearTouchMenu)
      releaseMenuTracking = () => {
        document.removeEventListener('pointerup', released)
        document.removeEventListener('touchend', released)
        document.removeEventListener('touchcancel', released)
        window.removeEventListener('blur', clearTouchMenu)
      }
    }

    function click(event: MouseEvent) {
      options = state.options
      const target = event.target instanceof Element ? event.target : null
      if (event.detail !== 0 && Date.now() < suppressClickUntil) {
        suppressClickUntil = 0
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (options.disabled) return
      if (target?.closest('.selected-badge')) {
        event.stopPropagation()
        options.toggle()
      } else if (!interactive(event.target)) {
        options.preview()
      }
    }

    function keydown(event: KeyboardEvent) {
      clearTouchMenu()
      if (event.target !== element || state.options.disabled || event.repeat) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (event.key === ' ') state.options.toggle()
        else state.options.preview()
      }
    }

    function pointerdown(event: PointerEvent) {
      cancelGesture()
      clearTouchMenu()
      suppressClickUntil = 0
      if (
        state.options.disabled ||
        !event.isPrimary ||
        event.pointerType === 'mouse' ||
        !['touch', 'pen'].includes(event.pointerType) ||
        interactive(event.target)
      )
        return
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest(imageArea)) return
      trackTouchMenu()
      let fired = false
      const { clientX, clientY, pointerId } = event
      element.classList.add('is-pressing')
      const timer = window.setTimeout(() => {
        if (state.options.disabled || !element.isConnected) return finish()
        fired = true
        element.classList.remove('is-pressing')
        state.options.toggle()
      }, 450)
      function finish() {
        window.clearTimeout(timer)
        element.classList.remove('is-pressing')
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        document.removeEventListener('pointercancel', cancel)
        document.removeEventListener('scroll', cancel, true)
        element.removeEventListener('pointerleave', cancel)
        window.removeEventListener('blur', cancel)
        cancelGesture = () => {}
      }
      function move(next: PointerEvent) {
        if (next.pointerId !== pointerId) return
        if (Math.hypot(next.clientX - clientX, next.clientY - clientY) > 10) cancel()
      }
      function up(next: PointerEvent) {
        if (next.pointerId !== pointerId) return
        if (fired) suppressClickUntil = Date.now() + 800
        finish()
      }
      function cancel() {
        suppressClickUntil = Date.now() + 800
        finish()
      }
      cancelGesture = cancel
      document.addEventListener('pointermove', move, { passive: true })
      document.addEventListener('pointerup', up)
      document.addEventListener('pointercancel', cancel)
      document.addEventListener('scroll', cancel, true)
      element.addEventListener('pointerleave', cancel)
      window.addEventListener('blur', cancel)
    }

    function contextmenu(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null
      if (
        (touchMenuActive ||
          ('pointerType' in event && ['touch', 'pen'].includes(String(event.pointerType)))) &&
        target?.closest(imageArea) &&
        !interactive(event.target)
      )
        event.preventDefault()
    }

    states.set(element, state)
    element.classList.toggle('selection-mode', options.selectionMode)
    element.addEventListener('click', click)
    element.addEventListener('keydown', keydown)
    element.addEventListener('pointerdown', pointerdown)
    element.addEventListener('contextmenu', contextmenu, true)
  },
  updated(element, binding) {
    const state = states.get(element)
    if (!state) return
    state.options = binding.value
    element.classList.toggle('selection-mode', binding.value.selectionMode)
    if (binding.value.disabled) state.cancel()
  },
  beforeUnmount(element) {
    states.get(element)?.destroy()
    states.delete(element)
  }
}
