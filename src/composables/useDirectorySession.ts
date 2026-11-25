import { computed, shallowRef } from 'vue'
import {
  DirectoryAccessError,
  createDirectoryError,
  normalizeDirectoryError
} from '../utils/file-system/directoryErrors'
import { readLocalStorage } from '../utils/localStorage'
import { ALBUM_ACCESS_MODE_KEY, compatibleAlbumMessages } from '../i18n/messages/compatibleAlbum'
import { gameAlbumMessages } from '../i18n/messages/gameAlbum'
import type { Ref, ComputedRef } from 'vue'
import type { LocaleMessages } from '../i18n'
import {
  getSavedAlbumDirectoryHandle,
  readAlbumDirectory,
  pickAlbumDirectory,
  type AlbumDirectoryResult
} from '../utils/file-system/albumFileSystem'
import {
  getSavedGameAlbumUid,
  getSavedX6GameDirectoryHandle
} from '../utils/file-system/directoryStorage'
import {
  ensureReadWritePermission,
  getSupportedDirectoryPicker
} from '../utils/file-system/directoryPermission'
import {
  listGameAlbumAccounts,
  resolveX6GameAccountDirectory
} from '../utils/file-system/directoryAccess'
import type { ActiveOperation, StatusState, useOperationNotice } from './useOperationNotice'

export type DirectoryState = { type: 'none' } | { type: 'remembered' | 'selected'; name: string }

export interface GameAlbumBinding {
  root: FileSystemDirectoryHandle
  uid: string
  accountUids: string[]
}

interface RememberedAlbum {
  directory: FileSystemDirectoryHandle
  game?: { root: FileSystemDirectoryHandle; uid: string }
}

interface DirectorySessionOptions {
  language: Ref<'zh' | 'en'>
  activeOperation: Ref<ActiveOperation | null>
  isAnyFileOperationBusy: ComputedRef<boolean>
  publishStatus: (status: StatusState) => void
  locale: ComputedRef<LocaleMessages>
  directoryState: Ref<DirectoryState>
  gameAlbum: Ref<GameAlbumBinding | null>
  authorizedGameDirectory: Ref<FileSystemDirectoryHandle | null>
  replaceAlbum: (
    result: AlbumDirectoryResult,
    status: StatusState,
    options?: { preserveView?: boolean; remember?: boolean; game?: GameAlbumBinding }
  ) => Promise<void>
  createErrorStatus: ReturnType<typeof useOperationNotice>['createErrorStatus']
}

/** 启动查询与用户手势分开处理，失败后保留当前相册和可恢复的句柄。 */
export function useDirectorySession(options: DirectorySessionOptions) {
  const {
    activeOperation,
    isAnyFileOperationBusy,
    publishStatus,
    locale,
    directoryState,
    gameAlbum,
    authorizedGameDirectory,
    replaceAlbum,
    createErrorStatus
  } = options
  const remembered = shallowRef<RememberedAlbum | null>(null)
  const canRestoreDirectory = computed(() => Boolean(remembered.value))
  const text = computed(() => gameAlbumMessages[options.language.value])
  const messages = computed(() => locale.value.fileSystem)

  function finishLoading() {
    if (activeOperation.value === 'loading') activeOperation.value = null
  }

  function showInfo(message: string) {
    publishStatus({ type: 'custom', message, tone: 'info' })
  }

  async function openGameAlbum(
    root: FileSystemDirectoryHandle,
    intent: 'new' | 'switch' | 'startup' | 'restore',
    uid?: string
  ) {
    const accounts = await listGameAlbumAccounts(root, messages.value)
    const accountUids = accounts.map((account) => account.uid)
    const requested = accounts.find((account) => account.uid === uid)
    const selected =
      requested ?? (intent === 'new' || intent === 'restore' ? accounts[0] : undefined)
    if (!selected) {
      if (intent === 'switch' && gameAlbum.value?.root === root) {
        gameAlbum.value = { ...gameAlbum.value, accountUids }
      }
      showInfo(uid ? text.value.missingAccount : text.value.noAccounts)
      return
    }
    const result = await readAlbumDirectory(selected.directory, {
      requestPermission: false,
      messages: messages.value
    })
    await replaceAlbum(
      result,
      { type: 'initial' },
      {
        preserveView: intent !== 'new',
        remember: intent !== 'startup',
        game: { root, uid: selected.uid, accountUids }
      }
    )
    remembered.value = null
  }

  async function openRememberedAlbum(saved: RememberedAlbum, intent: 'startup' | 'restore') {
    if (saved.game) {
      const { root, uid } = saved.game
      if ((await resolveX6GameAccountDirectory(root, saved.directory, messages.value)) !== uid) {
        throw createDirectoryError('invalid-directory', messages.value)
      }
      await openGameAlbum(root, intent, uid)
      return
    }
    const result = await readAlbumDirectory(saved.directory, {
      requestPermission: false,
      messages: messages.value
    })
    await replaceAlbum(
      result,
      { type: 'initial' },
      { preserveView: true, remember: intent === 'restore' }
    )
    remembered.value = null
  }

  async function restoreSavedDirectory() {
    activeOperation.value = 'loading'
    const timedOut = new Set<FileSystemDirectoryHandle>()
    const checkPermission = (handle: FileSystemDirectoryHandle) =>
      ensureReadWritePermission(handle, false, () => {
        timedOut.add(handle)
      })
    const savedRoot = getSavedX6GameDirectoryHandle()
    const rootPermission = savedRoot
      .then((root) => root?.name === 'X6Game' && checkPermission(root))
      .catch(() => false)
    try {
      if (readLocalStorage(ALBUM_ACCESS_MODE_KEY) === 'compatible') {
        showInfo(compatibleAlbumMessages[options.language.value].restore)
        return
      }
      const saved = await getSavedAlbumDirectoryHandle()
      if (!saved) return
      directoryState.value = { type: 'remembered', name: saved.name }
      const root = await savedRoot
      const uid = root ? await getSavedGameAlbumUid() : undefined
      const game = root && uid ? { root, uid } : undefined
      const album = { directory: saved, game }
      remembered.value = album
      const granted = game ? await rootPermission : await checkPermission(saved)
      if (!granted) {
        if (timedOut.has(game?.root ?? saved)) {
          // 本次会话不再向失效句柄请求授权；持久化记录保留到用户重新选择成功。
          remembered.value = null
          showInfo(text.value.restoreTimeout)
        } else {
          showInfo(text.value.restoreHint)
        }
        return
      }
      await openRememberedAlbum(album, 'startup')
    } catch (error) {
      publishStatus(createErrorStatus(error, { type: 'restoreFailed' }))
    } finally {
      const granted = await rootPermission
      if (!gameAlbum.value && granted) authorizedGameDirectory.value = (await savedRoot) ?? null
      finishLoading()
    }
  }

  async function restoreDirectoryAccess() {
    const saved = remembered.value
    if (!saved || isAnyFileOperationBusy.value) return
    activeOperation.value = 'loading'
    try {
      const handle = saved.game?.root ?? saved.directory
      // 先取内存句柄并在点击所在的任务中发起权限请求。
      const permission = handle.requestPermission
        ? (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
        : await ensureReadWritePermission(handle, false)
      if (!permission) {
        showInfo(text.value.restoreFailed)
        return
      }
      await openRememberedAlbum(saved, 'restore')
    } catch (error) {
      publishStatus(createErrorStatus(error, { type: 'restoreFailed' }))
    } finally {
      finishLoading()
    }
  }

  async function chooseGameDirectory() {
    if (isAnyFileOperationBusy.value) return
    activeOperation.value = 'loading'
    try {
      const root = await getSupportedDirectoryPicker(messages.value)({
        id: 'infinity-nikki-x6game',
        mode: 'readwrite'
      })
      if (!(await ensureReadWritePermission(root, false))) {
        throw createDirectoryError('permission-denied', messages.value)
      }
      await openGameAlbum(root, 'new')
    } catch (error) {
      const normalized = normalizeDirectoryError(error, messages.value)
      if (normalized.code === 'cancelled' || normalized.code === 'system-directory') {
        showInfo(text.value.pickerAborted)
      } else {
        publishStatus(createErrorStatus(normalized, { type: 'readFailed' }))
      }
    } finally {
      finishLoading()
    }
  }

  async function switchGameAccount(uid: string) {
    const current = gameAlbum.value
    if (
      !current ||
      current.uid === uid ||
      !current.accountUids.includes(uid) ||
      isAnyFileOperationBusy.value
    )
      return
    activeOperation.value = 'loading'
    try {
      await openGameAlbum(current.root, 'switch', uid)
    } catch (error) {
      publishStatus(createErrorStatus(error, { type: 'readFailed' }))
    } finally {
      finishLoading()
    }
  }

  async function chooseDirectory() {
    if (isAnyFileOperationBusy.value) return
    activeOperation.value = 'loading'
    publishStatus({ type: 'reading' })
    try {
      const result = await pickAlbumDirectory(messages.value)
      await replaceAlbum(result, {
        type: 'success',
        count: result.photos.length,
        prefix: 'read',
        suffix: 'remembered'
      })
      remembered.value = null
    } catch (error) {
      if (!(error instanceof DirectoryAccessError && error.code === 'cancelled')) {
        publishStatus(createErrorStatus(error, { type: 'readFailed' }))
      }
    } finally {
      finishLoading()
    }
  }

  function forgetDirectoryRestore() {
    remembered.value = null
  }

  return {
    restoreSavedDirectory,
    canRestoreDirectory,
    restoreDirectoryAccess,
    chooseDirectory,
    chooseGameDirectory,
    switchGameAccount,
    forgetDirectoryRestore
  }
}
