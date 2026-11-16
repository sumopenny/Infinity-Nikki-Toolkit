import { rotateImageBlob } from './imageRotation'
import { sha256Hex } from './sha256'
import type { DirectoryPhotoItem } from './photoGrouping'
import { ensureReadWritePermission } from './file-system/directoryPermission'
import { withPhotoWriteLock } from './file-system/photoWriteLock'
import { databaseRequest, runDatabaseTransaction } from './file-system/transaction'
import {
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  HOME_SCHEMES_STORE,
  HOME_IMAGES_STORE,
  CAMERA_FAVORITES_STORE,
  CAMERA_COVERS_STORE
} from './file-system/database'

const conflict = () => new Error('rotation_conflict')
const hash = async (blob: Blob) => sha256Hex(await blob.arrayBuffer())

/** Permission is requested in the click task, before waiting for the shared write lock. */
export async function rotateDirectoryPhoto(photo: DirectoryPhotoItem): Promise<File> {
  if (!(await ensureReadWritePermission(photo.directoryHandle, true)))
    throw new Error('rotation_permission')
  return withPhotoWriteLock(async () => {
    const file = await photo.fileHandle.getFile()
    if (
      (photo.fileSize !== undefined && file.size !== photo.fileSize) ||
      (photo.lastModified !== undefined && file.lastModified !== photo.lastModified)
    )
      throw conflict()
    const originalHash = await hash(file)
    const rotated = await rotateImageBlob(file)
    const current = await photo.fileHandle.getFile()
    if (current.lastModified !== file.lastModified || (await hash(current)) !== originalHash)
      throw conflict()
    const writable = await photo.fileHandle.createWritable({ keepExistingData: false })
    try {
      await writable.write(rotated)
      await writable.close()
    } catch (error) {
      await writable.abort().catch(() => undefined)
      throw error
    }
    return photo.fileHandle.getFile().catch(() => {
      throw new Error('rotation_refresh')
    })
  })
}

type StoredKind = 'outfit' | 'home' | 'camera'
interface ImageRecord {
  id: string
  blob: Blob
  size: number
  sha256: string
  extension?: string
}
interface SourceRecord {
  id: string
  updatedAt: string
  image?: string
  imageSize?: number
  cover?: { name: string; type: string; size: number; sha256: string }
}
/** Image and metadata are committed in one journaled transaction without a schema upgrade. */
export async function rotateStoredPhoto(
  kind: StoredKind,
  id: string,
  updatedAt: string
): Promise<void> {
  const [recordStore, imageStore] = {
    outfit: [OUTFITS_STORE, OUTFIT_IMAGES_STORE],
    home: [HOME_SCHEMES_STORE, HOME_IMAGES_STORE],
    camera: [CAMERA_FAVORITES_STORE, CAMERA_COVERS_STORE]
  }[kind] as [string, string]
  const read = (tx: IDBTransaction) =>
    Promise.all([
      databaseRequest<SourceRecord | undefined>(tx.objectStore(recordStore).get(id)),
      databaseRequest<ImageRecord | Blob | undefined>(tx.objectStore(imageStore).get(id))
    ])
  const [record, image] = await runDatabaseTransaction([recordStore, imageStore], 'readonly', read)
  if (!record || record.updatedAt !== updatedAt || !image) throw conflict()
  const blob = kind === 'camera' ? (image as Blob) : (image as ImageRecord).blob
  const previousHash = await hash(blob)
  const rotated = await rotateImageBlob(blob, true)
  const sha256 = await hash(rotated)
  const extension = rotated.type === 'image/jpeg' ? 'jpg' : rotated.type.split('/')[1]!
  await runDatabaseTransaction([recordStore, imageStore], 'readwrite', async (tx) => {
    const [current, currentImage] = await read(tx)
    if (JSON.stringify(current) !== JSON.stringify(record) || !currentImage) throw conflict()
    // All supported writers update image hashes and record timestamps atomically.
    const expectedHash =
      kind === 'camera' ? current?.cover?.sha256 : (currentImage as ImageRecord).sha256
    if (expectedHash !== previousHash) throw conflict()
    const now = new Date(Math.max(Date.now(), Date.parse(record.updatedAt) + 1)).toISOString()
    if (kind === 'camera') {
      if (!record.cover) throw conflict()
      tx.objectStore(imageStore).put(rotated, id)
      tx.objectStore(recordStore).put({
        ...record,
        updatedAt: now,
        cover: {
          ...record.cover,
          name: record.cover.name.replace(/\.[^.]+$/, '') + `.${extension}`,
          type: rotated.type,
          size: rotated.size,
          sha256
        }
      })
    } else {
      tx.objectStore(imageStore).put({ id, blob: rotated, size: rotated.size, sha256, extension })
      tx.objectStore(recordStore).put({
        ...record,
        updatedAt: now,
        image: `${id}.${extension}`,
        ...(kind === 'outfit' ? { imageSize: rotated.size } : {})
      })
    }
  })
}
