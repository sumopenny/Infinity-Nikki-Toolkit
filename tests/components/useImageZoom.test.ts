import { describe, expect, it } from 'vitest'
import { useImageZoom } from '../../src/composables/useImageZoom'

describe('shared image zoom', () => {
  it('clamps zoom and resets dragged images when returning to fit', () => {
    const view = useImageZoom()
    view.setZoom(500)
    expect(view.zoom.value).toBe(300)
    const stage = { setPointerCapture() {} }
    const target = { closest: () => null }
    view.startDrag({
      target,
      currentTarget: stage,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 10,
      clientY: 20
    } as unknown as PointerEvent)
    view.moveDrag({ pointerType: 'mouse', clientX: 50, clientY: 70 } as PointerEvent)
    expect(view.imageTransform.value.transform).toContain('40px, 50px')
    view.setZoom(100)
    expect(view.imageTransform.value.transform).toContain('0px, 0px')
    view.setZoom(0)
    expect(view.zoom.value).toBe(50)
    view.resetTransform()
    expect(view.zoom.value).toBe(100)
  })
  it('ignores wheel zoom while preview is unavailable', () => {
    let ready = false
    const view = useImageZoom(() => ready)
    const event = { deltaY: -1, preventDefault() {} } as WheelEvent
    view.handleWheel(event)
    expect(view.zoom.value).toBe(100)
    ready = true
    view.handleWheel(event)
    expect(view.zoom.value).toBe(125)
  })
})
