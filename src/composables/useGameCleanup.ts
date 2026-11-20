import { ref, onBeforeUnmount, type Ref, type ComputedRef } from 'vue'
import type { Language, LocaleMessages } from '../i18n'
import type { PhotoItem } from '../utils/photoGrouping'
import type { ActiveOperation, StatusState, useOperationNotice } from './useOperationNotice'
import type { useConfirmDialog } from './useConfirmDialog'
import { readLocalStorage, writeLocalStorage, removeLocalStorage } from '../utils/localStorage'
import { formatFileSize } from '../utils/file-system/albumFileSystem'
import { getSavedX6GameDirectoryHandle } from '../utils/file-system/directoryStorage'
import {
  getX6GameDirectoryForAlbum,
  listGamePlayPhotoAccounts,
  pickStandaloneX6GameDirectory,
  resolveX6GameAccountDirectory
} from '../utils/file-system/directoryAccess'
import {
  executeMatchingPhotoCleanup,
  executeSpecialCleanup,
  prepareMatchingPhotoCleanup,
  prepareSpecialCleanup,
  type SpecialCleanupItem
} from '../utils/file-system/cleanupFileSystem'
const CLEANUP_ACCOUNT_CHOICE_KEY = 'infinity-nikki-cleanup-account-choice'
function readCleanupAccountChoice(): string | null {
  return readLocalStorage(CLEANUP_ACCOUNT_CHOICE_KEY)
}

function persistCleanupAccountChoice(choice: string | null): void {
  if (choice) writeLocalStorage(CLEANUP_ACCOUNT_CHOICE_KEY, choice)
  else removeLocalStorage(CLEANUP_ACCOUNT_CHOICE_KEY)
}

interface GameCleanupOptions {
  albumDirectoryHandle: Ref<FileSystemDirectoryHandle | null>
  hasX6GameAuthorization: Ref<boolean>
  language: Ref<Language>
  locale: ComputedRef<LocaleMessages>
  activeOperation: Ref<ActiveOperation | null>
  isAnyFileOperationBusy: ComputedRef<boolean>
  publishStatus: (status: StatusState) => void
  createErrorStatus: ReturnType<typeof useOperationNotice>['createErrorStatus']
  openConfirmDialog: ReturnType<typeof useConfirmDialog>['openConfirmDialog']
}
/** 专项清理流程：拥有授权、账号选择与清理状态，复用页面的操作锁和确认入口。 */
export function useGameCleanup(options: GameCleanupOptions) {
  const {
    albumDirectoryHandle,
    hasX6GameAuthorization,
    language,
    locale,
    activeOperation,
    isAnyFileOperationBusy,
    publishStatus,
    createErrorStatus,
    openConfirmDialog
  } = options
  const showCleanupDialog = ref(false)
  const cleanupX6GameHandle = ref<FileSystemDirectoryHandle | null>(null)
  const cleaningItem = ref<SpecialCleanupItem | null>(null)
  const showCleanupAccountDialog = ref(false)
  const cleanupAccounts = ref<string[]>([])
  const cleanupRememberedChoice = ref<string | null>(null)
  const cleanupAccountResolver = ref<((accountIds: string[] | null) => void) | null>(null)

  // 专项清理
  async function openCleanupDialog() {
    showCleanupDialog.value = true
    if (cleanupX6GameHandle.value) return
    const savedHandle = await getSavedX6GameDirectoryHandle()
    if (!savedHandle || savedHandle.name !== 'X6Game') return
    try {
      const permission = savedHandle.queryPermission
        ? await savedHandle.queryPermission({ mode: 'readwrite' })
        : 'granted'
      if (permission === 'granted') {
        cleanupX6GameHandle.value = savedHandle
        hasX6GameAuthorization.value = true
      }
    } catch {
      /* 静默恢复失败时由用户手动授权 */
    }
  }
  async function authorizeCleanupFolder() {
    if (isAnyFileOperationBusy.value) return
    let didCancelDirectoryPrompt = false
    const alreadyAuthorized = Boolean(cleanupX6GameHandle.value || hasX6GameAuthorization.value)
    try {
      const handle = await pickStandaloneX6GameDirectory(locale.value.fileSystem, {
        forcePick: true,
        beforeRequestX6GamePermission: async () => {
          if (alreadyAuthorized) return true
          const confirmed = await openConfirmDialog({
            title: locale.value.app.x6GameDirectoryDialogTitle,
            message: locale.value.fileSystem.restoreX6GamePermissionPrompt,
            tone: 'info',
            confirmLabel: locale.value.app.dialogContinueAuthorization,
            cancelLabel: locale.value.app.dialogCancel
          })
          didCancelDirectoryPrompt = !confirmed
          return confirmed
        },
        beforePickX6GameDirectory: async () => {
          if (alreadyAuthorized) return true
          const confirmed = await openConfirmDialog({
            title: locale.value.app.x6GameDirectoryDialogTitle,
            message: locale.value.fileSystem.selectX6GameDirectoryPrompt,
            tone: 'info',
            confirmLabel: locale.value.app.dialogOk,
            cancelLabel: locale.value.app.dialogCancel
          })
          didCancelDirectoryPrompt = !confirmed
          return confirmed
        }
      })
      cleanupX6GameHandle.value = handle
      hasX6GameAuthorization.value = true
      publishStatus({
        type: 'custom',
        message: locale.value.app.authorizeX6GameStatus,
        tone: 'success'
      })
    } catch (error) {
      if (!didCancelDirectoryPrompt) publishStatus(createErrorStatus(error, { type: 'readFailed' }))
    }
  }
  function resolveCleanupAccounts(accountIds: string[] | null, remember = false, choice = '') {
    showCleanupAccountDialog.value = false
    if (accountIds) persistCleanupAccountChoice(remember && choice ? choice : null)
    cleanupAccountResolver.value?.(accountIds)
    cleanupAccountResolver.value = null
  }
  async function resolveCleanupAccountIds(
    x6GameHandle: FileSystemDirectoryHandle
  ): Promise<string[] | null> {
    const albumHandle = albumDirectoryHandle.value
    if (albumHandle) {
      try {
        const accountId = await resolveX6GameAccountDirectory(
          x6GameHandle,
          albumHandle,
          locale.value.fileSystem
        )
        if (accountId) return [accountId]
      } catch {
        /* 相册无关时扫描全部账号 */
      }
    }
    const accounts = await listGamePlayPhotoAccounts(x6GameHandle)
    if (accounts.length <= 1) return accounts
    cleanupAccounts.value = accounts
    cleanupRememberedChoice.value = readCleanupAccountChoice()
    showCleanupAccountDialog.value = true
    return new Promise<string[] | null>((resolve) => {
      cleanupAccountResolver.value = resolve
    })
  }
  async function cleanLowQualityPhotos(x6GameHandle: FileSystemDirectoryHandle) {
    const accountIds = await resolveCleanupAccountIds(x6GameHandle)
    if (!accountIds) {
      publishStatus({
        type: 'custom',
        message: locale.value.app.relatedCleanupCancelledStatus,
        tone: 'info'
      })
      return
    }
    const plan = await prepareSpecialCleanup(x6GameHandle, 'lowQuality', accountIds, {
      skipDirectoryHandle: albumDirectoryHandle.value ?? undefined
    })
    if (!plan.fileCount) {
      publishStatus({
        type: 'custom',
        message: locale.value.app.noRelatedPhotos(plan.missingDirectories),
        tone: plan.missingDirectories.length ? 'warning' : 'info'
      })
      return
    }
    // 当前相册本身是清理目标时，在确认文案中说明本次只清理另一个目录。
    const skippedAlbumName = plan.skippedDirectories[0]
    const cleanupScope = skippedAlbumName
      ? {
          skippedAlbumName,
          remainingTargetNames: [
            ...new Set(plan.photoTargets.map((target) => target.directoryName))
          ]
        }
      : undefined
    const confirmed = await openConfirmDialog({
      title: locale.value.app.relatedCleanupDialogTitle,
      message: locale.value.app.confirmRelatedCleanup(
        plan.fileCount,
        plan.missingDirectories,
        cleanupScope
      ),
      tone: 'warning',
      confirmLabel: locale.value.app.dialogConfirm,
      cancelLabel: locale.value.app.dialogCancel
    })
    if (!confirmed) {
      publishStatus({
        type: 'custom',
        message: locale.value.app.relatedCleanupCancelledStatus,
        tone: 'info'
      })
      return
    }
    const result = await executeSpecialCleanup(plan)
    publishStatus({
      type: 'custom',
      message: locale.value.app.relatedCleanupStatus(
        result.deletedCount,
        result.deletedBytes,
        result.failures,
        result.missingDirectories
      ),
      tone: result.failures.length || result.missingDirectories.length ? 'warning' : 'success'
    })
  }
  async function cleanSpecialDirectory(
    x6GameHandle: FileSystemDirectoryHandle,
    item: Exclude<SpecialCleanupItem, 'lowQuality'>
  ) {
    const itemTitle = locale.value.cleanup.items[item].title
    const plan = await prepareSpecialCleanup(x6GameHandle, item)
    if (!plan.fileCount) {
      publishStatus({
        type: 'custom',
        message: locale.value.cleanup.noDirectoryFilesToClean(itemTitle, plan.missingDirectories),
        tone: plan.missingDirectories.length ? 'warning' : 'info'
      })
      return
    }
    const sizeText = `${formatFileSize(plan.totalBytes)}${plan.totalBytesKnown ? '' : language.value === 'zh' ? '（部分文件大小未知）' : ' (some file sizes unknown)'}`
    const confirmed = await openConfirmDialog({
      title: locale.value.cleanup.confirmDirectoryCleanupTitle,
      message: locale.value.cleanup.confirmDirectoryCleanup(itemTitle, plan.fileCount, sizeText),
      tone: 'warning',
      confirmLabel: locale.value.app.dialogConfirm,
      cancelLabel: locale.value.app.dialogCancel
    })
    if (!confirmed) {
      publishStatus({
        type: 'custom',
        message: locale.value.app.relatedCleanupCancelledStatus,
        tone: 'info'
      })
      return
    }
    const result = await executeSpecialCleanup(plan)
    publishStatus({
      type: 'custom',
      message: locale.value.cleanup.directoryCleanupStatus(
        itemTitle,
        result.deletedCount,
        result.deletedBytes,
        result.failures,
        result.missingDirectories
      ),
      tone: result.failures.length || result.missingDirectories.length ? 'warning' : 'success'
    })
  }
  async function cleanSpecialItem(item: SpecialCleanupItem) {
    const x6GameHandle = cleanupX6GameHandle.value
    if (!x6GameHandle || cleaningItem.value !== null) return
    cleaningItem.value = item
    activeOperation.value = 'cleanup'
    try {
      if (item === 'lowQuality') await cleanLowQualityPhotos(x6GameHandle)
      else await cleanSpecialDirectory(x6GameHandle, item)
    } catch (error) {
      publishStatus(createErrorStatus(error, { type: 'readFailed' }))
    } finally {
      cleaningItem.value = null
      if (activeOperation.value === 'cleanup') activeOperation.value = null
    }
  }

  /** 永久删除当前账号两个低画质目录中与选中照片同名的图片，不触碰当前相册源文件。 */
  async function deleteMatchingLowQualityPhotos(targets: PhotoItem[]) {
    const albumHandle = albumDirectoryHandle.value
    if (!albumHandle || !targets.length || isAnyFileOperationBusy.value) return

    activeOperation.value = 'cleanup'
    publishStatus({
      type: 'custom',
      message: locale.value.app.permanentlyDeletingPhotos,
      tone: 'info',
      loading: true
    })
    let cancelledAuthorization = false
    try {
      const { directoryHandle: x6GameHandle, accountDirectoryName } =
        await getX6GameDirectoryForAlbum(albumHandle, locale.value.fileSystem, {
          beforeRequestX6GamePermission: async () => {
            const confirmed = await openConfirmDialog({
              title: locale.value.app.x6GameDirectoryDialogTitle,
              message: locale.value.fileSystem.restoreX6GamePermissionPrompt,
              tone: 'info',
              confirmLabel: locale.value.app.dialogContinueAuthorization,
              cancelLabel: locale.value.app.dialogCancel
            })
            cancelledAuthorization = !confirmed
            return confirmed
          },
          beforePickX6GameDirectory: async () => {
            const confirmed = await openConfirmDialog({
              title: locale.value.app.x6GameDirectoryDialogTitle,
              message: locale.value.fileSystem.selectX6GameDirectoryPrompt,
              tone: 'info',
              confirmLabel: locale.value.app.dialogOk,
              cancelLabel: locale.value.app.dialogCancel
            })
            cancelledAuthorization = !confirmed
            return confirmed
          }
        })
      const plan = await prepareMatchingPhotoCleanup(
        x6GameHandle,
        accountDirectoryName,
        targets.map((photo) => photo.name),
        albumHandle
      )
      if (!plan.matchedCount) {
        publishStatus({
          type: 'custom',
          message: locale.value.app.noMatchingRelatedPhotos(
            plan.missingDirectories,
            plan.skippedDirectories
          ),
          tone: plan.missingDirectories.length ? 'warning' : 'info'
        })
        return
      }
      const confirmed = await openConfirmDialog({
        title: locale.value.app.relatedPhotoDeleteDialogTitle,
        message: locale.value.app.confirmRelatedPhotoDelete(
          plan.matchedCount,
          plan.skippedDirectories
        ),
        tone: 'warning',
        confirmLabel: locale.value.app.dialogConfirm,
        cancelLabel: locale.value.app.dialogCancel
      })
      if (!confirmed) {
        publishStatus({
          type: 'custom',
          message: locale.value.app.relatedPhotoDeleteCancelledStatus,
          tone: 'info'
        })
        return
      }
      const result = await executeMatchingPhotoCleanup(plan)
      publishStatus({
        type: 'custom',
        message: locale.value.app.relatedPhotoDeleteStatus(result.deletedCount, result.failures),
        tone: result.failures.length ? 'warning' : 'success'
      })
    } catch (error) {
      if (cancelledAuthorization)
        publishStatus({
          type: 'custom',
          message: locale.value.app.relatedPhotoDeleteCancelledStatus,
          tone: 'info'
        })
      else publishStatus(createErrorStatus(error, { type: 'readFailed' }))
    } finally {
      if (activeOperation.value === 'cleanup') activeOperation.value = null
    }
  }

  onBeforeUnmount(() => resolveCleanupAccounts(null))
  return {
    showCleanupDialog,
    cleanupX6GameHandle,
    cleaningItem,
    showCleanupAccountDialog,
    cleanupAccounts,
    cleanupRememberedChoice,
    openCleanupDialog,
    authorizeCleanupFolder,
    resolveCleanupAccounts,
    cleanSpecialItem,
    deleteMatchingLowQualityPhotos
  }
}
