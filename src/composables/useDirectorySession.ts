import { reportError } from '../utils/errorReporting/errorReporter'
import { DirectoryAccessError } from '../utils/file-system/directoryErrors'
import { readLocalStorage } from '../utils/localStorage'
import { ALBUM_ACCESS_MODE_KEY, compatibleAlbumMessages } from '../i18n/messages/compatibleAlbum'
import type { Ref, ComputedRef } from 'vue'
import type { LocaleMessages } from '../i18n'
import type { PhotoItem } from '../utils/photoGrouping'
import {
  getSavedAlbumDirectoryHandle,
  readAlbumDirectory,
  pickAlbumDirectory,
  type AlbumDirectoryResult
} from '../utils/file-system/albumFileSystem'
import { getSavedX6GameDirectoryHandle } from '../utils/file-system/directoryStorage'
import type { ActiveOperation, StatusState, useOperationNotice } from './useOperationNotice'

export type DirectoryState = { type: 'none' } | { type: 'remembered' | 'selected'; name: string }
interface DirectorySessionOptions {
  language?: Ref<'zh' | 'en'>
  activeOperation: Ref<ActiveOperation | null>
  isAnyFileOperationBusy: ComputedRef<boolean>
  statusState: Ref<StatusState>
  locale: ComputedRef<LocaleMessages>
  directoryState: Ref<DirectoryState>
  photos: Ref<PhotoItem[]>
  hasX6GameAuthorization: Ref<boolean>
  replaceAlbum: (
    result: AlbumDirectoryResult,
    status: StatusState,
    options?: { preserveView?: boolean }
  ) => Promise<void>
  createErrorStatus: ReturnType<typeof useOperationNotice>['createErrorStatus']
}
/** 目录授权与恢复入口集中管理；页面仅提供数据应用回调和状态，不再重复编排授权流程。 */
export function useDirectorySession(options: DirectorySessionOptions) {
  const {
    activeOperation,
    isAnyFileOperationBusy,
    statusState,
    locale,
    directoryState,
    photos,
    hasX6GameAuthorization,
    replaceAlbum,
    createErrorStatus
  } = options
  /** 恢复浏览器记住的相册目录。参数：无。 */
  async function restoreSavedDirectory() {
    activeOperation.value = 'loading'
    try {
      if (readLocalStorage(ALBUM_ACCESS_MODE_KEY) === 'compatible') {
        statusState.value = {
          type: 'custom',
          message: compatibleAlbumMessages[options.language?.value ?? 'zh'].restore,
          tone: 'info'
        }
        return
      }
      const savedHandle = await getSavedAlbumDirectoryHandle()
      if (!savedHandle) return
      directoryState.value = { type: 'remembered', name: savedHandle.name }
      const result = await readAlbumDirectory(savedHandle, {
        requestPermission: false,
        messages: locale.value.fileSystem
      })
      await replaceAlbum(result, { type: 'initial' }, { preserveView: true })
    } catch (error) {
      statusState.value = createErrorStatus(error, { type: 'restoreFailed' })
    } finally {
      if (activeOperation.value === 'loading') activeOperation.value = null
    }
  }

  /** 静默检查是否存在可复用的 X6Game 授权，用于显示“重新授权”入口。参数：无。 */
  async function restoreSavedX6GameAuthorization() {
    try {
      const savedHandle = await getSavedX6GameDirectoryHandle()
      if (!savedHandle || savedHandle.name !== 'X6Game') return
      const permission = savedHandle.queryPermission
        ? await savedHandle.queryPermission({ mode: 'readwrite' })
        : 'granted'
      hasX6GameAuthorization.value = permission === 'granted'
    } catch {
      hasX6GameAuthorization.value = false
    }
  }

  /** 选择或重新授权相册目录。参数：无。 */
  async function chooseDirectory() {
    if (isAnyFileOperationBusy.value) return
    activeOperation.value = 'loading'
    statusState.value = { type: 'reading' }
    try {
      const savedHandle = await getSavedAlbumDirectoryHandle()
      if (savedHandle && !photos.value.length) {
        try {
          const restored = await readAlbumDirectory(savedHandle, {
            requestPermission: true,
            messages: locale.value.fileSystem
          })
          await replaceAlbum(restored, { type: 'initial' })
          return
        } catch (error) {
          if (!(error instanceof DirectoryAccessError) || error.code === 'read-failed') {
            reportError(error, { module: 'album', action: 'restore-directory', stage: 'before-picker' })
          }
          statusState.value = { type: 'restorePathFailed' }
        }
      }
      const result = await pickAlbumDirectory(locale.value.fileSystem)
      await replaceAlbum(result, {
        type: 'success',
        count: result.photos.length,
        prefix: 'read',
        suffix: 'remembered'
      })
    } catch (error) {
      statusState.value = createErrorStatus(error, { type: 'readFailed' })
    } finally {
      if (activeOperation.value === 'loading') activeOperation.value = null
    }
  }

  return { restoreSavedDirectory, restoreSavedX6GameAuthorization, chooseDirectory }
}
