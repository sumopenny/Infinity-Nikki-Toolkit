import { observeStoredImageVisibility } from './storedImageVisibility'

/** 共用可见性调度，只暂停动画，不重置进度；返回完整清理函数。 */
export function observeVisibleMotion(element: HTMLElement, property = '--catalog-motion-state') {
  let visible = false
  const update = () =>
    element.style.setProperty(property, visible && !document.hidden ? 'running' : 'paused')
  const stop = observeStoredImageVisibility(element, (value) => {
    visible = value
    update()
  })
  document.addEventListener('visibilitychange', update)
  return () => {
    stop()
    document.removeEventListener('visibilitychange', update)
    element.style.removeProperty(property)
  }
}
