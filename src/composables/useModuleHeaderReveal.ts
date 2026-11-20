import { provide, shallowReactive, shallowRef, type InjectionKey } from 'vue'

interface HeaderPlacement {
  height: number
  width: number
  offset: number
  order: number
}

/** 登记当前模块的头部区域。展开时移动原控件，保留筛选状态、事件和文件输入。 */
export function provideModuleHeaderReveal() {
  const state = createHeaderState()
  provide(moduleHeaderRevealKey, state)
  return state
}

export const moduleHeaderRevealKey: InjectionKey<ReturnType<typeof createHeaderState>> =
  Symbol('moduleHeaderReveal')

function createHeaderState() {
  return {
    anchors: shallowReactive(new Map<HTMLElement, HTMLElement>()),
    placements: shallowRef(new Map<HTMLElement, HeaderPlacement>()),
    target: shallowRef<HTMLElement | null>(null)
  }
}
