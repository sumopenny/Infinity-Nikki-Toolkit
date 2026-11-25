import {
  CAMERA_COVERS_STORE,
  CAMERA_FAVORITES_STORE,
  CAMERA_TAGS_STORE,
  HOME_IMAGES_STORE,
  HOME_SCHEMES_STORE,
  HOME_TAGS_STORE,
  OUTFIT_IMAGES_STORE,
  OUTFIT_TAGS_STORE,
  OUTFITS_STORE
} from '../file-system/database'
import { normalizeOutfitRecord, normalizeOutfitTagList } from '../outfit/outfitTypes'
import {
  normalizeHomeSchemeRecord,
  normalizeHomeSchemeTag,
  isValidHomeSchemeTag,
  MAX_HOME_SCHEME_TAGS
} from '../homeBuild/homeSchemeTypes'
import { validateFavorite, LEGACY_CAMERA_FAVORITE_TAG_LENGTH } from '../photo-params/favorites'
import { inspectStoredImage, matchesStoredImageExtension } from '../storedImage'
import { digest } from './disk'
import type { BackupModule } from './changeJournal'

export interface BackupRecord {
  id: string
  image?: string | null
  imageSize?: number
  cover?: { sha256: string; size: number; type: string } | null
  code?: string
  tags?: string[]
  tag?: string
}
export interface StoredImage {
  id: string
  blob: Blob
  size: number
  sha256: string
  extension?: string
}
export interface BackupAdapter {
  records: string
  images: string
  tags: string
  tagKey: string
  validate: (value: unknown) => BackupRecord
  imageValue: 'blobRecord' | 'blob'
}
export const ADAPTERS: Record<BackupModule, BackupAdapter> = {
  outfits: {
    records: OUTFITS_STORE,
    images: OUTFIT_IMAGES_STORE,
    tags: OUTFIT_TAGS_STORE,
    tagKey: 'default',
    validate: normalizeOutfitRecord,
    imageValue: 'blobRecord'
  },
  home: {
    records: HOME_SCHEMES_STORE,
    images: HOME_IMAGES_STORE,
    tags: HOME_TAGS_STORE,
    tagKey: 'default',
    validate: normalizeHomeSchemeRecord,
    imageValue: 'blobRecord'
  },
  camera: {
    records: CAMERA_FAVORITES_STORE,
    images: CAMERA_COVERS_STORE,
    tags: CAMERA_TAGS_STORE,
    tagKey: 'order',
    validate: validateFavorite,
    imageValue: 'blob'
  }
}
export function normalTags(module: BackupModule, raw: unknown): string[] {
  const value = raw ?? []
  if (module === 'outfits') return normalizeOutfitTagList(value)
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string'))
    throw new Error('标签格式无效')
  if (new Set(value).size !== value.length) throw new Error('标签存在重复项')
  if (module === 'home') {
    if (
      value.length > MAX_HOME_SCHEME_TAGS ||
      value.some((tag) => tag !== normalizeHomeSchemeTag(tag) || !isValidHomeSchemeTag(tag))
    )
      throw new Error('家园标签格式无效')
  } else if (
    value.some(
      (tag) =>
        !tag ||
        tag !== tag.trim() ||
        tag.length > LEGACY_CAMERA_FAVORITE_TAG_LENGTH ||
        /[,，]/.test(tag)
    )
  ) {
    throw new Error('相机标签格式无效')
  }
  return value
}
export const presentImage = (module: BackupModule, record: BackupRecord): boolean =>
  module === 'camera' ? Boolean(record.cover) : Boolean(record.image)
export function needsImage(
  module: BackupModule,
  previous: BackupRecord | undefined,
  record: BackupRecord
): boolean {
  return (
    !previous ||
    (module === 'camera'
      ? JSON.stringify(previous.cover) !== JSON.stringify(record.cover)
      : previous.image !== record.image)
  )
}
export function assertTags(record: BackupRecord, tags: string[]) {
  if (record.tags?.some((tag) => !tags.includes(tag)) || (record.tag && !tags.includes(record.tag)))
    throw new Error(`记录引用了不存在的标签：${record.id}`)
}
export function imageBlob(module: BackupModule, value: unknown): Blob {
  const blob = module === 'camera' ? value : (value as StoredImage | undefined)?.blob
  if (
    !(blob instanceof Blob) ||
    !blob.size ||
    (module !== 'camera' && (value as StoredImage).size !== blob.size)
  )
    throw new Error('数据库图片缺失或大小不符')
  return blob
}
export async function checkedImage(
  module: BackupModule,
  record: BackupRecord,
  raw: unknown,
  decode = false
) {
  const blob = imageBlob(module, raw)
  const image = await inspectStoredImage(blob, decode)
  const sha256 = await digest(image.bytes)
  if (module === 'camera') {
    if (record.cover?.sha256 !== sha256 || record.cover.size !== blob.size)
      throw new Error('相机封面与记录不符')
  } else {
    const stored = raw as StoredImage
    if (
      (stored.sha256 && stored.sha256 !== sha256) ||
      !matchesStoredImageExtension(record.image!, image.extension) ||
      (record.imageSize !== undefined && record.imageSize !== blob.size)
    )
      throw new Error('图片摘要、类型或业务记录不符')
  }
  return {
    blob: image.blob,
    sha256,
    extension: image.extension,
    size: blob.size,
    type: image.blob.type
  }
}
