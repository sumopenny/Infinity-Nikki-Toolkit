import { annotateDiagnosticError, trackDiagnostic } from '../utils/errorReporting/errorReporter'
import { computed, getCurrentInstance, inject, ref, watch, type InjectionKey } from 'vue'
import type { ActiveOperation } from './useOperationNotice'

/** 操作记录独立于组件作用域；卸载不释放仍在执行的读写，只有任务收尾可以释放。 */
export function createOperationCoordinator() {
  const activeOperation = ref<ActiveOperation | null>(null)
  const pending = ref(new Set<symbol>())
  const isBusy = computed(() => activeOperation.value !== null || pending.value.size > 0)
  async function run<T>(module: string, action: () => Promise<T>): Promise<T> {
    const token = Symbol(module)
    pending.value.add(token)
    trackDiagnostic('operation', 'begin', { module })
    try {
      const result = await action()
      trackDiagnostic('operation', 'settled', { module })
      return result
    } catch (error) {
      throw annotateDiagnosticError(error, {
        module,
        context: { operation: action.name || 'module-operation' }
      })
    } finally {
      pending.value.delete(token)
    }
  }
  const hasPending = computed(() => pending.value.size > 0)
  /** 迁移前等待独立模块写入完成，避免导入与迁移同时修改存档。 */
  function waitForPending(): Promise<void> {
    if (!hasPending.value) return Promise.resolve()
    return new Promise((resolve) => {
      const stop = watch(
        hasPending,
        (busy) => {
          if (!busy) {
            stop()
            resolve()
          }
        },
        { flush: 'sync' }
      )
    })
  }
  return { activeOperation, isBusy, hasPending, waitForPending, run }
}
export type OperationCoordinator = ReturnType<typeof createOperationCoordinator>
export const operationCoordinatorKey: InjectionKey<OperationCoordinator> =
  Symbol('operation-coordinator')

/** 子组件只登记任务，不通过 watch/卸载事件维护父级忙碌标志。 */
export function useModuleOperation(module: string) {
  const coordinator = getCurrentInstance() ? inject(operationCoordinatorKey, null) : null
  return <T>(action: () => Promise<T>): Promise<T> =>
    coordinator ? coordinator.run(module, action) : action()
}
