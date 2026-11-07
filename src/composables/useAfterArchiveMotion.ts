import { inject, onBeforeUnmount, onMounted, type InjectionKey, type Ref } from 'vue'

// Shared with the toolbar's 220ms transition + 40ms exit delay, plus a paint margin.
export const archiveMotionDeadlineKey: InjectionKey<Ref<number>> = Symbol('archive-motion-deadline')
export const archiveMotionLoadDelay = 280

/** Keep first-load parsing and rendering out of the mobile toolbar transition. */
export function useAfterArchiveMotion(load: () => unknown) {
  const deadline = inject(archiveMotionDeadlineKey, undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  onMounted(() => {
    const remaining = Math.max(0, (deadline?.value ?? 0) - Date.now())
    if (!remaining) {
      void load()
      return
    }
    timer = setTimeout(() => {
      timer = undefined
      if (!disposed) void load()
    }, remaining)
  })
  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(timer)
  })
}
