import { PHOTO_IMAGE_EXTENSIONS as IMAGE_EXTENSIONS } from './imageFormats'
// 相册文件系统：负责相册目录读取、照片扫描和增量刷新。
import {
  datePartsFromTimestamp,
  parsePhotoDate,
  type PhotoItem,
  type RecentlyDeletedPhoto
} from '../photoGrouping'
import type { LocaleMessages } from '../../i18n'
import { readAlbumMetadata, savePhotoNote, inspectAlbumNotes, type AlbumNoteSnapshot, type AlbumMetadata } from './photoMetadata'
import { PHOTO_NOTE_LIMIT, normalizePhotoNote } from './photoMetadata'
import { ensurePhotoUrl, resetPhotoUrl, releasePhotoUrl, releasePhotoUrls } from './photoUrl'
import {
  saveAlbumDirectoryHandle,
  getSavedAlbumDirectoryHandle,
  clearSavedAlbumDirectoryHandle
} from './directoryStorage'
import { listRecentlyDeleted } from './trashFileSystem'
import { runWithConcurrency } from '../concurrency'
import { createDirectoryError, normalizeDirectoryError } from './directoryErrors'


const SCAN_CONCURRENCY = 6

export interface AlbumDirectoryResult {
  notes?: AlbumNoteSnapshot
  directoryName: string
  directoryHandle: FileSystemDirectoryHandle
  photos: PhotoItem[]
}

export { PHOTO_NOTE_LIMIT, normalizePhotoNote, readAlbumMetadata, savePhotoNote }
export type { AlbumMetadata }

type FileSystemMessages = LocaleMessages['fileSystem']

function isMobileDevice(): boolean {
  return (
    /android|iphone|ipod|ipad/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function getSupportedDirectoryPicker(
  messages: FileSystemMessages
): NonNullable<typeof window.showDirectoryPicker> {
  if (isMobileDevice()) throw new Error(messages.mobileBrowserUnsupported)
  if (!window.showDirectoryPicker) throw new Error(messages.unsupportedBrowser)
  return window.showDirectoryPicker
}

export interface RefreshAlbumPhotosResult extends AlbumDirectoryResult {
  addedCount: number
  removedCount: number
  removedPhotos: PhotoItem[]
  replacedPhotos: PhotoItem[]
}

export interface RefreshAlbumResult extends RefreshAlbumPhotosResult {
  recentlyDeleted: RecentlyDeletedPhoto[]
}

function isImageFile(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(extension)
}

import { formatFileSize } from './photoUrl'
export { formatFileSize, ensurePhotoUrl, resetPhotoUrl, releasePhotoUrl, releasePhotoUrls }

async function ensureReadWritePermission(
  directoryHandle: FileSystemDirectoryHandle,
  requestPermission: boolean
): Promise<boolean> {
  const options = { mode: 'readwrite' as const }
  if (directoryHandle.queryPermission) {
    const current = await directoryHandle.queryPermission(options)
    if (current === 'granted') return true
    if (!requestPermission) return false
  }

  if (!requestPermission && directoryHandle.requestPermission) return false
  if (!directoryHandle.requestPermission) return true
  return (await directoryHandle.requestPermission(options)) === 'granted'
}

export { saveAlbumDirectoryHandle, getSavedAlbumDirectoryHandle, clearSavedAlbumDirectoryHandle }

/**
 * 扫描相册目录并整理照片元数据，不在扫描阶段读取原图内容。
 * 参数：directoryHandle 为相册目录句柄，options 为权限策略和错误提示文案。
 * 返回：相册名称、目录句柄和按拍摄时间排序的照片列表。
 */
export async function readAlbumDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  options: { requestPermission?: boolean; messages: FileSystemMessages }
): Promise<AlbumDirectoryResult> {
  const hasPermission = await ensureReadWritePermission(
    directoryHandle,
    options.requestPermission ?? true
  )
  if (!hasPermission) {
    throw createDirectoryError('permission-denied', options.messages)
  }

  try {
    const notes = await inspectAlbumNotes(directoryHandle)
    const metadata = notes.metadata
    const photos = await scanAlbumPhotos(directoryHandle, metadata)
    return {
      notes,
      directoryName: directoryHandle.name,
      directoryHandle,
      photos
    }
  } catch (error) {
    throw normalizeDirectoryError(error, options.messages)
  }
}

/**
 * 增量刷新相册并复用未变化照片的对象地址。
 * 参数：directoryHandle 为当前相册目录，currentPhotos 为页面已有照片，options 为权限和文案。
 * 返回：合并后的照片、变化数量和最近删除列表。
 */
export async function refreshAlbumPhotos(
  directoryHandle: FileSystemDirectoryHandle,
  currentPhotos: PhotoItem[],
  options: { requestPermission?: boolean; messages: FileSystemMessages }
): Promise<RefreshAlbumPhotosResult> {
  const hasPermission = await ensureReadWritePermission(
    directoryHandle,
    options.requestPermission ?? false
  )
  if (!hasPermission) throw createDirectoryError('permission-denied', options.messages)

  try {
    const notes = await inspectAlbumNotes(directoryHandle)
    const metadata = notes.metadata
    const scannedPhotos = await scanAlbumPhotos(directoryHandle, metadata)
    const currentByName = new Map(currentPhotos.map((photo) => [photo.name, photo]))
    const scannedNames = new Set(scannedPhotos.map((photo) => photo.name))
    let addedCount = 0
    const replacedPhotos: PhotoItem[] = []
    const photos = scannedPhotos.map((photo) => {
      const existing = currentByName.get(photo.name)
      if (
        existing &&
        existing.fileSize !== undefined &&
        existing.lastModified !== undefined &&
        existing.fileSize === photo.fileSize &&
        existing.lastModified === photo.lastModified
      ) {
        // 原图未变时复用地址，但备注独立保存在元数据文件中，必须采用最新扫描值。
        existing.note = photo.note
        return existing
      }
      if (existing) {
        replacedPhotos.push(existing)
        return photo
      }
      addedCount += 1
      return photo
    })
    const removedPhotos = currentPhotos.filter((photo) => !scannedNames.has(photo.name))

    return {
      notes,
      directoryName: directoryHandle.name,
      directoryHandle,
      photos,
      addedCount,
      removedCount: removedPhotos.length,
      removedPhotos,
      replacedPhotos
    }
  } catch (error) {
    throw normalizeDirectoryError(error, options.messages)
  }
}

/** 兼容入口：并行刷新相册照片和最近删除。新编排流程可分别调用两个扫描函数。 */
export async function refreshAlbumDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  currentPhotos: PhotoItem[],
  options: { requestPermission?: boolean; messages: FileSystemMessages }
): Promise<RefreshAlbumResult> {
  const album = await refreshAlbumPhotos(directoryHandle, currentPhotos, options)
  const recentlyDeleted = await listRecentlyDeleted(directoryHandle, album.notes?.metadata.photos)
  return { ...album, recentlyDeleted }
}

export async function pickAlbumDirectory(
  messages: FileSystemMessages
): Promise<AlbumDirectoryResult> {
  const showDirectoryPicker = getSupportedDirectoryPicker(messages)

  try {
    const directoryHandle = await showDirectoryPicker({
      id: 'infinity-nikki-album',
      mode: 'readwrite',
      startIn: 'pictures'
    })

    return await readAlbumDirectory(directoryHandle, { requestPermission: true, messages })
  } catch (error) {
    throw normalizeDirectoryError(error, messages)
  }
}

/**
 * 根据文件名和句柄创建相册照片状态。
 * 参数：name 为文件名，fileHandle 为文件句柄，directoryHandle 为所属目录。
 * 返回：照片元数据；文件名无法解析且文件时间不可读时返回 null。
 */
async function createPhotoItem(
  name: string,
  fileHandle: FileSystemFileHandle,
  directoryHandle: FileSystemDirectoryHandle,
  metadata: AlbumMetadata = { version: 1, photos: {} }
): Promise<PhotoItem | null> {
  let fileSize: number | undefined
  let lastModified: number | undefined
  try {
    const file = await fileHandle.getFile()
    fileSize = file.size
    lastModified = file.lastModified
  } catch {
    // 文件名不规范时必须读取文件时间；读取失败则无法可靠分组，跳过该文件。
  }
  const parsed =
    parsePhotoDate(name) ??
    (lastModified === undefined ? null : datePartsFromTimestamp(lastModified))
  if (!parsed) return null

  return {
    id: `${parsed.dateKey}-${parsed.timeText}-${name}`,
    name,
    url: null,
    fileSizeText: fileSize === undefined ? '--' : formatFileSize(fileSize),
    fileSize,
    lastModified,
    fileHandle,
    directoryHandle,
    note: normalizePhotoNote(metadata.photos[name]?.note),
    ...parsed
  }
}

/**
 * 扫描相册根目录中的有效图片，不进入任何子目录。
 * 参数：directoryHandle 为当前相册目录。
 * 返回：按拍摄时间倒序排列的照片列表。
 */
async function scanAlbumPhotos(
  directoryHandle: FileSystemDirectoryHandle,
  metadata: AlbumMetadata = { version: 1, photos: {} }
): Promise<PhotoItem[]> {
  const imageHandles: Array<{ name: string; handle: FileSystemFileHandle }> = []
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind !== 'file' || !isImageFile(name)) continue
    imageHandles.push({ name, handle: handle as FileSystemFileHandle })
  }

  const scannedPhotos = await runWithConcurrency(
    imageHandles,
    ({ name, handle }) => createPhotoItem(name, handle, directoryHandle, metadata),
    { concurrency: SCAN_CONCURRENCY }
  )
  const photos = scannedPhotos.filter((photo): photo is PhotoItem => Boolean(photo))
  return photos.sort((a, b) => b.timestamp - a.timestamp)
}
