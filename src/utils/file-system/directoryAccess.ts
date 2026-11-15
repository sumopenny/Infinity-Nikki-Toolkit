import { ensureReadWritePermission, getSupportedDirectoryPicker } from './directoryPermission'
export { supportsDirectoryAuthorization } from './directoryPermission'
// 目录访问：负责浏览器目录选择、读写权限、X6Game 授权复用和账号路径验证。
import {
  clearSavedX6GameDirectoryHandle,
  getSavedX6GameDirectoryHandle,
  saveX6GameDirectoryHandle
} from './directoryStorage'
import { createDirectoryError, normalizeDirectoryError } from './directoryErrors'
import type { FileSystemMessages } from './directoryErrors'

const HIGH_QUALITY_DIRECTORY_NAME = 'NikkiPhotos_HighQuality'
export interface X6GameDirectoryOptions {
  beforePickX6GameDirectory?: () => boolean | Promise<boolean>
  beforeRequestX6GamePermission?: () => boolean | Promise<boolean>
  allowUnrelatedAlbum?: boolean
  /** 强制打开目录选择器，不复用已保存的授权句柄。 */ forcePick?: boolean
}
function isMissingDirectoryError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

async function getRequiredNestedDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[]
): Promise<FileSystemDirectoryHandle> {
  let current = root
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment)
  }
  return current
}

export async function isSameOrNestedDirectory(
  parent: FileSystemDirectoryHandle,
  candidate: FileSystemDirectoryHandle
): Promise<boolean> {
  return parent === candidate || (await parent.resolve(candidate)) !== null
}

/** 判断导出目标是否为相册本身、其子目录或 trash 目录。 */
export async function isProtectedAlbumDirectory(
  album: FileSystemDirectoryHandle,
  candidate: FileSystemDirectoryHandle
): Promise<boolean> {
  if (await isSameOrNestedDirectory(album, candidate)) return true
  try {
    const trash = await album.getDirectoryHandle('trash')
    return await isSameOrNestedDirectory(trash, candidate)
  } catch (error) {
    if (isMissingDirectoryError(error)) return false
    throw error
  }
}

export async function resolveX6GameAccountDirectory(
  x6GameHandle: FileSystemDirectoryHandle,
  albumDirectoryHandle: FileSystemDirectoryHandle,
  messages: FileSystemMessages,
  allowUnrelatedAlbum = false
): Promise<string> {
  if (x6GameHandle.name !== 'X6Game') {
    throw createDirectoryError('invalid-directory', messages)
  }

  if (albumDirectoryHandle.name !== HIGH_QUALITY_DIRECTORY_NAME && allowUnrelatedAlbum) return ''

  const relativePath = await x6GameHandle.resolve(albumDirectoryHandle)
  const accountDirectoryName = relativePath?.[2] ?? ''
  const hasExpectedPath =
    relativePath?.length === 4 &&
    relativePath[0] === 'Saved' &&
    relativePath[1] === 'GamePlayPhotos' &&
    relativePath[3] === albumDirectoryHandle.name
  const hasValidAccountDirectory =
    Boolean(accountDirectoryName) &&
    accountDirectoryName !== '.' &&
    accountDirectoryName !== '..' &&
    !/[\\/]/.test(accountDirectoryName)

  if (!hasExpectedPath || !hasValidAccountDirectory) {
    throw createDirectoryError('invalid-directory', messages)
  }

  return accountDirectoryName
}

/**
 * 提示用户选择并授权当前相册对应的 X6Game 文件夹。
 * 参数：albumDirectoryHandle 为当前高画质相册句柄，messages 为文件系统提示文案。
 * 返回：验证通过的 X6Game 目录句柄和当前账号目录名。
 */
async function pickValidatedX6GameDirectory(
  albumDirectoryHandle: FileSystemDirectoryHandle,
  messages: FileSystemMessages,
  options: X6GameDirectoryOptions = {}
): Promise<{ directoryHandle: FileSystemDirectoryHandle; accountDirectoryName: string }> {
  const showDirectoryPicker = getSupportedDirectoryPicker(messages)

  if (options.beforePickX6GameDirectory && !(await options.beforePickX6GameDirectory())) {
    throw createDirectoryError('cancelled', messages)
  }

  const directoryHandle = await showDirectoryPicker({
    id: 'infinity-nikki-x6game',
    mode: 'readwrite',
    startIn: albumDirectoryHandle
  })
  const hasPermission = await ensureReadWritePermission(directoryHandle, true)

  if (!hasPermission) {
    throw createDirectoryError('permission-denied', messages)
  }

  const accountDirectoryName = await resolveX6GameAccountDirectory(
    directoryHandle,
    albumDirectoryHandle,
    messages,
    options.allowUnrelatedAlbum
  )
  await saveX6GameDirectoryHandle(directoryHandle)
  return { directoryHandle, accountDirectoryName }
}

async function getValidatedX6GameDirectory(
  albumDirectoryHandle: FileSystemDirectoryHandle,
  messages: FileSystemMessages,
  options: X6GameDirectoryOptions = {}
): Promise<{ directoryHandle: FileSystemDirectoryHandle; accountDirectoryName: string }> {
  const savedHandle = options.forcePick ? null : await getSavedX6GameDirectoryHandle()

  if (savedHandle) {
    let hasPermission = await ensureReadWritePermission(savedHandle, false)

    if (!hasPermission) {
      if (
        options.beforeRequestX6GamePermission &&
        !(await options.beforeRequestX6GamePermission())
      ) {
        throw createDirectoryError('cancelled', messages)
      }
      hasPermission = await ensureReadWritePermission(savedHandle, true)
    }

    if (hasPermission) {
      try {
        const accountDirectoryName = await resolveX6GameAccountDirectory(
          savedHandle,
          albumDirectoryHandle,
          messages,
          options.allowUnrelatedAlbum
        )
        return { directoryHandle: savedHandle, accountDirectoryName }
      } catch {
        await clearSavedX6GameDirectoryHandle()
      }
    }
  }

  try {
    return await pickValidatedX6GameDirectory(albumDirectoryHandle, messages, options)
  } catch (error) {
    throw normalizeDirectoryError(error, messages)
  }
}

/** 获取当前相册对应的 X6Game 目录授权。参数：albumDirectoryHandle 为当前相册，messages 为文案，options 为授权确认回调。 */
export async function getX6GameDirectoryForAlbum(
  albumDirectoryHandle: FileSystemDirectoryHandle,
  messages: FileSystemMessages,
  options: X6GameDirectoryOptions = {}
): Promise<{ directoryHandle: FileSystemDirectoryHandle; accountDirectoryName: string }> {
  return getValidatedX6GameDirectory(albumDirectoryHandle, messages, options)
}

/**
 * 独立于相册授权 X6Game 文件夹，供专项清理使用。
 * 参数：messages 为文件系统提示文案，options 为授权确认回调。
 * 返回：验证通过的 X6Game 目录句柄；句柄会与搭配码授权共用同一份持久化记录。
 */
export async function pickStandaloneX6GameDirectory(
  messages: FileSystemMessages,
  options: X6GameDirectoryOptions = {}
): Promise<FileSystemDirectoryHandle> {
  const savedHandle = await getSavedX6GameDirectoryHandle()

  if (!options.forcePick && savedHandle && savedHandle.name === 'X6Game') {
    let hasPermission = await ensureReadWritePermission(savedHandle, false)

    if (!hasPermission) {
      if (
        options.beforeRequestX6GamePermission &&
        !(await options.beforeRequestX6GamePermission())
      ) {
        throw createDirectoryError('cancelled', messages)
      }
      hasPermission = await ensureReadWritePermission(savedHandle, true)
    }

    if (hasPermission) return savedHandle
    await clearSavedX6GameDirectoryHandle()
  }

  const showDirectoryPicker = getSupportedDirectoryPicker(messages)

  try {
    if (options.beforePickX6GameDirectory && !(await options.beforePickX6GameDirectory())) {
      throw createDirectoryError('cancelled', messages)
    }

    const directoryHandle = await showDirectoryPicker({
      id: 'infinity-nikki-x6game',
      mode: 'readwrite'
    })
    if (directoryHandle.name !== 'X6Game') {
      throw createDirectoryError('invalid-directory', messages)
    }
    const hasPermission = await ensureReadWritePermission(directoryHandle, true)
    if (!hasPermission) {
      throw createDirectoryError('permission-denied', messages)
    }

    await saveX6GameDirectoryHandle(directoryHandle)
    return directoryHandle
  } catch (error) {
    throw normalizeDirectoryError(error, messages)
  }
}

/**
 * 列出游戏拍照目录下的全部账号文件夹名。
 * 参数：x6GameHandle 为已授权的 X6Game 目录句柄。
 * 返回：Saved\GamePlayPhotos 下的子目录名列表；目录不存在时返回空数组。
 */
export async function listGamePlayPhotoAccounts(
  x6GameHandle: FileSystemDirectoryHandle
): Promise<string[]> {
  let gamePlayPhotosHandle: FileSystemDirectoryHandle
  try {
    gamePlayPhotosHandle = await getRequiredNestedDirectory(x6GameHandle, [
      'Saved',
      'GamePlayPhotos'
    ])
  } catch (error) {
    if (isMissingDirectoryError(error)) return []
    throw error
  }

  const accounts: string[] = []
  for await (const [name, handle] of gamePlayPhotosHandle.entries()) {
    if (handle.kind === 'directory') accounts.push(name)
  }
  return accounts.sort()
}
