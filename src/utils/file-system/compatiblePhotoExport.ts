import { throwIfSignalAborted } from '../abortSignal'
import { readPhotoFile, type PhotoItem } from '../photoGrouping'
import {
  streamBackupPart,
  backupPartName,
  planBackupParts,
  HOME_BACKUP_LIMITS
} from '../backup/zipBackup'

/** 将兼容照片和备注分包下载；支持取消，不申请或写入所选源目录。 */
export async function exportCompatiblePhotos(
  photos: PhotoItem[],
  signal: AbortSignal,
  onPart: (file: File) => void,
  onProgress: (completed: number) => void
): Promise<void> {
  const items = []
  for (const photo of photos) {
    throwIfSignalAborted(signal)
    items.push({
      record: {
        name: photo.name,
        note: photo.note ?? '',
        ...(photo.favorite === undefined ? {} : { favorite: photo.favorite })
      },
      files: [{ name: photo.name, blob: await readPhotoFile(photo) }]
    })
  }
  const parts = planBackupParts(
    items,
    (records) => ({
      version: 1,
      photos: Object.fromEntries(records.map(({ name, ...metadata }) => [name, metadata]))
    }),
    'album-metadata.json',
    HOME_BACKUP_LIMITS
  )
  let completed = 0
  for (let index = 0; index < parts.length; index++) {
    throwIfSignalAborted(signal)
    const chunks: Uint8Array[] = []
    await streamBackupPart(
      parts[index],
      'album-metadata.json',
      HOME_BACKUP_LIMITS,
      async (chunk) => {
        throwIfSignalAborted(signal)
        chunks.push(chunk.slice())
      }
    )
    const blob = new Blob(chunks, { type: 'application/zip' })
    throwIfSignalAborted(signal)
    onPart(
      new File([blob], backupPartName('album-photos', index, parts.length), {
        type: 'application/zip'
      })
    )
    completed += parts[index].count
    onProgress(completed)
  }
}
