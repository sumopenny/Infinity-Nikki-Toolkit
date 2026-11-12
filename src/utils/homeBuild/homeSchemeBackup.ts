import { STORED_IMAGE_EXTENSIONS, matchesStoredImageExtension } from '../storedImage'
import { backupBaseName } from '../backup/backupName'
import { strFromU8, Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import {
  HOME_BACKUP_LIMITS,
  planBackupParts,
  downloadBackupParts,
  downloadBackupBlob,
  type BackupDownload
} from '../backup/zipBackup'
import { HOME_SCHEMES_STORE, HOME_IMAGES_STORE, HOME_TAGS_STORE } from '../file-system/database'
import {
  homeRequest,
  homeTransaction,
  readHomeSchemeSnapshot,
  readHomeSchemeLibrary,
  normalizeHomeSchemeTags,
  prepareHomeSchemeImage,
  type PreparedHomeSchemeImage
} from './homeSchemeStorage'
import {
  createHomeSchemeId,
  normalizeHomeSchemeRecord,
  normalizeHomeSchemeCode,
  normalizeHomeSchemeTag,
  type HomeSchemeRecord,
  type HomeSchemeItem,
  type HomeSchemeMetadata
} from './homeSchemeTypes'

const BACKUP_FORMAT = 'infinity-nikki-home-scheme-backup'
const BACKUP_VERSION = 2
const MAX_BACKUP_BYTES = HOME_BACKUP_LIMITS.bytes
const MAX_IMAGE_BYTES = HOME_BACKUP_LIMITS.image
const MAX_ENTRIES = HOME_BACKUP_LIMITS.entries

interface BackupScheme {
  id: string
  image: string | null
  code: string
  name: string
  schemeType: 'home' | 'combo'
  tags: string[]
  note: string
  metadata?: HomeSchemeMetadata
  createdAt: string
  updatedAt: string
}

interface BackupManifest {
  format: string
  version: number
  exportedAt: string
  tags: string[]
  homeSchemes: BackupScheme[]
}

function isSafePath(path: string): boolean {
  return (
    Boolean(path) &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    path.split('/').every((part) => part && part !== '.' && part !== '..')
  )
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/\0]/.test(value)
  )
}

function normalizeBackupMetadata(value: unknown): HomeSchemeMetadata {
  const raw = value && typeof value === 'object' ? (value as Partial<HomeSchemeMetadata>) : {}
  return {
    version: typeof raw.version === 'string' ? raw.version : null,
    furnitureCount: typeof raw.furnitureCount === 'number' ? raw.furnitureCount : null,
    server: typeof raw.server === 'number' ? raw.server : null,
    lastModifyTime: typeof raw.lastModifyTime === 'number' ? raw.lastModifyTime : null,
    coverImageUrl: typeof raw.coverImageUrl === 'string' ? raw.coverImageUrl : null
  }
}

function normalizeBackupDate(value: unknown, fallback: string): string {
  const timestamp = typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback
}

export async function exportHomeSchemeBackup(
  download?: BackupDownload
): Promise<{ fileNames: string[]; count: number }> {
  const library = await readHomeSchemeSnapshot()
  const exportedAt = new Date().toISOString()
  const items = []
  for (const scheme of library.records) {
    const image = scheme.image ? 'images/' + scheme.image : null
    const cover = library.images.get(scheme.id)
    if (image && cover) {
      const checked = await prepareHomeSchemeImage(cover.blob, scheme.id)
      if (checked.sha256 !== cover.sha256 || !matchesStoredImageExtension(image, checked.extension))
        throw new Error('home_scheme_image_invalid')
    }
    items.push({
      record: {
        id: scheme.id,
        image,
        code: scheme.code,
        name: scheme.name,
        schemeType: scheme.schemeType,
        tags: scheme.tags,
        note: scheme.note,
        metadata: scheme.metadata,
        createdAt: scheme.createdAt,
        updatedAt: scheme.updatedAt
      },
      files: image && cover ? [{ name: image, blob: cover.blob }] : []
    })
  }
  const parts = planBackupParts(
    items,
    (homeSchemes) => ({
      format: BACKUP_FORMAT,
      version: library.records.every((record) => !record.image || record.image.endsWith('.webp'))
        ? 1
        : BACKUP_VERSION,
      exportedAt,
      tags: library.tags,
      homeSchemes
    }),
    'manifest.json',
    HOME_BACKUP_LIMITS
  )
  const fileNames = await downloadBackupParts(
    backupBaseName('家园方案'),
    parts,
    'manifest.json',
    HOME_BACKUP_LIMITS,
    download ?? ((name, blob) => downloadBackupBlob(name, blob, 'home'))
  )
  return { fileNames, count: library.records.length }
}

async function extractBackup(file: File): Promise<Map<string, Uint8Array>> {
  if (!file.size || file.size > MAX_BACKUP_BYTES) throw new Error('home_scheme_backup_size_invalid')
  const entries = new Map<string, Uint8Array>()
  let count = 0,
    expandedBytes = 0,
    failure: Error | null = null
  const unzip = new Unzip((entry) => {
    try {
      count += 1
      if (count > MAX_ENTRIES) throw new Error('home_scheme_backup_path_invalid')
      if (entry.name === 'images/' && entry.originalSize === 0) {
        entry.ondata = (error, chunk) => {
          if (error || chunk?.length) failure = new Error('home_scheme_backup_entry_invalid')
        }
        entry.start()
        return
      }
      if (!isSafePath(entry.name)) throw new Error('home_scheme_backup_path_invalid')
      const manifest = entry.name === 'manifest.json'
      if (!manifest && !/^images\/[^/]+\.(webp|png|jpe?g|gif|bmp|avif)$/i.test(entry.name))
        throw new Error('home_scheme_backup_entry_invalid')
      const chunks: Uint8Array[] = []
      let size = 0
      entry.ondata = (error, chunk, final) => {
        if (error) {
          failure = error
          entry.terminate()
          return
        }
        if (chunk?.byteLength) {
          size += chunk.byteLength
          expandedBytes += chunk.byteLength
          if (
            (manifest && size > HOME_BACKUP_LIMITS.manifest) ||
            (!manifest && size > MAX_IMAGE_BYTES) ||
            expandedBytes > MAX_BACKUP_BYTES
          ) {
            failure = new Error('home_scheme_backup_expanded_size_invalid')
            entry.terminate()
            return
          }
          chunks.push(chunk)
        }
        if (final && !failure) {
          if (entries.has(entry.name)) {
            failure = new Error('home_scheme_backup_duplicate_entry')
            return
          }
          const bytes = new Uint8Array(size)
          let offset = 0
          for (const part of chunks) {
            bytes.set(part, offset)
            offset += part.byteLength
          }
          entries.set(entry.name, bytes)
        }
      }
      entry.start()
    } catch (error) {
      failure = error instanceof Error ? error : new Error('home_scheme_backup_invalid')
    }
  })
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)
  const reader = file.stream().getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      unzip.push(value ?? new Uint8Array(), done)
      if (failure) throw failure
      if (done) break
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  return entries
}

function parseManifest(entries: Map<string, Uint8Array>): BackupManifest {
  const bytes = entries.get('manifest.json')
  if (!bytes) throw new Error('home_scheme_backup_manifest_missing')
  const raw: unknown = JSON.parse(strFromU8(bytes))
  if (!raw || typeof raw !== 'object') throw new Error('home_scheme_backup_manifest_invalid')
  const manifest = raw as Partial<BackupManifest>
  if (
    manifest.format !== BACKUP_FORMAT ||
    typeof manifest.version !== 'number' ||
    ![1, BACKUP_VERSION].includes(manifest.version) ||
    !Array.isArray(manifest.homeSchemes) ||
    !Array.isArray(manifest.tags)
  )
    throw new Error('home_scheme_backup_format_unsupported')
  for (const item of manifest.homeSchemes) {
    if (
      !item ||
      !isSafeId(item.id) ||
      typeof item.name !== 'string' ||
      typeof item.code !== 'string' ||
      (item.schemeType !== 'home' && item.schemeType !== 'combo') ||
      !Array.isArray(item.tags) ||
      typeof item.createdAt !== 'string' ||
      typeof item.updatedAt !== 'string' ||
      (item.image !== null &&
        (typeof item.image !== 'string' ||
          !isSafePath(item.image) ||
          !STORED_IMAGE_EXTENSIONS.some(
            (extension) => item.image === `images/${item.id}.${extension}`
          )))
    ) {
      throw new Error('home_scheme_backup_record_invalid')
    }
    if (item.image && !entries.has(item.image)) throw new Error('home_scheme_backup_image_missing')
  }
  return manifest as BackupManifest
}

async function readHomeSchemeBackup(backupFile: File) {
  const entries = await extractBackup(backupFile)
  const manifest = parseManifest(entries)
  const prepared: {
    record: HomeSchemeRecord
    image: PreparedHomeSchemeImage | null
    path: string | null
  }[] = []
  let invalidCount = 0
  for (const raw of manifest.homeSchemes) {
    // An invalid image rejects the archive before any database write.
    const bytes = raw.image ? entries.get(raw.image)! : null
    const image = bytes ? await prepareHomeSchemeImage(new Blob([bytes]), raw.id) : null
    if (image && !matchesStoredImageExtension(raw.image!, image.extension))
      throw new Error('home_scheme_image_format_mismatch')
    try {
      const createdAt = normalizeBackupDate(raw.createdAt, new Date().toISOString())
      prepared.push({
        path: raw.image,
        record: normalizeHomeSchemeRecord({
          ...raw,
          version: 1,
          image: image ? `${raw.id}.${image.extension}` : null,
          tags: raw.tags
            .map(normalizeHomeSchemeTag)
            .filter((tag) => tag && [...tag].length <= 5)
            .slice(0, 1),
          metadata: normalizeBackupMetadata(raw.metadata),
          createdAt,
          updatedAt: normalizeBackupDate(raw.updatedAt, createdAt)
        }),
        image
      })
    } catch {
      invalidCount++
    }
  }
  return { manifest, prepared, invalidCount }
}

type ValidatedHomeBackup = Awaited<ReturnType<typeof readHomeSchemeBackup>>
export interface PreparedHomeSchemeBackup {
  readonly apply: () => Promise<HomeSchemeImportResult>
}
interface HomeSchemeImportResult {
  addedCount: number
  duplicateCount: number
  failedCount: number
  schemes: HomeSchemeItem[]
  tags: string[]
}

/** 预览与提交之间只保留已验证元数据，不持有全部解压图片。 */
export async function prepareHomeSchemeBackup(backupFile: File): Promise<PreparedHomeSchemeBackup> {
  const { manifest, prepared, invalidCount } = await readHomeSchemeBackup(backupFile)
  const rows = prepared.map(({ record, image, path }) => {
    if (!image) return { record, image: null, path }
    const { blob, ...metadata } = image
    return { record, path, image: { ...metadata, type: blob.type } }
  })
  return Object.freeze({
    apply: async () => {
      // 从同一不可变 File 读取字节，每次只解压一个受大小限制的分包。
      const entries = await extractBackup(backupFile)
      const hydrated = rows.map(({ record, image, path }) => {
        if (!image) return { record, image: null, path }
        const bytes = entries.get(path!)
        if (!bytes || bytes.byteLength !== image.size)
          throw new Error('home_scheme_backup_image_missing')
        const { type, ...metadata } = image
        return { record, path, image: { ...metadata, blob: new Blob([bytes], { type }) } }
      })
      return applyHomeSchemeBackup({ manifest, prepared: hydrated, invalidCount })
    }
  })
}

export async function importHomeSchemeBackup(backupFile: File): Promise<HomeSchemeImportResult> {
  return applyHomeSchemeBackup(await readHomeSchemeBackup(backupFile))
}

async function applyHomeSchemeBackup({
  manifest,
  prepared,
  invalidCount
}: ValidatedHomeBackup): Promise<HomeSchemeImportResult> {
  const counts = await homeTransaction(
    [HOME_SCHEMES_STORE, HOME_IMAGES_STORE, HOME_TAGS_STORE],
    'readwrite',
    async (tx) => {
      const store = tx.objectStore(HOME_SCHEMES_STORE)
      const [current, rawTags] = await Promise.all([
        homeRequest(store.getAll()),
        homeRequest(tx.objectStore(HOME_TAGS_STORE).get('default'))
      ])
      const codes = new Set(
        current.map((record: HomeSchemeRecord) => normalizeHomeSchemeCode(record.code))
      )
      const ids = new Set(current.map((record: HomeSchemeRecord) => record.id))
      const tags = normalizeHomeSchemeTags(rawTags ?? [])
      for (const rawTag of manifest.tags) {
        const tag = normalizeHomeSchemeTag(rawTag)
        if (tag && [...tag].length <= 5 && !tags.includes(tag) && tags.length < 40) tags.push(tag)
      }
      let addedCount = 0,
        duplicateCount = 0
      for (const { record, image } of prepared) {
        if (codes.has(record.code)) {
          duplicateCount++
          continue
        }
        const id = ids.has(record.id) ? createHomeSchemeId() : record.id
        store.put({
          ...record,
          id,
          image: image ? `${id}.${image.extension}` : null,
          tags: record.tags.filter((tag) => tags.includes(tag))
        })
        if (image) tx.objectStore(HOME_IMAGES_STORE).put({ ...image, id })
        codes.add(record.code)
        ids.add(id)
        addedCount++
      }
      tx.objectStore(HOME_TAGS_STORE).put(tags, 'default')
      return { addedCount, duplicateCount, failedCount: invalidCount }
    }
  )
  const library = await readHomeSchemeLibrary()
  return { ...counts, ...library }
}
