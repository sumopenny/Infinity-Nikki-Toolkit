import { reportError } from '../errorReporting/errorReporter'
import { PHOTO_IMAGE_EXTENSIONS as IMAGE_EXTENSIONS } from './imageFormats'
import { isDirectoryPhoto } from '../photoGrouping'
// 相册回收站：负责最近删除照片的读取、移动、恢复、永久删除和安全清空。
import {
  datePartsFromTimestamp,
  parsePhotoDate,
  type PhotoItem,
  type RecentlyDeletedPhoto
} from '../photoGrouping'
import { formatFileSize, releasePhotoUrl } from './photoUrl'
import { runWithConcurrency } from '../concurrency'
import { readAlbumMetadata, readTrashNotes, normalizePhotoNote, transferPhotoNote } from './photoMetadata'


const TRASH_DIRECTORY_NAME = 'trash'
const TRASH_FILE_PREFIX = 'inam-v1__'
const FILE_COPY_CONCURRENCY = 27
const FILE_DELETE_CONCURRENCY = 10

export interface TrashOperationResult<T> {
  succeeded: T[]
  failedNames: string[]
}
export interface MoveToTrashResult extends TrashOperationResult<PhotoItem> {
  movedPhotos: RecentlyDeletedPhoto[]
}
export interface RestoreTrashResult extends TrashOperationResult<RecentlyDeletedPhoto> {
  restoredPhotos: PhotoItem[]
}

function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(fileName.split('.').pop()?.toLowerCase() ?? '')
}

function isMissingDirectoryError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

/**
 * 读取最近删除目录并计算每张图片大小。
 * 参数：albumDirectoryHandle 为当前相册根目录。
 * 返回：按删除时间倒序排列的最近删除照片；目录不存在时返回空数组。
 */
export async function listRecentlyDeleted(
  albumDirectoryHandle: FileSystemDirectoryHandle,
  albumNotes?: Record<string, { note: string }>
): Promise<RecentlyDeletedPhoto[]> {
  let trashDirectoryHandle: FileSystemDirectoryHandle
  try {
    trashDirectoryHandle = await albumDirectoryHandle.getDirectoryHandle(TRASH_DIRECTORY_NAME)
  } catch (error) {
    if (isMissingDirectoryError(error)) return []
    throw error
  }

  const candidates: Array<{
    trashName: string
    fileHandle: FileSystemFileHandle
    metadata: NonNullable<ReturnType<typeof parseTrashFileName>>
  }> = []
  const notes = albumNotes ?? await readTrashNotes(albumDirectoryHandle)
  for await (const [trashName, handle] of trashDirectoryHandle.entries()) {
    if (handle.kind !== 'file' || !isImageFile(trashName)) continue
    const metadata = parseTrashFileName(trashName)
    if (!metadata) continue
    candidates.push({ trashName, fileHandle: handle as FileSystemFileHandle, metadata })
  }

  const scannedPhotos = await runWithConcurrency(
    candidates,
    async ({ trashName, fileHandle, metadata }): Promise<RecentlyDeletedPhoto | null> => {
      let size: number | null = null
      let lastModified: number | undefined
      try {
        const file = await fileHandle.getFile()
        size = file.size
        lastModified = file.lastModified
      } catch {
        // 单个文件大小读取失败不影响其余回收照片展示。
      }
      const parsed =
        parsePhotoDate(metadata.originalName) ??
        (lastModified === undefined ? null : datePartsFromTimestamp(lastModified))
      if (!parsed) return null

      let noteKey = `trash/${trashName}`
      // 旧版备注仍按原名保存；原名被新照片占用时不能把新照片的备注挪走。
      if (!Object.hasOwn(notes, noteKey)) {
        try {
          await albumDirectoryHandle.getFileHandle(metadata.originalName)
        } catch (error) {
          if (!isMissingDirectoryError(error)) throw error
          noteKey = metadata.originalName
        }
      }

      return {
        id: `trash:${trashName}`,
        name: metadata.originalName,
        originalName: metadata.originalName,
        trashName,
        deletedAt: metadata.deletedAt,
        wasFavorite: metadata.wasFavorite,
        size,
        url: null,
        fileSizeText: size === null ? '--' : formatFileSize(size),
        fileHandle,
        directoryHandle: trashDirectoryHandle,
        lastModified,
        note: normalizePhotoNote(notes[noteKey]?.note),
        noteKey,
        albumDirectoryHandle,
        ...parsed
      } satisfies RecentlyDeletedPhoto
    },
    { concurrency: 6 }
  )

  return scannedPhotos
    .filter((photo): photo is RecentlyDeletedPhoto => Boolean(photo))
    .sort((a, b) => b.deletedAt - a.deletedAt)
}

/**
 * 将相册照片移动到当前相册的 trash 子目录。
 * 参数：photos 为目标照片，favoriteIds 为删除前的收藏集合。
 * 返回：成功移动的原照片、新建回收项和失败文件名，调用方可直接更新页面而无需重扫 trash。
 */
export async function movePhotosToRecentlyDeleted(
  photos: PhotoItem[],
  favoriteIds: Set<string>
): Promise<MoveToTrashResult> {
  const succeeded: PhotoItem[] = []
  const movedPhotos: RecentlyDeletedPhoto[] = []
  const failedNames: string[] = []
  if (!photos.length) return { succeeded, movedPhotos, failedNames }

  const writablePhotos = photos.filter(isDirectoryPhoto)
  if (writablePhotos.length !== photos.length)
    throw new DOMException('Read-only album', 'NotAllowedError')
  const albumDirectoryHandle = writablePhotos[0].directoryHandle
  await readAlbumMetadata(albumDirectoryHandle)
  const trashDirectoryHandle = await albumDirectoryHandle.getDirectoryHandle(TRASH_DIRECTORY_NAME, {
    create: true
  })

  const results = await runWithConcurrency(
    writablePhotos,
    async (photo) => {
      const deletedAt = Date.now()
      const wasFavorite = favoriteIds.has(photo.id)
      const trashName = createTrashFileName(photo, wasFavorite, deletedAt)
      try {
        const sourceFile = await photo.fileHandle.getFile()
        const targetHandle = await trashDirectoryHandle.getFileHandle(trashName, { create: true })
        let note = photo.note ?? ''
        try {
          await copyFileToHandle(sourceFile, targetHandle)
          note = await transferPhotoNote(
            albumDirectoryHandle,
            photo.name,
            `trash/${trashName}`,
            '',
            () => photo.directoryHandle.removeEntry(photo.name)
          )
        } catch (error) {
          if (!(error && typeof error === 'object' && 'preserveTarget' in error))
            await rollbackFile(trashDirectoryHandle, trashName)
          throw error
        }
        releasePhotoUrl(photo)
        return {
          source: photo,
          moved: {
            ...photo,
            note,
            noteKey: `trash/${trashName}`,
            albumDirectoryHandle,
            id: `trash:${trashName}`,
            url: null,
            fileSize: sourceFile.size,
            fileSizeText: formatFileSize(sourceFile.size),
            lastModified: sourceFile.lastModified,
            fileHandle: targetHandle,
            directoryHandle: trashDirectoryHandle,
            trashName,
            originalName: photo.name,
            deletedAt,
            wasFavorite,
            size: sourceFile.size
          } satisfies RecentlyDeletedPhoto
        }
      } catch (error) {
        reportError(error, { module: 'album-trash', action: 'move' })
        return { source: photo, moved: null }
      }
    },
    { concurrency: FILE_COPY_CONCURRENCY }
  )

  for (const result of results) {
    if (result.moved) {
      succeeded.push(result.source)
      movedPhotos.push(result.moved)
    } else {
      failedNames.push(result.source.name)
    }
  }

  return { succeeded, movedPhotos, failedNames }
}

/**
 * 查找不会覆盖现有照片的恢复文件名。
 * 参数：directoryHandle 为相册目录，originalName 为原文件名。
 * 返回：原名可用时返回原名，否则返回带递增 restored 后缀的名称。
 */
async function findAvailableRestoreName(
  directoryHandle: FileSystemDirectoryHandle,
  originalName: string,
  reservedNames: Set<string>
): Promise<string> {
  const dotIndex = originalName.lastIndexOf('.')
  const baseName = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName
  const extension = dotIndex > 0 ? originalName.slice(dotIndex) : ''

  for (let index = 0; ; index += 1) {
    const candidate = index === 0 ? originalName : `${baseName}_restored_${index}${extension}`
    if (reservedNames.has(candidate)) continue
    try {
      await directoryHandle.getFileHandle(candidate)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        // 并发任务可能同时确认名称不存在，返回前再次检查并立即占位。
        if (reservedNames.has(candidate)) continue
        reservedNames.add(candidate)
        return candidate
      }
      throw error
    }
  }
}

/**
 * 将最近删除照片恢复到当前相册。
 * 参数：photos 为待恢复照片，albumDirectoryHandle 为当前相册目录。
 * 返回：成功恢复的回收项、新照片状态和失败文件名。
 */
/** Serialize cooperating tabs; external filesystem writers remain outside Web Locks. */
export function restoreRecentlyDeletedPhotos(
  photos: RecentlyDeletedPhoto[], albumDirectoryHandle: FileSystemDirectoryHandle
): Promise<RestoreTrashResult> {
  const restore = () => restorePhotos(photos, albumDirectoryHandle)
  return navigator.locks?.request
    ? navigator.locks.request('nikki-photo-restore', restore)
    : restore()
}

async function restorePhotos(
  photos: RecentlyDeletedPhoto[],
  albumDirectoryHandle: FileSystemDirectoryHandle
): Promise<RestoreTrashResult> {
  const succeeded: RecentlyDeletedPhoto[] = []
  const restoredPhotos: PhotoItem[] = []
  const failedNames: string[] = []
  const reservedNames = new Set<string>()
  await readAlbumMetadata(albumDirectoryHandle)

  const results = await runWithConcurrency(
    photos,
    async (photo) => {
      let restoreName = ''
      let stage = 'allocate-name'
      try {
        restoreName = await findAvailableRestoreName(
          albumDirectoryHandle,
          photo.originalName,
          reservedNames
        )
        stage = 'read-source'
        const sourceFile = await photo.fileHandle.getFile()
        stage = 'create-target'
        const targetHandle = await albumDirectoryHandle.getFileHandle(restoreName, { create: true })
        // Refuse a file created by another writer since name allocation.
        const destination = await targetHandle.getFile()
        if (destination.size !== 0) throw new Error('Restore destination changed')
        let note = photo.note ?? ''
        try {
          await copyFileToHandle(sourceFile, targetHandle)
          stage = 'transfer-metadata-and-remove-source'
          const noteKey =
            restoreName !== photo.originalName && photo.noteKey === photo.originalName
              ? `trash/${photo.trashName}`
              : (photo.noteKey ??
                (restoreName === photo.originalName
                  ? photo.originalName
                  : `trash/${photo.trashName}`))
          note = await transferPhotoNote(albumDirectoryHandle, noteKey, restoreName, note, () =>
            photo.directoryHandle.removeEntry(photo.trashName)
          )
        } catch (error) {
          if (!(error && typeof error === 'object' && 'preserveTarget' in error))
            await rollbackRestorePlaceholder(albumDirectoryHandle, restoreName, targetHandle, destination)
          throw error
        }

        const parsed = parsePhotoDate(restoreName) ??
          datePartsFromTimestamp(sourceFile.lastModified) ?? {
            dateKey: photo.dateKey,
            year: photo.year,
            monthDay: photo.monthDay,
            displayDate: photo.displayDate,
            timeText: photo.timeText,
            timestamp: photo.timestamp
          }
        const restoredPhoto: PhotoItem = {
          ...parsed,
          id: `${parsed.dateKey}-${parsed.timeText}-${restoreName}`,
          name: restoreName,
          url: null,
          fileSizeText: formatFileSize(sourceFile.size),
          fileSize: sourceFile.size,
          lastModified: sourceFile.lastModified,
          fileHandle: targetHandle,
          directoryHandle: albumDirectoryHandle,
          note
        }
        releasePhotoUrl(photo)
        return { source: photo, restored: restoredPhoto }
      } catch (error) {
        reportError(error, { module: 'album-trash', action: 'restore', stage })
        if (restoreName) reservedNames.delete(restoreName)
        return { source: photo, restored: null }
      }
    },
    { concurrency: FILE_COPY_CONCURRENCY }
  )

  for (const result of results) {
    if (result.restored) {
      succeeded.push(result.source)
      restoredPhotos.push(result.restored)
    } else {
      failedNames.push(result.source.originalName)
    }
  }

  return { succeeded, restoredPhotos, failedNames }
}

/**
 * 从电脑中永久删除最近删除照片。
 * 参数：photos 为待永久删除的回收照片。
 * 返回：成功删除的回收项和失败文件名。
 */
export async function permanentlyDeleteRecentlyDeleted(
  photos: RecentlyDeletedPhoto[]
): Promise<TrashOperationResult<RecentlyDeletedPhoto>> {
  const succeeded: RecentlyDeletedPhoto[] = []
  const failedNames: string[] = []
  for (const album of new Set(photos.map(photo => photo.albumDirectoryHandle))) {
    if (album) await readAlbumMetadata(album)
  }

  const results = await runWithConcurrency(
    photos,
    async (photo) => {
      try {
        await photo.directoryHandle.removeEntry(photo.trashName)
        releasePhotoUrl(photo)
        return { photo, succeeded: true }
      } catch (error) {
        reportError(error, { module: 'album-trash', action: 'delete' })
        return { photo, succeeded: false }
      }
    },
    { concurrency: FILE_DELETE_CONCURRENCY }
  )

  for (const result of results) {
    if (result.succeeded) succeeded.push(result.photo)
    else failedNames.push(result.photo.originalName)
  }

  // 文件仍按十并发删除；之后一次清理各相册的回收备注，不让写锁串行化文件 IO。
  const albums = new Set(succeeded.map((photo) => photo.albumDirectoryHandle).filter(Boolean))
  for (const album of albums) {
    const keys = succeeded
      .filter((photo) => photo.albumDirectoryHandle === album)
      .map((photo) => photo.noteKey ?? `trash/${photo.trashName}`)
      .filter((key) => key.startsWith('trash/'))
    try {
      await transferPhotoNote(album!, keys, null, '', async () => undefined)
    } catch {
      console.warn('[trash]', { operation: 'cleanupNotes', category: 'metadataWriteFailed' })
    }
  }

  return { succeeded, failedNames }
}

/**
 * 清空应用管理的最近删除照片。仅当 trash 内条目与页面目标完全一致时递归删除目录，
 * 遇到未知文件、目录变化或递归删除失败时回退为十并发逐项删除，避免误删用户文件。
 */
export async function clearRecentlyDeleted(
  albumDirectoryHandle: FileSystemDirectoryHandle,
  photos: RecentlyDeletedPhoto[]
): Promise<TrashOperationResult<RecentlyDeletedPhoto>> {
  if (!photos.length) return { succeeded: [], failedNames: [] }

  await readAlbumMetadata(albumDirectoryHandle)
  try {
    const trashDirectoryHandle = await albumDirectoryHandle.getDirectoryHandle(TRASH_DIRECTORY_NAME)
    const expectedNames = new Set(photos.map((photo) => photo.trashName))
    let entryCount = 0
    let containsUnknownEntry = false
    for await (const [name, handle] of trashDirectoryHandle.entries()) {
      entryCount += 1
      if (handle.kind !== 'file' || !expectedNames.has(name)) containsUnknownEntry = true
    }
    if (!containsUnknownEntry && entryCount === expectedNames.size) {
      // 旧记录可能引用原名；原名后来被新照片占用时，不能清掉新照片的备注。
      const noteKeys = photos
        .map((photo) => photo.noteKey ?? `trash/${photo.trashName}`)
        .filter((key) => key.startsWith('trash/'))
      await transferPhotoNote(albumDirectoryHandle, noteKeys, null, '', () =>
        albumDirectoryHandle.removeEntry(TRASH_DIRECTORY_NAME, { recursive: true })
      )
      for (const photo of photos) releasePhotoUrl(photo)
      return { succeeded: [...photos], failedNames: [] }
    }
  } catch {
    // 目录可能已变化或浏览器拒绝递归删除，下面按单文件安全回退。
  }

  return permanentlyDeleteRecentlyDeleted(photos)
}

/**
 * 生成可持久解析的回收文件名。
 * 参数：photo 为原照片，wasFavorite 表示删除前是否收藏，deletedAt 为删除时间。
 * 返回：包含版本、删除时间、收藏状态和原文件名的回收文件名。
 */
function createTrashFileName(photo: PhotoItem, wasFavorite: boolean, deletedAt: number): string {
  const randomId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${TRASH_FILE_PREFIX}${deletedAt}__${wasFavorite ? '1' : '0'}__${randomId}__${photo.name}`
}

/**
 * 解析应用创建的回收文件名。
 * 参数：trashName 为 trash 目录中的真实文件名。
 * 返回：可恢复元数据；非应用文件返回 null。
 */
function parseTrashFileName(
  trashName: string
): { originalName: string; deletedAt: number; wasFavorite: boolean } | null {
  const match = trashName.match(/^inam-v1__(\d+)__([01])__(?:[^_]|_(?!_))+__(.+)$/)
  if (!match) return null

  const deletedAt = Number(match[1])
  if (!Number.isFinite(deletedAt) || !match[3] || /[\\/]/.test(match[3])) return null
  return { originalName: match[3], deletedAt, wasFavorite: match[2] === '1' }
}

/**
 * 将文件完整写入目标句柄，写入失败时中止流。
 * 参数：sourceFile 为源文件，targetHandle 为目标文件句柄。
 */
async function copyFileToHandle(
  sourceFile: File,
  targetHandle: FileSystemFileHandle
): Promise<void> {
  const writable = await targetHandle.createWritable()
  try {
    await writable.write(sourceFile)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort(error)
    } catch {
      // 浏览器可能已经自动关闭失败的写入流。
    }
    throw error
  }
}

/**
 * 尝试移除一次失败操作留下的目标文件。
 * 参数：directoryHandle 为目标目录，fileName 为待回滚文件名。
 */
async function rollbackFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<void> {
  try {
    await directoryHandle.removeEntry(fileName)
  } catch {
    // 回滚失败不覆盖触发回滚的原始错误。
  }
}

async function rollbackRestorePlaceholder(
  directory: FileSystemDirectoryHandle, name: string,
  expected: FileSystemFileHandle, original: File
): Promise<void> {
  try {
    const current = await directory.getFileHandle(name)
    const file = await current.getFile()
    if (await current.isSameEntry(expected) && file.size === 0 && file.lastModified === original.lastModified)
      await directory.removeEntry(name)
  } catch { /* Keep uncertain targets; the source remains available. */ }
}
