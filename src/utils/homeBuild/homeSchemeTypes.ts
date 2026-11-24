import { STORED_IMAGE_EXTENSIONS } from '../storedImage'
import { createUuid } from '../uuid'

export const MAX_HOME_SCHEME_TAGS = 40
export const MAX_HOME_SCHEME_TAG_LENGTH = 5
export const MAX_HOME_SCHEME_NOTE_LENGTH = 15
export const MAX_HOME_SCHEME_CODE_LENGTH = 30

export type HomeSchemeType = 'home' | 'combo'

export interface HomeSchemeMetadata {
  version: string | null
  furnitureCount: number | null
  server: number | null
  lastModifyTime: number | null
  coverImageUrl: string | null
}

export interface HomeSchemeRecord {
  version: 1
  id: string
  image: string | null
  code: string
  name: string
  schemeType: HomeSchemeType
  tags: string[]
  note: string
  createdAt: string
  updatedAt: string
  metadata: HomeSchemeMetadata
}

export interface HomeSchemeItem extends HomeSchemeRecord {
  imageUrl: string | null
}

export function normalizeHomeSchemeMetadata(value: unknown): HomeSchemeMetadata {
  const raw = value && typeof value === 'object' ? (value as Partial<HomeSchemeMetadata>) : {}
  return {
    version: typeof raw.version === 'string' ? raw.version : null,
    furnitureCount:
      typeof raw.furnitureCount === 'number' && Number.isFinite(raw.furnitureCount)
        ? raw.furnitureCount
        : null,
    server: typeof raw.server === 'number' && Number.isFinite(raw.server) ? raw.server : null,
    lastModifyTime:
      typeof raw.lastModifyTime === 'number' && Number.isFinite(raw.lastModifyTime)
        ? raw.lastModifyTime
        : null,
    coverImageUrl: typeof raw.coverImageUrl === 'string' ? raw.coverImageUrl : null
  }
}

export function createHomeSchemeId(): string {
  return createUuid()
}

export function isSafeHomeSchemeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/\0]/.test(value)
  )
}

/** Shared validation for database writes and backups. */
export function normalizeHomeSchemeRecord(value: unknown): HomeSchemeRecord {
  if (!value || typeof value !== 'object') throw new Error('home_scheme_record_invalid')
  const raw = value as Partial<HomeSchemeRecord>
  if (
    raw.version !== 1 ||
    !isSafeHomeSchemeId(raw.id) ||
    typeof raw.code !== 'string' ||
    typeof raw.name !== 'string' ||
    !raw.name.trim() ||
    (raw.schemeType !== 'home' && raw.schemeType !== 'combo') ||
    !Array.isArray(raw.tags) ||
    typeof raw.note !== 'string' ||
    raw.note.length > MAX_HOME_SCHEME_NOTE_LENGTH ||
    typeof raw.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.createdAt)) ||
    typeof raw.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.updatedAt)) ||
    (raw.image !== null &&
      (typeof raw.image !== 'string' ||
        !STORED_IMAGE_EXTENSIONS.some((extension) => raw.image === `${raw.id}.${extension}`)))
  )
    throw new Error('home_scheme_record_invalid')
  const code = normalizeHomeSchemeCode(raw.code)
  if (code.length < 2 || code.length > MAX_HOME_SCHEME_CODE_LENGTH)
    throw new Error('home_scheme_code_invalid')
  const tags = [...new Set(raw.tags.map(normalizeHomeSchemeTag))]
  if (tags.length > 1 || tags.some((tag) => !isValidHomeSchemeTag(tag)))
    throw new Error('home_scheme_tag_invalid')
  return {
    version: 1,
    id: raw.id,
    image: raw.image,
    code,
    name: raw.name.trim(),
    schemeType: raw.schemeType,
    metadata: normalizeHomeSchemeMetadata(raw.metadata),
    tags,
    note: raw.note.trim(),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  }
}

export interface SaveHomeSchemeInput {
  item?: HomeSchemeItem
  id?: string
  createdAt?: string
  updatedAt?: string
  code: string
  name: string
  schemeType: HomeSchemeType
  tags: string[]
  note: string
  metadata: HomeSchemeMetadata
  imageFile?: File | null
  removeImage?: boolean
}

export function normalizeHomeSchemeCode(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s/g, '').trim() : ''
}

export function normalizeHomeSchemeTag(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isValidHomeSchemeTag(value: string): boolean {
  return [...value].length > 0 && [...value].length <= MAX_HOME_SCHEME_TAG_LENGTH
}
