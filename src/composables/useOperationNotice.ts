import { isDatabaseConnectionLost } from '../utils/file-system/database'
import { reportError } from '../utils/errorReporting/errorReporter'
import { createOperationCoordinator, type OperationCoordinator } from './useOperationCoordinator'
// 操作通知状态机：统一管理操作忙碌状态、提示文案、错误映射和通知生命周期。
import { computed, ref, watch, type ComputedRef } from 'vue'
import type { LocaleMessages, StatusPrefix, StatusSuffix } from '../i18n'
import type { OperationNoticeTone } from '../components/OperationNotice.vue'
import { DirectoryAccessError } from '../utils/file-system/directoryErrors'

export type StatusTone = OperationNoticeTone
export interface OperationNoticeItem {
  id: number
  message: string
  tone: StatusTone
  loading: boolean
  source?: string
  downloadFiles?: File[]
}

export type ActiveOperation =
  | 'loading'
  | 'refreshing'
  | 'deleting'
  | 'trash'
  | 'saving-outfit'
  | 'importing-outfits'
  | 'exporting-outfits'
  | 'importing-photos'
  | 'exporting-photos'
  | 'updating-outfits'
  | 'mutating-outfits'
  | 'cleanup'
  | 'all-data-backup'

export type StatusState =
  | { type: 'initial' }
  | { type: 'reading' }
  | { type: 'restoring' }
  | { type: 'restoreFailed' }
  | { type: 'restorePathFailed' }
  | { type: 'readFailed' }
  | { type: 'cleared' }
  | { type: 'success'; count: number; prefix: StatusPrefix; suffix?: StatusSuffix }
  | {
      type: 'custom'
      message: string
      tone?: StatusTone
      loading?: boolean
      source?: string
      downloadFiles?: File[]
    }

export interface ConfirmableStatus {
  downloadFiles?: File[]
  message: string
  tone?: StatusTone
  loading?: boolean
  source?: string
}

/** 集中管理操作状态、错误映射和顶部通知生命周期，避免页面组件重复维护计时器与 busy 判断。 */
export function useOperationNotice(
  locale: ComputedRef<LocaleMessages>,
  operations: OperationCoordinator = createOperationCoordinator()
) {
  const statusState = ref<StatusState>({ type: 'initial' })
  const activeOperation = operations.activeOperation
  const notices = ref<OperationNoticeItem[]>([])
  const isVisible = computed(() => notices.value.length > 0)
  let nextId = 0
  const timers = new Map<
    number,
    { timer?: number; deadline: number; remaining: number; paused: boolean }
  >()
  const isLoading = computed(() => activeOperation.value === 'loading')
  const isDeleting = computed(() => activeOperation.value === 'deleting')
  const isTrashBusy = computed(() => activeOperation.value === 'trash')
  const isSavingOutfit = computed(() => activeOperation.value === 'saving-outfit')
  const isImportingOutfits = computed(() => activeOperation.value === 'importing-outfits')
  const isExportingOutfits = computed(() => activeOperation.value === 'exporting-outfits')
  const isImportingPhotos = computed(() => activeOperation.value === 'importing-photos')
  const isExportingPhotos = computed(() => activeOperation.value === 'exporting-photos')
  const isAnyFileOperationBusy = operations.isBusy

  const statusMessage = computed(() => {
    const app = locale.value.app
    const state = statusState.value
    switch (state.type) {
      case 'reading':
        return app.readingStatus
      case 'restoring':
        return app.restoringStatus
      case 'restoreFailed':
        return app.restoreFailedStatus
      case 'restorePathFailed':
        return app.restorePathFailedStatus
      case 'readFailed':
        return app.readFailedStatus
      case 'cleared':
        return app.clearedStatus
      case 'success':
        return `${app.successStatus(state.count, state.prefix)}${state.suffix ? app.successSuffix(state.suffix) : ''}`
      case 'custom':
        return state.message
      default:
        return app.initialStatus
    }
  })

  const statusTone = computed<StatusTone>(() => {
    const state = statusState.value
    if (
      state.type === 'restoreFailed' ||
      state.type === 'restorePathFailed' ||
      state.type === 'readFailed'
    )
      return 'error'
    if (state.type === 'success' || state.type === 'cleared') return 'success'
    if (state.type === 'custom') return state.tone ?? 'info'
    return 'info'
  })

  const isStatusLoading = computed(() => {
    const state = statusState.value
    return (
      state.type === 'reading' ||
      state.type === 'restoring' ||
      (state.type === 'custom' && Boolean(state.loading))
    )
  })

  const closeNotice = (id = notices.value.at(-1)?.id) => {
    if (id === undefined) return
    const clock = timers.get(id)
    if (clock?.timer !== undefined) window.clearTimeout(clock.timer)
    timers.delete(id)
    notices.value = notices.value.filter((notice) => notice.id !== id)
  }
  const dispose = () => {
    for (const notice of [...notices.value]) closeNotice(notice.id)
  }
  const hideAfter = (id: number, duration: number) => {
    const clock = timers.get(id)
    if (!clock) return
    clock.remaining = duration
    clock.deadline = Date.now() + duration
    clock.timer = window.setTimeout(() => closeNotice(id), duration)
  }
  const showNotice = (options: { loading?: boolean; duration?: number } = {}) => {
    const state = statusState.value
    const source = state.type === 'custom' ? state.source : undefined
    // A completed operation retires its own loading notice while leaving other results intact.
    for (const notice of [...notices.value]) {
      if (notice.loading && notice.source === source) closeNotice(notice.id)
    }
    const downloadFiles =
      state.type === 'custom' && !options.loading ? (state.downloadFiles ?? []) : []
    if (downloadFiles.length) {
      for (const notice of [...notices.value]) {
        if (notice.downloadFiles?.length && notice.source === source) closeNotice(notice.id)
      }
    }
    const id = ++nextId
    notices.value.push({
      id,
      message: statusMessage.value,
      tone: statusTone.value,
      loading: !!options.loading,
      ...(downloadFiles.length ? { downloadFiles } : {}),
      source
    })
    // Only the notice owns the retained files, so closing it can release them.
    if (state.type === 'custom') state.downloadFiles = undefined
    timers.set(id, { deadline: 0, remaining: 0, paused: false })
    if (!options.loading && options.duration !== undefined)
      hideAfter(id, downloadFiles.length ? 6000 : options.duration)
  }
  /** 更新同一条顶部进度通知，不随每张照片产生新通知；结束时仅移除该任务通知。 */
  const updateLoadingNotice = (source: string, message: string | null) => {
    const existing = notices.value.find((notice) => notice.source === source && notice.loading)
    if (!message) {
      if (existing) closeNotice(existing.id)
      return
    }
    if (existing) {
      if (existing.message !== message) existing.message = message
      return
    }
    notices.value.push({ id: ++nextId, message, tone: 'info', loading: true, source })
  }
  const pauseNotice = (id = notices.value.at(-1)?.id) => {
    const notice = notices.value.find((notice) => notice.id === id)
    const clock = id === undefined ? undefined : timers.get(id)
    if (!notice || notice.loading || !clock || clock.paused || clock.timer === undefined) return
    clock.remaining = Math.max(0, clock.deadline - Date.now())
    window.clearTimeout(clock.timer)
    clock.timer = undefined
    clock.paused = true
  }
  const resumeNotice = (id = notices.value.at(-1)?.id) => {
    if (id === undefined) return
    const clock = timers.get(id)
    if (!clock?.paused) return
    clock.paused = false
    hideAfter(id, clock.remaining)
  }
  const showStatus = ({
    message,
    tone = 'success',
    loading = false,
    source,
    downloadFiles
  }: ConfirmableStatus) => {
    if (
      !downloadFiles?.length &&
      notices.value.some(
        (notice) =>
          notice.message === message &&
          notice.tone === tone &&
          notice.loading === loading &&
          notice.source === source
      )
    )
      return
    statusState.value = { type: 'custom', message, tone, loading, source, downloadFiles }
  }
  const clearStatus = (source?: string) => {
    if (!source) {
      statusState.value = { type: 'initial' }
      return
    }
    for (const notice of [...notices.value]) {
      if (notice.source === source) closeNotice(notice.id)
    }
  }

  const isUserCancelledFilePicker = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false
    return error.name === 'AbortError' || error.message === locale.value.fileSystem.abortSelection
  }

  const createErrorStatus = (error: unknown, fallback: StatusState): StatusState => {
    if (error instanceof DirectoryAccessError && error.code === 'cancelled') {
      return { type: 'custom', message: locale.value.fileSystem.abortSelection, tone: 'info' }
    }
    if (isUserCancelledFilePicker(error))
      return { type: 'custom', message: locale.value.fileSystem.abortSelection, tone: 'info' }
    reportError(error, { action: activeOperation.value ?? fallback.type })
    if (isDatabaseConnectionLost(error))
      return { type: 'custom', message: locale.value.app.databaseDisconnected, tone: 'error' }
    if (!(error instanceof Error)) return fallback
    return { type: 'custom', message: error.message, tone: 'error' }
  }

  watch(
    statusState,
    (nextStatus) => {
      if (nextStatus.type === 'initial') {
        dispose()
        return
      }
      const duration =
        statusTone.value === 'error' || statusTone.value === 'warning'
          ? 6000
          : statusTone.value === 'success'
            ? 3000
            : 5200
      showNotice({ loading: isStatusLoading.value, duration })
    },
    { flush: 'sync' }
  )

  return {
    notices,
    statusState,
    statusMessage,
    statusTone,
    isStatusLoading,
    activeOperation,
    isLoading,
    isDeleting,
    isTrashBusy,
    isSavingOutfit,
    isImportingOutfits,
    isExportingOutfits,
    isImportingPhotos,
    isExportingPhotos,
    isAnyFileOperationBusy,
    isVisible,
    showStatus,
    updateLoadingNotice,
    clearStatus,
    showNotice,
    closeNotice,
    pauseNotice,
    resumeNotice,
    createErrorStatus,
    isUserCancelledFilePicker,
    dispose
  }
}
