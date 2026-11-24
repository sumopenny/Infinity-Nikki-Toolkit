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
  resolveX6GameAccountDirectory,
  type GameAlbumAccount
} from '../utils/file-system/directoryAccess'
import type { ActiveOperation, StatusState, useOperationNotice } from './useOperationNotice'

export type DirectoryState = { type: 'none' } | { type: 'remembered' | 'selected'; name: string }

export interface GameAlbumBinding {
  root: FileSystemDirectoryHandle
  uid: string
  accountCount: number
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
  hasX6GameAuthorization: Ref<boolean>
  replaceAlbum: (
    result: AlbumDirectoryResult,
    status: StatusState,
    options?: { preserveView?: boolean; remember?: boolean; game?: GameAlbumBinding }
  ) => Promise<void>
  chooseAccount: (accounts: GameAlbumAccount[], currentUid?: string) => Promise<string | null>
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
    hasX6GameAuthorization,
    replaceAlbum,
    chooseAccount,
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
    const previous = accounts.find((account) => account.uid === uid)
    let selected = intent === 'startup' || intent === 'restore' ? previous : undefined
    if (!selected) {
      if (uid && !previous) showInfo(text.value.missingAccount)
      else if (!accounts.length) showInfo(text.value.noAccounts)
      if (!accounts.length || intent === 'startup') return
      if (intent === 'new' && accounts.length === 1) selected = accounts[0]
      else {
        const selectedUid = await chooseAccount(accounts, intent === 'switch' ? uid : undefined)
        selected = accounts.find((account) => account.uid === selectedUid)
      }
    }
    if (!selected || (intent === 'switch' && selected.uid === uid)) return
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
        game: { root, uid: selected.uid, accountCount: accounts.length }
      }
    )
    remembered.value = null
  }

  async function restoreSavedDirectory() {
    activeOperation.value = 'loading'
    try {
      if (readLocalStorage(ALBUM_ACCESS_MODE_KEY) === 'compatible') {
        showInfo(compatibleAlbumMessages[options.language.value].restore)
        return
      }
      const saved = await getSavedAlbumDirectoryHandle()
      if (!saved) return
      remembered.value = { directory: saved }
      directoryState.value = { type: 'remembered', name: saved.name }
      const root = await getSavedX6GameDirectoryHandle()
      const uid = root ? await getSavedGameAlbumUid() : undefined
      if (root && uid) remembered.value.game = { root, uid }
      const handle = remembered.value.game?.root ?? saved
      if (!(await ensureReadWritePermission(handle, false))) {
        showInfo(text.value.restoreHint)
        return
      }
      if (root && uid) {
        if ((await resolveX6GameAccountDirectory(root, saved, messages.value)) !== uid) {
          throw createDirectoryError('invalid-directory', messages.value)
        }
        await openGameAlbum(root, 'startup', uid)
      } else {
        const result = await readAlbumDirectory(saved, {
          requestPermission: false,
          messages: messages.value
        })
        await replaceAlbum(result, { type: 'initial' }, { preserveView: true, remember: false })
        remembered.value = null
      }
    } catch (error) {
      publishStatus(createErrorStatus(error, { type: 'restoreFailed' }))
    } finally {
      finishLoading()
    }
  }

  async function restoreSavedX6GameAuthorization() {
    if (gameAlbum.value) return
    try {
      const root = await getSavedX6GameDirectoryHandle()
      const granted = Boolean(
        root?.name === 'X6Game' && (await ensureReadWritePermission(root, false))
      )
      if (!gameAlbum.value) hasX6GameAuthorization.value = granted
    } catch {
      if (!gameAlbum.value) hasX6GameAuthorization.value = false
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
      if (saved.game) {
        if (
          (await resolveX6GameAccountDirectory(
            saved.game.root,
            saved.directory,
            messages.value
          )) !== saved.game.uid
        ) {
          throw createDirectoryError('invalid-directory', messages.value)
        }
        await openGameAlbum(saved.game.root, 'restore', saved.game.uid)
      } else {
        const result = await readAlbumDirectory(saved.directory, {
          requestPermission: false,
          messages: messages.value
        })
        await replaceAlbum(result, { type: 'initial' }, { preserveView: true })
        remembered.value = null
      }
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

  async function switchGameAccount() {
    if (!gameAlbum.value || isAnyFileOperationBusy.value) return
    const { root, uid } = gameAlbum.value
    activeOperation.value = 'loading'
    try {
      await openGameAlbum(root, 'switch', uid)
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
    restoreSavedX6GameAuthorization,
    canRestoreDirectory,
    restoreDirectoryAccess,
    chooseDirectory,
    chooseGameDirectory,
    switchGameAccount,
    forgetDirectoryRestore
  }
}
