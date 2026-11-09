import { isValidSourceUrl } from './outfitSourceUrl'
import { STORED_IMAGE_EXTENSIONS } from '../storedImage'
import type { PhotoDisplayItem } from '../photoGrouping'
import { createUuid } from '../uuid'

export const DEFAULT_OUTFIT_TAGS = ['甜美', '性感', '帅气', '典雅', '清新', '古典']
export const MAX_OUTFIT_TAGS = 40
export const MAX_OUTFIT_TAG_LENGTH = 5
export const MAX_OUTFIT_CODE_LENGTH = 30
export const MAX_OUTFIT_NOTE_LENGTH = 15
const RESERVED_OUTFIT_TAGS = new Set([
  '全部',
  '待填写',
  '未分类',
  'all',
  'pending',
  'uncategorized'
])

export interface OutfitRecord {
  version: 1
  id: string
  image: string
  code: string
  imageSize?: number
  codeKey?: string
  tags: string[]
  note: string
  createdAt: string
  updatedAt: string
  diyImageModifiedAt?: number
  sourceUrl?: string
  sourcePlayerId?: string
  gameSourceId?: string
}
export type OutfitItem = PhotoDisplayItem & OutfitRecord
export interface OutfitMigrationResult {
  addedCount: number
  replacedCount: number
  skippedCount: number
  failedCount: number
  tagsChanged: boolean
  clotheDirectoryRemoved: boolean
  failures: { fileName: string; message: string; errorName: string }[]
}
export interface OutfitLibraryResult {
  unreadableCount?: number
  outfits: OutfitItem[]
  tags: string[]
  importedSharedCount: number
  failedCount: number
  sharedFailureStage?: SharedOutfitImportResult['failureStage']
  migration?: OutfitMigrationResult
}
export interface SharedOutfitSource {
  x6GameDirectory: FileSystemDirectoryHandle
}
export interface SharedOutfitImportResult {
  importedCount: number
  duplicateCount: number
  failedCount: number
  failureStage?:
    'duplicate' | 'missing-image' | 'image-not-updated' | 'source-changed' | 'image-write-failed'
}
export interface SaveOutfitInput {
  outfit?: OutfitItem
  imageFile?: File
  code: string
  tag: string | null
  note?: string
  sourceUrl?: string
}
export interface OutfitImportResult {
  addedCount: number
  duplicateCount: number
  failedCount: number
  rejectedTagCount: number
  library: OutfitLibraryResult
}
export interface OutfitDeleteResult {
  deleted: OutfitItem[]
  failedNames: string[]
}
export class DuplicateOutfitCodeError extends Error {
  constructor() {
    super('outfit_code_duplicate')
    this.name = 'DuplicateOutfitCodeError'
  }
}

export function createOutfitId(): string {
  return createUuid()
}
export function isSafeOutfitId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/\0]/.test(value)
  )
}
export function normalizeOutfitCode(value: unknown): string {
  return (typeof value === 'string' ? value : '')
    .replace(/\s/g, '')
    .slice(0, MAX_OUTFIT_CODE_LENGTH)
}
export function normalizeOutfitTag(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
export function isValidOutfitTag(value: string): boolean {
  return value.length > 0 && [...value].length <= MAX_OUTFIT_TAG_LENGTH
}
export function isReservedOutfitTag(value: string): boolean {
  return RESERVED_OUTFIT_TAGS.has(value.toLowerCase())
}
export function normalizeOutfitTagList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('outfit_tags_invalid')
  const tags = [...new Set(value.map(normalizeOutfitTag))]
  if (
    tags.length > MAX_OUTFIT_TAGS ||
    tags.some((tag) => !isValidOutfitTag(tag) || isReservedOutfitTag(tag))
  )
    throw new Error('outfit_tags_invalid')
  return tags
}

/** Shared validation for database records, legacy files and ZIP metadata. */
export function normalizeOutfitRecord(value: unknown): OutfitRecord {
  if (!value || typeof value !== 'object') throw new Error('outfit_record_invalid')
  const raw = value as Partial<OutfitRecord>
  if (
    raw.version !== 1 ||
    !isSafeOutfitId(raw.id) ||
    typeof raw.image !== 'string' ||
    (raw.image !== '' &&
      !STORED_IMAGE_EXTENSIONS.some((extension) => raw.image === `${raw.id}.${extension}`)) ||
    typeof raw.code !== 'string' ||
    raw.code.replace(/\s/g, '').length > MAX_OUTFIT_CODE_LENGTH ||
    !Array.isArray(raw.tags) ||
    raw.tags.length > 1 ||
    typeof raw.note !== 'string' ||
    raw.note.length > MAX_OUTFIT_NOTE_LENGTH ||
    typeof raw.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.createdAt)) ||
    typeof raw.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.updatedAt))
  )
    throw new Error('outfit_record_invalid')
  const tags = raw.tags.map(normalizeOutfitTag)
  if (tags.some((tag) => !isValidOutfitTag(tag) || isReservedOutfitTag(tag)))
    throw new Error('outfit_tag_invalid')
  const code = normalizeOutfitCode(raw.code)
  if (!raw.image && (!code || raw.imageSize !== undefined)) throw new Error('outfit_record_invalid')
  const record: OutfitRecord = {
    version: 1,
    id: raw.id,
    image: raw.image,
    code,
    ...(code ? { codeKey: code } : {}),
    tags,
    note: raw.note.trim(),
    createdAt: new Date(raw.createdAt).toISOString(),
    updatedAt: new Date(raw.updatedAt).toISOString()
  }
  if (raw.sourceUrl !== undefined && raw.sourceUrl !== '') {
    if (typeof raw.sourceUrl !== 'string' || !isValidSourceUrl(raw.sourceUrl))
      throw new Error('outfit_source_url_invalid')
    record.sourceUrl = raw.sourceUrl
  }
  if (raw.imageSize !== undefined) {
    if (!Number.isSafeInteger(raw.imageSize) || raw.imageSize <= 0)
      throw new Error('outfit_image_invalid')
    record.imageSize = raw.imageSize
  }
  if (raw.diyImageModifiedAt !== undefined) {
    if (!Number.isFinite(raw.diyImageModifiedAt) || raw.diyImageModifiedAt < 0)
      throw new Error('outfit_image_time_invalid')
    record.diyImageModifiedAt = raw.diyImageModifiedAt
  }
  if (raw.sourcePlayerId !== undefined) {
    if (typeof raw.sourcePlayerId !== 'string' || !/^\d+$/.test(raw.sourcePlayerId))
      throw new Error('outfit_player_invalid')
    record.sourcePlayerId = raw.sourcePlayerId
  }
  if (raw.gameSourceId !== undefined) {
    if (!isSafeOutfitId(raw.gameSourceId)) throw new Error('outfit_game_source_invalid')
    record.gameSourceId = raw.gameSourceId
  }
  return record
}
