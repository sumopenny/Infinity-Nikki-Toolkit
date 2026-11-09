import {
  STORED_IMAGE_EXTENSIONS,
  matchesStoredImageExtension as matchesImageExtension
} from '../storedImage'
import { backupBaseName } from '../backup/backupName'
import { strFromU8, Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import {
  OUTFIT_BACKUP_LIMITS,
  planBackupParts,
  downloadBackupParts,
  downloadBackupBlob,
  type BackupDownload
} from '../backup/zipBackup'
import {
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  OUTFIT_TAGS_STORE,
  OUTFIT_IGNORED_CODES_STORE
} from '../file-system/database'
import { imageExtension, MAX_IMAGE_BYTES } from '../image'
import {
  readOutfitSnapshot,
  readOutfitCollection,
  prepareOutfitImage,
  outfitTransaction,
  outfitRequest,
  withOutfitImportLock,
  initializeOutfitTags
} from './outfitStorage'
import {
  createOutfitId,
  isSafeOutfitId,
  normalizeOutfitCode,
  normalizeOutfitRecord,
  normalizeOutfitTagList,
  normalizeOutfitTag,
  isValidOutfitTag,
  isReservedOutfitTag,
  MAX_OUTFIT_TAGS,
  type OutfitRecord,
  type OutfitImportResult
} from './outfitTypes'

const BACKUP_FORMAT = 'infinity-nikki-outfit-backup'
const BACKUP_VERSION = 4
const MAX_BACKUP_BYTES = OUTFIT_BACKUP_LIMITS.bytes
const MAX_BACKUP_ENTRIES = OUTFIT_BACKUP_LIMITS.entries
const IMPORT_CONCURRENCY = 6
interface BackupManifest {
  format: string
  version: number
  exportedAt: string
  tags: string[]
  outfits: Array<OutfitRecord>
  ignoredCodes?: string[]
}
export async function exportOutfitBackup(
  download?: BackupDownload
): Promise<{ fileNames: string[]; count: number }> {
  const snapshot = await readOutfitSnapshot(),
    exportedAt = new Date().toISOString(),
    items = []
  for (const record of snapshot.records) {
    const { gameSourceId: _gameSourceId, codeKey: _codeKey, ...portable } = record
    if (!record.image) {
      items.push({ record: portable, files: [] })
      continue
    }
    const image = snapshot.images.get(record.id)!,
      checked = await prepareOutfitImage(image.blob, record.id)
    if (checked.sha256 !== image.sha256 || !matchesImageExtension(record.image, checked.extension))
      throw new Error('outfit_image_invalid')
    const path = `images/${record.image}`
    items.push({
      record: { ...portable, image: path },
      files: [{ name: path, blob: checked.blob }]
    })
  }
  const version = snapshot.records.some((record) => !record.image)
    ? BACKUP_VERSION
    : snapshot.records.every((record) => imageExtension(record.image) === 'webp')
      ? 2
      : 3
  const parts = planBackupParts(
    items,
    (outfits) => ({
      format: BACKUP_FORMAT,
      version,
      exportedAt,
      tags: snapshot.tags,
      ignoredCodes: snapshot.ignoredCodes,
      outfits
    }),
    'manifest.json',
    OUTFIT_BACKUP_LIMITS
  )
  const fileNames = await downloadBackupParts(
    backupBaseName('搭配码'),
    parts,
    'manifest.json',
    OUTFIT_BACKUP_LIMITS,
    download ?? ((name, blob) => downloadBackupBlob(name, blob, 'outfits'))
  )
  return { fileNames, count: snapshot.records.length }
}
export function isSafeOutfitArchivePath(path: string): boolean {
  return (
    Boolean(path) &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    path.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
  )
}

type BackupEntryHandler = (
  name: string,
  content: Uint8Array | null,
  byteLength: number
) => void | Promise<void>

/**
 * 顺序扫描 ZIP，并只为调用方关心的条目组装字节。读取循环会在处理队列达到上限时暂停，
 * 从而避免把整个解压结果同时保存在内存中。
 */
async function streamBackupEntries(
  file: File,
  shouldCollect: (name: string) => boolean,
  onEntry: BackupEntryHandler,
  concurrency = 1
): Promise<void> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup is too large')
  const seenEntries = new Set<string>()
  let entryCount = 0
  let declaredBytes = 0
  let expandedBytes = 0
  let extractionError: Error | null = null
  const activeTasks = new Set<Promise<void>>()
  let activeHandlers = 0
  const handlerWaiters: Array<() => void> = []
  const acquireHandler = async () => {
    if (activeHandlers >= concurrency)
      await new Promise<void>((resolve) => handlerWaiters.push(resolve))
    activeHandlers += 1
  }
  const releaseHandler = () => {
    activeHandlers -= 1
    handlerWaiters.shift()?.()
  }
  const unzip = new Unzip((entry) => {
    if (extractionError) return
    try {
      if (seenEntries.has(entry.name)) throw new Error('Backup contains duplicate entries')
      seenEntries.add(entry.name)
      entryCount += 1
      if (entryCount > MAX_BACKUP_ENTRIES) throw new Error('Backup contains too many files')
      if (!isSafeOutfitArchivePath(entry.name)) throw new Error('Backup contains an unsafe path')
      if (
        entry.name !== 'manifest.json' &&
        (!entry.name.startsWith('images/') ||
          !STORED_IMAGE_EXTENSIONS.includes(imageExtension(entry.name)))
      ) {
        throw new Error('Backup contains an unsupported file')
      }
      if (entry.originalSize !== undefined) {
        if (
          entry.originalSize >
          (entry.name === 'manifest.json' ? OUTFIT_BACKUP_LIMITS.manifest : MAX_IMAGE_BYTES)
        )
          throw new Error('Backup image is too large')
        declaredBytes += entry.originalSize
        if (declaredBytes > MAX_BACKUP_BYTES) throw new Error('Expanded backup is too large')
      }

      const collect = shouldCollect(entry.name)
      const chunks: Uint8Array[] = []
      let entryBytes = 0
      entry.ondata = (error, chunk, final) => {
        if (error) {
          extractionError = error
          entry.terminate()
          return
        }
        if (extractionError) {
          entry.terminate()
          return
        }
        if (chunk?.length) {
          entryBytes += chunk.length
          expandedBytes += chunk.length
          if (
            entryBytes >
            (entry.name === 'manifest.json' ? OUTFIT_BACKUP_LIMITS.manifest : MAX_IMAGE_BYTES)
          ) {
            extractionError = new Error('Backup image is too large')
            entry.terminate()
            return
          }
          if (expandedBytes > MAX_BACKUP_BYTES) {
            extractionError = new Error('Expanded backup is too large')
            entry.terminate()
            return
          }
          if (collect) chunks.push(chunk)
        }
        if (final && !extractionError) {
          let content: Uint8Array | null = null
          if (collect) {
            content = new Uint8Array(entryBytes)
            let offset = 0
            for (const part of chunks) {
              content.set(part, offset)
              offset += part.length
            }
          }
          let task!: Promise<void>
          task = (async () => {
            await acquireHandler()
            try {
              await onEntry(entry.name, content, entryBytes)
            } finally {
              releaseHandler()
            }
          })()
            .catch((taskError) => {
              extractionError =
                taskError instanceof Error ? taskError : new Error('Unable to process backup')
            })
            .finally(() => activeTasks.delete(task))
          activeTasks.add(task)
        }
      }
      entry.start()
    } catch (error) {
      extractionError = error instanceof Error ? error : new Error('Unable to extract backup')
      entry.terminate()
    }
  })
  // 每次只解压输入流的当前分块，便于读取循环对异步图片写入施加背压。
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)

  const stream = file.stream()
  const reader = stream.getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (extractionError) throw extractionError
      unzip.push(value ?? new Uint8Array(), done)
      if (extractionError) throw extractionError
      while (activeTasks.size >= concurrency) {
        await Promise.race(activeTasks)
        if (extractionError) throw extractionError
      }
      if (done) break
    }
    await Promise.all(activeTasks)
    if (extractionError) throw extractionError
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}

type PreparedImage = Awaited<ReturnType<typeof prepareOutfitImage>>
type ImageMetadata = Omit<PreparedImage, 'blob'> & { type: string }

async function inspectBackup(file: File) {
  let manifestBytes: Uint8Array | null = null
  const images = new Map<string, ImageMetadata>()
  // Validate every image transiently before any database write, without buffering the whole archive.
  await streamBackupEntries(
    file,
    () => true,
    async (name, content) => {
      if (name === 'manifest.json') {
        manifestBytes = content
        return
      }
      if (!content?.byteLength) throw new Error('Backup is missing an outfit image')
      const checked = await prepareOutfitImage(new Blob([content]), 'validation')
      if (!matchesImageExtension(name, checked.extension))
        throw new Error('outfit_image_format_mismatch')
      const { blob, ...metadata } = checked
      images.set(name, { ...metadata, type: blob.type })
    },
    IMPORT_CONCURRENCY
  )
  if (!manifestBytes) throw new Error('Backup manifest is missing')
  const manifest = JSON.parse(strFromU8(manifestBytes)) as BackupManifest
  if (
    !manifest ||
    manifest.format !== BACKUP_FORMAT ||
    ![1, 2, 3, BACKUP_VERSION].includes(manifest.version) ||
    !Array.isArray(manifest.outfits) ||
    !Array.isArray(manifest.tags)
  )
    throw new Error('Unsupported backup format')
  for (const raw of manifest.outfits) {
    if (manifest.version === BACKUP_VERSION && raw?.image === '' && normalizeOutfitCode(raw.code))
      continue
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof raw.image !== 'string' ||
      !isSafeOutfitArchivePath(raw.image) ||
      !/^images\/[^/]+\.(webp|png|jpe?g|gif|bmp|avif)$/i.test(raw.image)
    )
      throw new Error('Backup contains invalid outfit metadata')
    if (!images.has(raw.image)) throw new Error('Backup is missing an outfit image')
  }
  if (
    manifest.version >= 2 &&
    (!Array.isArray(manifest.ignoredCodes) ||
      manifest.ignoredCodes.some(
        (code) =>
          typeof code !== 'string' ||
          !normalizeOutfitCode(code) ||
          code.replace(/\s/g, '').length > 30
      ))
  )
    throw new Error('outfit_ignored_codes_invalid')
  return { manifest, images }
}

export interface PreparedOutfitBackup {
  readonly apply: () => Promise<OutfitImportResult>
}

/** 校验结果绑定同一不可变 File，只保留图片元数据；提交时仍读取当前数据库。 */
export async function prepareOutfitBackup(file: File): Promise<PreparedOutfitBackup> {
  const inspected = await inspectBackup(file)
  return Object.freeze({ apply: () => withOutfitImportLock(() => importBackup(file, inspected)) })
}

async function importBackup(
  backupFile: File,
  { manifest, images }: Awaited<ReturnType<typeof inspectBackup>>
): Promise<OutfitImportResult> {
  let failedCount = 0,
    addedCount = 0,
    duplicateCount = 0,
    rejectedTagCount = 0
  const prepared: Array<{ record: OutfitRecord; path: string }> = []
  for (const raw of manifest.outfits) {
    try {
      if (!isSafeOutfitId(raw.id)) throw new Error('outfit_record_invalid')
      const createdAt =
        typeof raw.createdAt === 'string' && Number.isFinite(Date.parse(raw.createdAt))
          ? raw.createdAt
          : new Date().toISOString()
      prepared.push({
        path: raw.image,
        record: normalizeOutfitRecord({
          ...raw,
          version: 1,
          image: raw.image ? `${raw.id}.${imageExtension(raw.image)}` : '',
          note: raw.note ?? '',
          createdAt,
          updatedAt: raw.updatedAt ?? createdAt,
          gameSourceId: undefined,
          sourcePlayerId: raw.sourcePlayerId ?? /^sharecode-(\d+)-/.exec(raw.id)?.[1]
        })
      })
    } catch {
      failedCount++
    }
  }
  await initializeOutfitTags()
  // Commit tags and ignored codes atomically. Restored records below explicitly lift their own ignore state.
  await outfitTransaction(
    [OUTFIT_TAGS_STORE, OUTFIT_IGNORED_CODES_STORE, OUTFITS_STORE],
    'readwrite',
    async (tx) => {
      const tags = normalizeOutfitTagList(
        await outfitRequest(tx.objectStore(OUTFIT_TAGS_STORE).get('default'))
      )
      for (const raw of manifest.tags) {
        const tag = normalizeOutfitTag(raw)
        if (tags.includes(tag)) continue
        if (!isValidOutfitTag(tag) || isReservedOutfitTag(tag) || tags.length >= MAX_OUTFIT_TAGS) {
          rejectedTagCount++
          continue
        }
        tags.push(tag)
      }
      tx.objectStore(OUTFIT_TAGS_STORE).put(tags, 'default')
      for (const code of manifest.ignoredCodes ?? []) {
        const normalized = normalizeOutfitCode(code)
        if (!(await outfitRequest(tx.objectStore(OUTFITS_STORE).index('code').get(normalized))))
          tx.objectStore(OUTFIT_IGNORED_CODES_STORE).put({ code: normalized })
      }
    }
  )
  const byImage = new Map<string, typeof prepared>()
  async function restore(
    record: OutfitRecord,
    image?: Awaited<ReturnType<typeof prepareOutfitImage>>
  ) {
    try {
      const result = await outfitTransaction(
        [OUTFITS_STORE, OUTFIT_IMAGES_STORE, OUTFIT_TAGS_STORE, OUTFIT_IGNORED_CODES_STORE],
        'readwrite',
        async (tx) => {
          const records = tx.objectStore(OUTFITS_STORE)
          const duplicate = record.code
            ? ((await outfitRequest(records.index('code').get(record.code))) as
                OutfitRecord | undefined)
            : undefined
          if (duplicate) {
            tx.objectStore(OUTFIT_IGNORED_CODES_STORE).delete(record.code)
            return 'duplicate'
          }
          const existing = (await outfitRequest(records.get(record.id))) as OutfitRecord | undefined
          if (image && !record.code && existing && !existing.code) {
            const oldImage = (await outfitRequest(
              tx.objectStore(OUTFIT_IMAGES_STORE).get(record.id)
            )) as { sha256: string } | undefined
            const { id: _id, image: _image, ...old } = normalizeOutfitRecord(existing)
            const { id: _nextId, image: _nextImage, ...next } = { ...record, imageSize: image.size }
            if (JSON.stringify(old) === JSON.stringify(next) && oldImage?.sha256 === image.sha256)
              return 'duplicate'
          }
          const id = existing ? createOutfitId() : record.id
          const tags = normalizeOutfitTagList(
            await outfitRequest(tx.objectStore(OUTFIT_TAGS_STORE).get('default'))
          )
          const incoming = normalizeOutfitRecord({
            ...record,
            id,
            image: image ? `${id}.${image.extension}` : '',
            imageSize: image?.size,
            tags: record.tags.filter((tag) => tags.includes(tag))
          })
          records.put(incoming)
          if (image) tx.objectStore(OUTFIT_IMAGES_STORE).put({ ...image, id })
          if (record.code) tx.objectStore(OUTFIT_IGNORED_CODES_STORE).delete(record.code)
          return 'added'
        }
      )
      if (result === 'added') addedCount++
      else duplicateCount++
    } catch {
      failedCount++
    }
  }
  for (const item of prepared) {
    if (!item.path) await restore(item.record)
    else {
      const group = byImage.get(item.path) ?? []
      group.push(item)
      byImage.set(item.path, group)
    }
  }
  await streamBackupEntries(
    backupFile,
    (name) => byImage.has(name),
    async (path, bytes) => {
      if (!bytes) return
      const checked = images.get(path)
      if (!checked || bytes.byteLength !== checked.size) throw new Error('outfit_image_invalid')
      const { type, ...metadata } = checked
      const image = { ...metadata, blob: new Blob([bytes], { type }) }
      for (const { record } of byImage.get(path) ?? []) await restore(record, image)
    },
    IMPORT_CONCURRENCY
  )
  const library = await readOutfitCollection()
  return {
    addedCount,
    duplicateCount,
    failedCount,
    rejectedTagCount,
    library: { ...library, importedSharedCount: 0, failedCount }
  }
}
export function importOutfitBackup(backupFile: File): Promise<OutfitImportResult> {
  return withOutfitImportLock(async () => importBackup(backupFile, await inspectBackup(backupFile)))
}
