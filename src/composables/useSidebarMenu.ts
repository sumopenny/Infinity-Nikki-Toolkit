import { ref, watch, type CSSProperties, type Ref } from 'vue'

/** 共用侧栏菜单定位：浮层移出滚动容器，空间不足时向上展开，外层滚动时收起。 */
export function useSidebarMenu(
  close: () => void,
  getMenu: () => HTMLElement | null,
  active: Readonly<Ref<boolean>> = ref(true)
) {
  const menuStyle = ref<CSSProperties>({})
  function positionMenu(
    trigger: HTMLElement,
    options?: { minWidth: number; viewportPadding: number; gap: number; zIndex: number }
  ) {
    const box = trigger.getBoundingClientRect()
    const viewport = options ? window.visualViewport : undefined
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)
    const gap = options?.gap ?? 10
    const below = Math.max(0, viewportBottom - box.bottom - gap)
    const above = Math.max(0, box.top - viewportTop - gap)
    const padding = options?.viewportPadding ?? 0
    const width = options
      ? Math.min(Math.max(box.width, options.minWidth), window.innerWidth - padding * 2)
      : box.width
    const upward = below < 180 && above > below
    menuStyle.value = {
      position: 'fixed',
      left:
        (options
          ? Math.max(padding, Math.min(box.left, window.innerWidth - width - padding))
          : box.left) + 'px',
      right: 'auto',
      width: width + 'px',
      boxSizing: 'border-box',
      zIndex: options?.zIndex ?? '100',
      top: upward ? 'auto' : box.bottom + 6 + 'px',
      bottom: upward ? window.innerHeight - box.top + 6 + 'px' : 'auto',
      maxHeight: Math.max(options ? 0 : 40, Math.min(320, upward ? above : below)) + 'px'
    }
  }
  function onViewportChange(event: Event) {
    if (event.target instanceof Node && getMenu()?.contains(event.target)) return
    close()
  }
  watch(
    active,
    (enabled, _, onCleanup) => {
      if (!enabled) return
      window.addEventListener('scroll', onViewportChange, true)
      window.addEventListener('resize', onViewportChange)
      onCleanup(() => {
        window.removeEventListener('scroll', onViewportChange, true)
        window.removeEventListener('resize', onViewportChange)
      })
    },
    { immediate: true, flush: 'sync' }
  )
  return { menuStyle, positionMenu }
}
