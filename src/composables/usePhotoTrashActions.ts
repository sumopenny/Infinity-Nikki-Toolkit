import { isDirectoryPhoto } from '../utils/photoGrouping'
import { reportPartialFailure } from '../utils/errorReporting/errorReporter'
import type { Ref, ComputedRef } from 'vue'
import type { LocaleMessages } from '../i18n'
import type { PhotoItem, PhotoDisplayItem, RecentlyDeletedPhoto } from '../utils/photoGrouping'
import {
  clearRecentlyDeleted,
  movePhotosToRecentlyDeleted,
  permanentlyDeleteRecentlyDeleted,
  restoreRecentlyDeletedPhotos
} from '../utils/file-system/trashFileSystem'
import { releasePhotoUrl } from '../utils/file-system/photoUrl'
import type { ActiveOperation, StatusState, useOperationNotice } from './useOperationNotice'
import type { useConfirmDialog } from './useConfirmDialog'

interface PhotoTrashActionsOptions {
  albumDirectoryHandle: Ref<FileSystemDirectoryHandle | null>
  photos: Ref<PhotoItem[]>
  recentlyDeleted: Ref<RecentlyDeletedPhoto[]>
  selectedIds: Ref<Set<string>>
  trashSelectedIds: Ref<Set<string>>
  favoriteIds: Ref<Set<string>>
  currentPreview: Ref<PhotoDisplayItem | null>
  currentPreviewIndex: ComputedRef<number>
  visiblePhotos: ComputedRef<PhotoItem[]>
  locale: ComputedRef<LocaleMessages>
  activeOperation: Ref<ActiveOperation | null>
  isAnyFileOperationBusy: ComputedRef<boolean>
  statusState: Ref<StatusState>
  createErrorStatus: ReturnType<typeof useOperationNotice>['createErrorStatus']
  openConfirmDialog: ReturnType<typeof useConfirmDialog>['openConfirmDialog']
}
/** 回收站命令统一维护照片、选中、收藏与预览的一致性；共享 ref 沿用页面实例，不复制数据。 */
export function usePhotoTrashActions(options: PhotoTrashActionsOptions) {
  const {
    albumDirectoryHandle,
    photos,
    recentlyDeleted,
    selectedIds,
    trashSelectedIds,
    favoriteIds,
    currentPreview,
    currentPreviewIndex,
    visiblePhotos,
    locale,
    activeOperation,
    isAnyFileOperationBusy,
    statusState,
    createErrorStatus,
    openConfirmDialog
  } = options
  /**
   * 合并最近删除扫描结果，复用未变化照片已加载的对象地址。
   * 参数：nextPhotos 为最新扫描结果。
   */
  function mergeRecentlyDeleted(nextPhotos: RecentlyDeletedPhoto[]) {
    const currentByName = new Map(recentlyDeleted.value.map((photo) => [photo.trashName, photo]))
    const nextNames = new Set(nextPhotos.map((photo) => photo.trashName))
    for (const photo of recentlyDeleted.value) {
      if (!nextNames.has(photo.trashName)) releasePhotoUrl(photo)
    }
    recentlyDeleted.value = nextPhotos.map((photo) => {
      const existing = currentByName.get(photo.trashName)
      if (!existing) return photo
      existing.note = photo.note
      existing.noteKey = photo.noteKey
      existing.lastModified = photo.lastModified
      existing.size = photo.size
      existing.fileSizeText = photo.fileSizeText
      return existing
    })
    const validIds = new Set(recentlyDeleted.value.map((photo) => photo.id))
    trashSelectedIds.value = new Set([...trashSelectedIds.value].filter((id) => validIds.has(id)))
  }

  /** 应用照片移入最近删除后的页面状态，供普通删除和导出后移动共用。 */
  function applyMovedPhotosResult(
    result: Awaited<ReturnType<typeof movePhotosToRecentlyDeleted>>,
    keepPreviewOpen = false,
    previewIndex = -1
  ) {
    const movedIds = new Set(result.succeeded.map((photo) => photo.id))
    photos.value = photos.value.filter((photo) => !movedIds.has(photo.id))
    selectedIds.value = new Set([...selectedIds.value].filter((id) => !movedIds.has(id)))
    favoriteIds.value = new Set([...favoriteIds.value].filter((id) => !movedIds.has(id)))
    mergeRecentlyDeleted(
      [...recentlyDeleted.value, ...result.movedPhotos].sort((a, b) => b.deletedAt - a.deletedAt)
    )
    if (currentPreview.value && movedIds.has(currentPreview.value.id)) {
      currentPreview.value = keepPreviewOpen
        ? (visiblePhotos.value[
            Math.min(Math.max(previewIndex, 0), visiblePhotos.value.length - 1)
          ] ?? null)
        : null
    }
  }

  /**
   * 将普通照片移动到最近删除。
   * 参数：targets 为目标照片，keepPreviewOpen 表示删除预览图后是否继续预览相邻照片。
   */
  async function movePhotosToTrash(targets: PhotoItem[], keepPreviewOpen = false) {
    if (
      !albumDirectoryHandle.value ||
      !targets.length ||
      targets.some((photo) => !isDirectoryPhoto(photo)) ||
      isAnyFileOperationBusy.value
    )
      return
    const confirmed = await openConfirmDialog({
      title: locale.value.trash.moveDialogTitle,
      message: locale.value.trash.confirmMove(targets.length),
      tone: 'warning',
      confirmLabel: locale.value.app.dialogConfirm,
      cancelLabel: locale.value.app.dialogCancel
    })
    if (!confirmed) return

    activeOperation.value = 'deleting'
    statusState.value = {
      type: 'custom',
      message: locale.value.app.movingPhotosToTrash,
      tone: 'info',
      loading: true
    }
    const previewIndex = currentPreviewIndex.value
    try {
      const result = await movePhotosToRecentlyDeleted(targets, favoriteIds.value)
      applyMovedPhotosResult(result, keepPreviewOpen, previewIndex)
      statusState.value = {
        type: 'custom',
        message: locale.value.trash.movedStatus(result.succeeded.length, result.failedNames),
        tone: result.failedNames.length ? 'warning' : 'success'
      }
      reportPartialFailure(
        'album-trash',
        activeOperation.value ?? 'operation',
        result.failedNames.length,
        { succeededCount: result.succeeded.length }
      )
    } catch (error) {
      statusState.value = createErrorStatus(error, { type: 'readFailed' })
    } finally {
      if (activeOperation.value === 'deleting') activeOperation.value = null
    }
  }

  /**
   * 恢复最近删除照片。
   * 参数：targets 为待恢复的回收照片，keepPreviewOpen 表示是否继续预览相邻回收照片。
   */
  async function restoreTrashPhotos(targets: RecentlyDeletedPhoto[], keepPreviewOpen = false) {
    const directoryHandle = albumDirectoryHandle.value
    if (!directoryHandle || !targets.length || isAnyFileOperationBusy.value) return
    activeOperation.value = 'trash'
    statusState.value = {
      type: 'custom',
      message: locale.value.app.restoringPhotos,
      tone: 'info',
      loading: true
    }
    const previewIndex = currentPreviewIndex.value
    try {
      const result = await restoreRecentlyDeletedPhotos(targets, directoryHandle)
      const restoredTrashIds = new Set(result.succeeded.map((photo) => photo.id))
      recentlyDeleted.value = recentlyDeleted.value.filter(
        (photo) => !restoredTrashIds.has(photo.id)
      )
      trashSelectedIds.value = new Set(
        [...trashSelectedIds.value].filter((id) => !restoredTrashIds.has(id))
      )
      photos.value = [...photos.value, ...result.restoredPhotos].sort(
        (a, b) => b.timestamp - a.timestamp
      )
      result.succeeded.forEach((source, index) => {
        const restored = result.restoredPhotos[index]
        if (source.wasFavorite && restored)
          favoriteIds.value = new Set([...favoriteIds.value, restored.id])
      })
      if (currentPreview.value && restoredTrashIds.has(currentPreview.value.id)) {
        currentPreview.value = keepPreviewOpen
          ? (recentlyDeleted.value[Math.min(previewIndex, recentlyDeleted.value.length - 1)] ??
            null)
          : null
      }
      statusState.value = {
        type: 'custom',
        message: locale.value.trash.restoredStatus(result.succeeded.length, result.failedNames),
        tone: result.failedNames.length ? 'warning' : 'success'
      }
      reportPartialFailure(
        'album-trash',
        activeOperation.value ?? 'operation',
        result.failedNames.length,
        { succeededCount: result.succeeded.length }
      )
    } catch (error) {
      statusState.value = createErrorStatus(error, { type: 'readFailed' })
    } finally {
      if (activeOperation.value === 'trash') activeOperation.value = null
    }
  }

  /**
   * 永久删除最近删除照片并显示不可恢复影响范围。
   * 参数：targets 为待删除照片，options 控制是否继续预览相邻照片及是否已在调用方完成确认。
   */
  async function permanentlyDeleteTrashPhotos(
    targets: RecentlyDeletedPhoto[],
    options: {
      keepPreviewOpen?: boolean
      skipConfirmation?: boolean
      clearDirectory?: boolean
    } = {}
  ) {
    if (
      !albumDirectoryHandle.value ||
      !targets.length ||
      targets.some((photo) => !isDirectoryPhoto(photo)) ||
      isAnyFileOperationBusy.value
    )
      return
    if (!options.skipConfirmation) {
      const confirmed = await openConfirmDialog({
        title: locale.value.trash.permanentDeleteDialogTitle,
        message: locale.value.trash.confirmPermanentDelete(targets.length),
        tone: 'danger',
        confirmLabel: locale.value.app.dialogConfirm,
        cancelLabel: locale.value.app.dialogCancel
      })
      if (!confirmed) return
    }

    activeOperation.value = 'trash'
    statusState.value = {
      type: 'custom',
      message: locale.value.app.permanentlyDeletingPhotos,
      tone: 'info',
      loading: true
    }
    const previewIndex = currentPreviewIndex.value
    const keepPreviewOpen = options.keepPreviewOpen ?? false
    try {
      const result =
        options.clearDirectory && albumDirectoryHandle.value
          ? await clearRecentlyDeleted(albumDirectoryHandle.value, targets)
          : await permanentlyDeleteRecentlyDeleted(targets)
      const deletedIds = new Set(result.succeeded.map((photo) => photo.id))
      recentlyDeleted.value = recentlyDeleted.value.filter((photo) => !deletedIds.has(photo.id))
      trashSelectedIds.value = new Set(
        [...trashSelectedIds.value].filter((id) => !deletedIds.has(id))
      )
      if (currentPreview.value && deletedIds.has(currentPreview.value.id)) {
        currentPreview.value = keepPreviewOpen
          ? (recentlyDeleted.value[Math.min(previewIndex, recentlyDeleted.value.length - 1)] ??
            null)
          : null
      }
      statusState.value = {
        type: 'custom',
        message: locale.value.trash.permanentlyDeletedStatus(
          result.succeeded.length,
          result.failedNames
        ),
        tone: result.failedNames.length ? 'warning' : 'success'
      }
      reportPartialFailure(
        'album-trash',
        activeOperation.value ?? 'operation',
        result.failedNames.length,
        { succeededCount: result.succeeded.length }
      )
    } catch (error) {
      statusState.value = createErrorStatus(error, { type: 'readFailed' })
    } finally {
      if (activeOperation.value === 'trash') activeOperation.value = null
    }
  }

  /** 一键清空全部最近删除。参数：无。 */
  async function deleteAllTrash() {
    if (!recentlyDeleted.value.length) return
    const confirmed = await openConfirmDialog({
      title: locale.value.trash.permanentDeleteDialogTitle,
      message: locale.value.trash.confirmDeleteAll(recentlyDeleted.value.length),
      tone: 'danger',
      confirmLabel: locale.value.app.dialogConfirm,
      cancelLabel: locale.value.app.dialogCancel
    })
    if (!confirmed) return
    await permanentlyDeleteTrashPhotos([...recentlyDeleted.value], {
      skipConfirmation: true,
      clearDirectory: true
    })
  }

  return {
    mergeRecentlyDeleted,
    applyMovedPhotosResult,
    movePhotosToTrash,
    restoreTrashPhotos,
    permanentlyDeleteTrashPhotos,
    deleteAllTrash
  }
}
