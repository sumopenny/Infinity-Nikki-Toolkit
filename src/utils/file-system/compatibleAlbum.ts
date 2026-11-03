// 传统文件夹选择只提供 File 快照，不具备可写目录句柄。
import { datePartsFromTimestamp, parsePhotoDate, type FilePhotoItem } from '../photoGrouping'
import { formatFileSize } from './photoUrl'
import { normalizePhotoNote, inspectAlbumNotes, type AlbumNoteSnapshot } from './photoMetadata'

export interface CompatibleAlbumResult {
  directoryName: string
  notes: AlbumNoteSnapshot
  photos: FilePhotoItem[]
}

export async function readCompatibleAlbum(files: File[]): Promise<CompatibleAlbumResult> {
  const root = files[0]?.webkitRelativePath.split('/')[0]
  if (!root || files.some((file) => file.webkitRelativePath.split('/')[0] !== root))
    throw new Error('Invalid folder selection')
  const directFiles = files.filter((file) => file.webkitRelativePath.split('/').length === 2)
  const notes = await inspectAlbumNotes(
    async (name) => directFiles.find((file) => file.name === name),
    'compatible'
  )
  const metadata = notes.metadata
  const photos: FilePhotoItem[] = []
  for (const file of directFiles) {
    if (!/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) continue
    const parsed = parsePhotoDate(file.name) ?? datePartsFromTimestamp(file.lastModified)
    if (!parsed) continue
    photos.push({
      source: 'file',
      file,
      // 浏览器不提供绝对路径：按相对路径、大小、修改时间区分快照；完全相同的副本共用收藏。
      id: `compat:${JSON.stringify([file.webkitRelativePath, file.size, file.lastModified])}`,
      name: file.name,
      url: null,
      fileSize: file.size,
      lastModified: file.lastModified,
      fileSizeText: formatFileSize(file.size),
      note: normalizePhotoNote(metadata.photos[file.name]?.note ?? ''),
      ...parsed
    })
  }
  return { directoryName: root, notes, photos: photos.sort((a, b) => b.timestamp - a.timestamp) }
}
