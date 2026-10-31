import { computed, ref } from 'vue'
export const MIN_ZOOM = 50
export const MAX_ZOOM = 300
export const ZOOM_STEP = 25

export function useImageZoom(
  enabled: () => boolean = () => true,
  onSwipe?: (direction: 'next' | 'previous') => void,
  maxZoom = MAX_ZOOM
) {
  const zoom = ref(100)
  const pan = ref({ x: 0, y: 0 })
  const dragging = ref(false)
  const dragOrigin = ref({ x: 0, y: 0 })
  type TouchPoint = { x: number; y: number }
  const touchPoints = new Map<number, TouchPoint>()
  let touchStart: (TouchPoint & { time: number }) | null = null
  let hadPinch = false
  let pinch: {
    distance: number
    center: TouchPoint
    zoom: number
    pan: TouchPoint
    stageCenter: TouchPoint
  } | null = null
  const imageTransform = computed(() => ({
    transform: `translate3d(${pan.value.x}px, ${pan.value.y}px, 0) scale(${zoom.value / 100})`,
    cursor: zoom.value > 100 ? (dragging.value ? 'grabbing' : 'grab') : 'default'
  }))
  /** 重置缩放与拖动状态。参数：无。 */
  function resetTransform() {
    zoom.value = 100
    pan.value = { x: 0, y: 0 }
    dragging.value = false
    touchPoints.clear()
    touchStart = null
    pinch = null
  }

  /** 更新缩放比例并在回到 100% 时复位位移。参数：nextZoom 为目标百分比。 */
  function setZoom(nextZoom: number) {
    zoom.value = Math.max(MIN_ZOOM, Math.min(Math.round(nextZoom), maxZoom))
    if (zoom.value <= 100) pan.value = { x: 0, y: 0 }
  }

  /** 使用滚轮按固定步长缩放。参数：event 为滚轮事件。 */
  function handleWheel(event: WheelEvent) {
    if (!enabled()) return
    event.preventDefault()
    setZoom(zoom.value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
  }

  /** 记录双指中心和距离，使缩放围绕手指位置而不是图片中心跳动。 */
  function beginPinch(stage: HTMLElement) {
    const [first, second] = [...touchPoints.values()]
    if (!first || !second) return
    const rect = stage.getBoundingClientRect()
    pinch = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      zoom: zoom.value,
      pan: { ...pan.value },
      stageCenter: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    }
    hadPinch = true
  }

  /** 鼠标保留放大后拖动；触屏同时支持单指翻页、双指缩放和放大后平移。 */
  function startDrag(event: PointerEvent) {
    if (!enabled() || (event.target as Element).closest('button')) return
    if (event.pointerType === 'touch') {
      if (!touchPoints.size) {
        touchStart = { x: event.clientX, y: event.clientY, time: Date.now() }
        hadPinch = false
      }
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touchPoints.size === 2) beginPinch(event.currentTarget as HTMLElement)
    } else if (zoom.value <= 100) return
    dragging.value = zoom.value > 100
    dragOrigin.value = { x: event.clientX - pan.value.x, y: event.clientY - pan.value.y }
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }

  function moveDrag(event: PointerEvent) {
    if (event.pointerType === 'touch' && touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touchPoints.size >= 2 && pinch) {
        const [first, second] = [...touchPoints.values()]
        const center = { x: (first!.x + second!.x) / 2, y: (first!.y + second!.y) / 2 }
        setZoom(
          (pinch.zoom * Math.hypot(second!.x - first!.x, second!.y - first!.y)) / pinch.distance
        )
        const ratio = zoom.value / pinch.zoom
        if (zoom.value > 100)
          pan.value = {
            x:
              center.x -
              pinch.stageCenter.x -
              (pinch.center.x - pinch.stageCenter.x - pinch.pan.x) * ratio,
            y:
              center.y -
              pinch.stageCenter.y -
              (pinch.center.y - pinch.stageCenter.y - pinch.pan.y) * ratio
          }
        return
      }
    }
    if (dragging.value)
      pan.value = { x: event.clientX - dragOrigin.value.x, y: event.clientY - dragOrigin.value.y }
  }

  function endDrag(event: PointerEvent) {
    touchPoints.delete(event.pointerId)
    pinch = null
    const remaining = [...touchPoints.values()][0]
    if (remaining) {
      if (touchPoints.size >= 2) beginPinch(event.currentTarget as HTMLElement)
      dragging.value = zoom.value > 100
      dragOrigin.value = { x: remaining.x - pan.value.x, y: remaining.y - pan.value.y }
      return
    }
    // 只有没有经历双指缩放的短水平手势可以翻页，取消事件永远不翻页。
    if (
      event.type !== 'pointercancel' &&
      touchStart &&
      !hadPinch &&
      zoom.value <= 100 &&
      Date.now() - touchStart.time < 700
    ) {
      const dx = event.clientX - touchStart.x,
        dy = event.clientY - touchStart.y
      if (Math.abs(dx) >= 60 && Math.abs(dy) < Math.abs(dx) / 2) {
        if (dx < 0) onSwipe?.('next')
        if (dx > 0) onSwipe?.('previous')
      }
    }
    touchStart = null
    dragging.value = false
  }

  return {
    zoom,
    imageTransform,
    resetTransform,
    setZoom,
    handleWheel,
    startDrag,
    moveDrag,
    endDrag
  }
}
