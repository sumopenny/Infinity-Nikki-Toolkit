import {
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  OUTFIT_TAGS_STORE,
  OUTFIT_IGNORED_CODES_STORE,
  OUTFIT_MIGRATION_SOURCES_STORE,
  OUTFIT_MIGRATION_ENTRIES_STORE,
  runStoreRequest
} from '../file-system/database'
import { isSupportedImage } from '../image'
import {
  createOutfitId,
  normalizeOutfitCode,
  normalizeOutfitRecord,
  normalizeOutfitTagList,
  MAX_OUTFIT_TAGS,
  type OutfitRecord,
  type OutfitMigrationResult
} from './outfitTypes'
import {
  hashOutfitBlob,
  initializeOutfitTags,
  outfitRequest,
  outfitTransaction,
  prepareOutfitUpload,
  withOutfitImportLock,
  type OutfitImage
} from './outfitStorage'

export interface OutfitMigrationSource {
  id: string
  directory: FileSystemDirectoryHandle
  albumDirectory?: FileSystemDirectoryHandle
  processedTags: string[]
  ignoredMigrated: boolean
  metadataFingerprints?: { tags: string; ignoredCodes: string }
}
export interface OutfitMigrationMarker {
  sourceId: string
  fileName: string
  targetId: string
  fingerprint: string
  image: string
  imageFingerprint: string
  processedAt: string
  kind: 'legacy'
  sourcePlayerId?: string
  diyImageModifiedAt?: number
}
export function isMissingOutfitEntry(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}
export async function getClotheDirectory(
  album: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await album.getDirectoryHandle('clothe')
  } catch (error) {
    if (isMissingOutfitEntry(error)) return null
    throw error
  }
}
export async function getOutfitMigrationSource(
  directory: FileSystemDirectoryHandle
): Promise<OutfitMigrationSource> {
  const sources = await runStoreRequest<OutfitMigrationSource[]>(
    OUTFIT_MIGRATION_SOURCES_STORE,
    'readonly',
    (store) => store.getAll()
  )
  for (const source of sources) if (await directory.isSameEntry(source.directory)) return source
  return { id: createOutfitId(), directory, processedTags: [], ignoredMigrated: false }
}
interface DirectorySnapshotEntry {
  kind: FileSystemHandleKind
  fingerprint: string
  file?: File
}
async function snapshotClotheDirectory(
  directory: FileSystemDirectoryHandle
): Promise<Map<string, DirectorySnapshotEntry>> {
  const snapshot = new Map<string, DirectorySnapshotEntry>()
  for await (const [name, handle] of directory.entries()) {
    const file =
      handle.kind === 'file' && (/\.json$/i.test(name) || isSupportedImage(name))
        ? await (handle as FileSystemFileHandle).getFile()
        : undefined
    snapshot.set(name, {
      kind: handle.kind,
      fingerprint: file ? await hashOutfitBlob(file) : '',
      file
    })
  }
  return snapshot
}
async function readSnapshotJson(
  snapshot: Map<string, DirectorySnapshotEntry>,
  name: string,
  fallback: unknown
): Promise<unknown> {
  const entry = snapshot.get(name)
  if (!entry) return fallback
  if (!entry.file) throw new Error('outfit_record_invalid')
  return JSON.parse(await entry.file.text())
}
async function removeMigratedClotheDirectory(
  album: FileSystemDirectoryHandle,
  directory: FileSystemDirectoryHandle,
  snapshot: Map<string, DirectorySnapshotEntry>,
  sourceId: string,
  fileNames: string[]
): Promise<void> {
  const allowed = new Set(['tags.json', 'ignored-sharecodes.json', ...fileNames])
  await outfitTransaction([OUTFIT_MIGRATION_ENTRIES_STORE], 'readonly', async (tx) => {
    for (const fileName of fileNames) {
      const marker = (await outfitRequest(
        tx.objectStore(OUTFIT_MIGRATION_ENTRIES_STORE).get([sourceId, fileName])
      )) as OutfitMigrationMarker | undefined
      if (!marker || marker.kind !== 'legacy') throw new Error('outfit_cleanup_incomplete')
      if (
        marker.fingerprint !== snapshot.get(fileName)?.fingerprint ||
        marker.imageFingerprint !== snapshot.get(marker.image)?.fingerprint
      )
        throw new Error('outfit_migration_source_changed')
      allowed.add(marker.image)
    }
  })
  for (const [name, entry] of snapshot) {
    if (entry.kind !== 'file' || !allowed.has(name))
      throw new Error('outfit_cleanup_unmigrated_content')
  }
  const current = await album.getDirectoryHandle('clothe')
  if (!(await current.isSameEntry(directory))) throw new Error('outfit_cleanup_directory_changed')
  const latest = await snapshotClotheDirectory(current)
  if (
    latest.size !== snapshot.size ||
    [...latest].some(
      ([name, entry]) =>
        !snapshot.has(name) ||
        snapshot.get(name)!.kind !== entry.kind ||
        snapshot.get(name)!.fingerprint !== entry.fingerprint
    )
  ) {
    throw new Error('outfit_cleanup_directory_changed')
  }
  // Database transactions have committed and every unchanged source file is accounted for.
  await album.removeEntry('clothe', { recursive: true })
}
function sameContent(left: OutfitRecord, right: OutfitRecord): boolean {
  return (
    JSON.stringify({ ...left, id: '', image: '' }) ===
    JSON.stringify({ ...right, id: '', image: '' })
  )
}

async function migrate(album: FileSystemDirectoryHandle): Promise<OutfitMigrationResult> {
  const result: OutfitMigrationResult = {
    addedCount: 0,
    replacedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    tagsChanged: false,
    clotheDirectoryRemoved: false,
    failures: []
  }
  const failed = (fileName: string, error: unknown) => {
    result.failedCount++
    result.failures.push({
      fileName,
      message: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : ''
    })
  }
  let directory: FileSystemDirectoryHandle | null
  try {
    directory = await getClotheDirectory(album)
  } catch (error) {
    failed('clothe', error)
    return result
  }
  if (!directory) return result
  let snapshot: Map<string, DirectorySnapshotEntry>
  try {
    snapshot = await snapshotClotheDirectory(directory)
  } catch (error) {
    failed('clothe', error)
    return result
  }
  await initializeOutfitTags()
  let source = await getOutfitMigrationSource(directory)
  let legacyTags: string[]
  try {
    legacyTags = normalizeOutfitTagList(await readSnapshotJson(snapshot, 'tags.json', []))
    const rawIgnored = await readSnapshotJson(snapshot, 'ignored-sharecodes.json', [])
    if (
      !Array.isArray(rawIgnored) ||
      rawIgnored.some((code) => typeof code !== 'string' || code.replace(/\s/g, '').length > 30)
    )
      throw new Error('outfit_ignored_codes_invalid')
    const ignoredCodes = [...new Set(rawIgnored.map(normalizeOutfitCode).filter(Boolean))]
    const state = await outfitTransaction(
      [OUTFIT_TAGS_STORE, OUTFIT_IGNORED_CODES_STORE, OUTFIT_MIGRATION_SOURCES_STORE],
      'readwrite',
      async (tx) => {
        const sources = tx.objectStore(OUTFIT_MIGRATION_SOURCES_STORE)
        const previous = (await outfitRequest(sources.get(source.id))) as
          OutfitMigrationSource | undefined
        const current = previous ?? source
        const metadataFingerprints = {
          tags: snapshot.get('tags.json')?.fingerprint ?? '',
          ignoredCodes: snapshot.get('ignored-sharecodes.json')?.fingerprint ?? ''
        }
        if (
          current.metadataFingerprints &&
          (current.metadataFingerprints.tags !== metadataFingerprints.tags ||
            current.metadataFingerprints.ignoredCodes !== metadataFingerprints.ignoredCodes)
        )
          throw new Error('outfit_migration_source_changed')
        const tags = normalizeOutfitTagList(
          await outfitRequest(tx.objectStore(OUTFIT_TAGS_STORE).get('default'))
        )
        const before = JSON.stringify(tags),
          processedTags = [...current.processedTags]
        for (const tag of legacyTags) {
          if (processedTags.includes(tag)) continue
          if (!tags.includes(tag) && tags.length >= MAX_OUTFIT_TAGS) continue
          if (!tags.includes(tag)) tags.push(tag)
          processedTags.push(tag)
        }
        if (!current.ignoredMigrated)
          for (const code of ignoredCodes) tx.objectStore(OUTFIT_IGNORED_CODES_STORE).put({ code })
        const next = {
          ...current,
          albumDirectory: album,
          processedTags,
          ignoredMigrated: true,
          metadataFingerprints
        }
        sources.put(next)
        tx.objectStore(OUTFIT_TAGS_STORE).put(tags, 'default')
        return { source: next, tagsChanged: before !== JSON.stringify(tags) }
      }
    )
    source = state.source
    result.tagsChanged = state.tagsChanged
  } catch (error) {
    failed('tags.json / ignored-sharecodes.json', error)
    return result
  }

  const files: string[] = []
  for (const [name, entry] of snapshot)
    if (
      entry.kind === 'file' &&
      /\.json$/i.test(name) &&
      !['tags.json', 'ignored-sharecodes.json'].includes(name)
    )
      files.push(name)
  files.sort()
  for (const fileName of files) {
    try {
      const key = [source.id, fileName]
      const marker = await runStoreRequest<OutfitMigrationMarker | undefined>(
        OUTFIT_MIGRATION_ENTRIES_STORE,
        'readonly',
        (store) => store.get(key)
      )
      // A committed marker prevents retained sources from restoring deleted or edited records.
      const file = snapshot.get(fileName)!.file!
      const fingerprint = snapshot.get(fileName)!.fingerprint
      if (marker) {
        if (
          marker.kind !== 'legacy' ||
          marker.fingerprint !== fingerprint ||
          marker.imageFingerprint !== snapshot.get(marker.image)?.fingerprint
        )
          throw new Error('outfit_migration_source_changed')
        continue
      }
      const raw = JSON.parse(await file.text())
      if (
        !raw ||
        typeof raw !== 'object' ||
        typeof raw.image !== 'string' ||
        !isSupportedImage(raw.image) ||
        /[\\/\0]/.test(raw.image)
      )
        throw new Error('outfit_record_invalid')
      const createdAt =
        typeof raw.createdAt === 'string' && Number.isFinite(Date.parse(raw.createdAt))
          ? raw.createdAt
          : new Date(file.lastModified).toISOString()
      const record = normalizeOutfitRecord({
        ...raw,
        version: 1,
        image: `${raw.id}.webp`,
        note: raw.note ?? '',
        createdAt,
        updatedAt: raw.updatedAt ?? createdAt,
        sourcePlayerId: raw.sourcePlayerId ?? /^sharecode-(\d+)-/.exec(raw.id)?.[1]
      })
      if (fileName !== `${record.id}.json`) throw new Error('outfit_record_id_invalid')
      if (record.tags.some((tag) => !legacyTags.includes(tag)))
        throw new Error('outfit_tag_missing')
      if (record.tags.some((tag) => !source.processedTags.includes(tag)))
        throw new Error('outfit_tag_limit')
      const sourceImage = snapshot.get(raw.image)?.file
      if (!sourceImage) throw new Error('outfit_image_missing')
      const imageFingerprint = snapshot.get(raw.image)!.fingerprint
      const image = await prepareOutfitUpload(sourceImage, record.id)
      // Recheck files after conversion before committing a durable marker.
      if (
        (await hashOutfitBlob(await (await directory.getFileHandle(fileName)).getFile())) !==
          fingerprint ||
        (await hashOutfitBlob(await (await directory.getFileHandle(raw.image)).getFile())) !==
          imageFingerprint
      )
        throw new Error('outfit_migration_source_changed')
      const outcome = await outfitTransaction(
        [
          OUTFITS_STORE,
          OUTFIT_IMAGES_STORE,
          OUTFIT_TAGS_STORE,
          OUTFIT_IGNORED_CODES_STORE,
          OUTFIT_MIGRATION_ENTRIES_STORE
        ],
        'readwrite',
        async (tx) => {
          const markers = tx.objectStore(OUTFIT_MIGRATION_ENTRIES_STORE)
          if (await outfitRequest(markers.get(key))) return 'processed'
          const records = tx.objectStore(OUTFITS_STORE),
            images = tx.objectStore(OUTFIT_IMAGES_STORE)
          const tags = normalizeOutfitTagList(
            await outfitRequest(tx.objectStore(OUTFIT_TAGS_STORE).get('default'))
          )
          const existing = record.code
            ? ((await outfitRequest(records.index('code').get(record.code))) as
                OutfitRecord | undefined)
            : undefined
          let id = existing?.id ?? record.id
          if (!existing && (await outfitRequest(records.get(id)))) id = createOutfitId()
          if (record.tags.some((tag) => !tags.includes(tag))) throw new Error('outfit_tag_missing')
          const incoming = normalizeOutfitRecord({
            ...record,
            sourceUrl: record.sourceUrl ?? existing?.sourceUrl,
            id,
            image: `${id}.${image.extension}`,
            imageSize: image.size
          })
          const oldImage = existing
            ? ((await outfitRequest(images.get(id))) as OutfitImage | undefined)
            : undefined
          const identical =
            existing &&
            sameContent(normalizeOutfitRecord(existing), incoming) &&
            oldImage?.sha256 === image.sha256 &&
            oldImage.size === image.size
          if (!identical) {
            records.put(incoming)
            images.put({ ...image, id })
          }
          markers.put({
            sourceId: source.id,
            fileName,
            targetId: id,
            fingerprint,
            image: raw.image,
            imageFingerprint,
            kind: 'legacy',
            sourcePlayerId: record.sourcePlayerId,
            diyImageModifiedAt: record.diyImageModifiedAt,
            processedAt: new Date().toISOString()
          } satisfies OutfitMigrationMarker)
          return identical ? 'skipped' : existing ? 'replaced' : 'added'
        }
      )
      if (outcome === 'added') result.addedCount++
      else if (outcome === 'replaced') result.replacedCount++
      else if (outcome === 'skipped') result.skippedCount++
    } catch (error) {
      failed(fileName, error)
    }
  }
  const overflow = legacyTags.filter((tag) => !source.processedTags.includes(tag))
  if (overflow.length) failed('tags.json', new Error('outfit_tag_limit: ' + overflow.join('、')))
  if (!result.failedCount) {
    try {
      await removeMigratedClotheDirectory(album, directory, snapshot, source.id, files)
      result.clotheDirectoryRemoved = true
    } catch (error) {
      failed('clothe', error)
    }
  }
  return result
}
export function migrateOutfitLibrary(
  album: FileSystemDirectoryHandle
): Promise<OutfitMigrationResult> {
  return withOutfitImportLock(() => migrate(album))
}
