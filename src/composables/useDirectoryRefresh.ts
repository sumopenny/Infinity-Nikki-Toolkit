import { ref, onBeforeUnmount, type Ref, type ComputedRef } from 'vue'
import type { LocaleMessages } from '../i18n'
import type { PhotoItem } from '../utils/photoGrouping'
import { refreshAlbumPhotos, type RefreshAlbumResult } from '../utils/file-system/albumFileSystem'
import { listRecentlyDeleted } from '../utils/file-system/trashFileSystem'
import type { ActiveOperation, StatusState, useOperationNotice } from './useOperationNotice'
interface DirectoryRefreshOptions {
  directory: () => FileSystemDirectoryHandle | null
  photos: () => PhotoItem[]
  blocked: () => boolean
  editorOpen: () => boolean
  refreshingMessage: () => string
  locale: ComputedRef<LocaleMessages>
  activeOperation: Ref<ActiveOperation | null>
  statusState: Ref<StatusState>
  apply: (result: RefreshAlbumResult) => void
  migrate: (directory: FileSystemDirectoryHandle) => Promise<StatusState | null>
  refreshCollections: () => Promise<void>
  createErrorStatus: ReturnType<typeof useOperationNotice>['createErrorStatus']
}
/** Owns refresh generations and focus scheduling; collection state stays with its owner. */
export function useDirectoryRefresh(options: DirectoryRefreshOptions) {
  const { locale, activeOperation, statusState } = options
  let focusRefreshTimer: number | undefined
  let focusRefreshGeneration = 0
  let latestRefreshToken = 0
  const suppressNextFocusRefresh = ref(false)
  function invalidatePendingRefreshes() {
    latestRefreshToken++
    focusRefreshGeneration++
    window.clearTimeout(focusRefreshTimer)
    focusRefreshTimer = undefined
  }
  async function refreshAlbum(manual: boolean) {
    const directoryHandle = options.directory()
    if (!directoryHandle || options.blocked()) return
    const refreshToken = ++latestRefreshToken
    activeOperation.value = 'refreshing'
    if (manual) {
      statusState.value = {
        type: 'custom',
        message: options.refreshingMessage(),
        tone: 'info',
        loading: true
      }
    }
    try {
      const albumResult = await refreshAlbumPhotos(directoryHandle, options.photos(), {
        requestPermission: manual, messages: locale.value.fileSystem
      })
      const trashResult = await listRecentlyDeleted(directoryHandle, albumResult.notes?.metadata.photos)
      if (refreshToken !== latestRefreshToken || directoryHandle !== options.directory()) return
      const result: RefreshAlbumResult = { ...albumResult, recentlyDeleted: trashResult }
      options.apply(result)
      const migrationStatus = await options.migrate(directoryHandle)
      if (refreshToken !== latestRefreshToken || directoryHandle !== options.directory()) return
      const refreshStatus = migrationStatus ?? createRefreshResultStatus(result, manual)
      if (refreshStatus) statusState.value = refreshStatus
    } catch (error) {
      if (refreshToken !== latestRefreshToken || directoryHandle !== options.directory()) return
      statusState.value = options.createErrorStatus(error, { type: 'readFailed' })
    } finally {
      if (activeOperation.value === 'refreshing') activeOperation.value = null
    }
  }

  function createRefreshResultStatus(
    album: RefreshAlbumResult,
    manual: boolean
  ): StatusState | null {
    if (album.addedCount || album.removedCount)
      return {
        type: 'custom',
        message: locale.value.trash.refreshStatus(album.addedCount, album.removedCount),
        tone: 'success'
      }
    if (!manual) return null
    return { type: 'custom', message: locale.value.trash.upToDate, tone: 'success' }
  }

  async function refreshAfterFocus() {
    if (options.blocked()) return
    if (options.directory()) await refreshAlbum(false)
    await options.refreshCollections()
  }

  /** 合并窗口聚焦和页面可见事件后执行自动刷新。参数：无。 */
  function scheduleFocusRefresh() {
    const generation = ++focusRefreshGeneration
    if (suppressNextFocusRefresh.value) {
      suppressNextFocusRefresh.value = false
      return
    }
    if (document.visibilityState === 'hidden' || options.editorOpen()) return
    if (focusRefreshTimer !== undefined) window.clearTimeout(focusRefreshTimer)
    focusRefreshTimer = window.setTimeout(() => {
      focusRefreshTimer = undefined
      if (generation !== focusRefreshGeneration) return
      void refreshAfterFocus()
    }, 400)
  }

  onBeforeUnmount(invalidatePendingRefreshes)
  return {
    refreshAlbum,
    scheduleFocusRefresh,
    invalidatePendingRefreshes,
    suppressNextFocusRefresh
  }
}
