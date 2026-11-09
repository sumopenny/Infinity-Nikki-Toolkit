// File-system inputs only: legacy migration and game ShareCode/DIY. Collections live in IndexedDB.
import {
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  OUTFIT_IGNORED_CODES_STORE,
  OUTFIT_GAME_SOURCES_STORE,
  OUTFIT_MIGRATION_SOURCES_STORE,
  OUTFIT_MIGRATION_ENTRIES_STORE,
  runStoreRequest
} from '../file-system/database'
import { isSupportedImage } from '../image'
import {
  createOutfitId,
  normalizeOutfitCode,
  normalizeOutfitRecord,
  type OutfitLibraryResult,
  type SharedOutfitSource,
  type SharedOutfitImportResult
} from './outfitTypes'
import {
  hashOutfitBlob,
  initializeOutfitTags,
  outfitRequest,
  outfitTransaction,
  prepareOutfitUpload,
  readOutfitCollection,
  withOutfitImportLock
} from './outfitStorage'
import {
  isMissingOutfitEntry,
  migrateOutfitLibrary,
  type OutfitMigrationSource,
  type OutfitMigrationMarker
} from './outfitMigration'

export * from './outfitTypes'
export {
  saveOutfit,
  saveOutfitTags,
  deleteOutfitTag,
  deleteOutfit,
  deleteOutfits
} from './outfitStorage'
export { convertImageToWebp } from '../image'
const isMissingEntryError = isMissingOutfitEntry

/** 逐级进入游戏目录的子文件夹。参数：rootHandle 为起点目录，segments 为路径片段；缺少目录时返回 null。 */
async function findOptionalNestedDirectory(
  rootHandle: FileSystemDirectoryHandle,
  segments: string[]
): Promise<FileSystemDirectoryHandle | null> {
  let currentHandle = rootHandle
  try {
    for (const segment of segments) currentHandle = await currentHandle.getDirectoryHandle(segment)
    return currentHandle
  } catch (error) {
    if (isMissingEntryError(error)) return null
    throw error
  }
}

/** 判断文件是否为游戏搭配码历史 JSON。参数：fileName 为文件名。 */
function isShareCodeFileName(fileName: string): boolean {
  const normalized = fileName.toLowerCase()
  return normalized.includes('sharecode') && normalized.endsWith('.json')
}

/** 从 sharecode 文件名开头读取玩家 ID。参数：fileName 为 sharecode 文件名；返回玩家 ID 或 null。 */
function playerIdFromShareCodeFileName(fileName: string): string | null {
  const matched = fileName.match(/^(\d+)/)
  return matched?.[1] ?? null
}

/** 从搭配码历史内容中读取最新记录。参数：content 为 JSON 文本，playerId 为 sharecode 文件名中读取的玩家 ID。 */
function parseLatestShareCode(content: string, playerId: string): string | null {
  const parsed: unknown = JSON.parse(content)
  if (!Array.isArray(parsed)) return null
  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    const item = parsed[index]
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const roleId = typeof record.RoleID === 'string' ? record.RoleID : String(record.RoleID ?? '')
    if (roleId && roleId !== playerId) continue
    const code = normalizeOutfitCode(record.ShareCode)
    if (code) return code
  }
  return null
}

/** 找到最近修改且可解析的搭配码历史文件。参数：shareCodeDirectory 为 ShareCode 目录。 */
async function findLatestShareCode(shareCodeDirectory: FileSystemDirectoryHandle): Promise<{
  code: string
  playerId: string
  timestamp: number
  file: File
  fileName: string
} | null> {
  const candidates: Array<{ file: File; playerId: string }> = []
  for await (const [name, handle] of shareCodeDirectory.entries()) {
    const playerId = playerIdFromShareCodeFileName(name)
    if (handle.kind !== 'file' || !isShareCodeFileName(name) || !playerId) continue
    candidates.push({ file: await (handle as FileSystemFileHandle).getFile(), playerId })
  }
  candidates.sort(
    (left, right) =>
      right.file.lastModified - left.file.lastModified ||
      right.file.name.localeCompare(left.file.name)
  )
  for (const candidate of candidates) {
    try {
      const code = parseLatestShareCode(await candidate.file.text(), candidate.playerId)
      if (code)
        return {
          code,
          playerId: candidate.playerId,
          timestamp: candidate.file.lastModified || Date.now(),
          file: candidate.file,
          fileName: candidate.file.name
        }
    } catch {
      // 损坏的历史文件会被跳过，继续尝试时间更早的候选文件。
    }
  }
  return null
}

/** 在玩家 DIY 目录中找到最近修改的图片。参数：diyDirectory 为玩家 DIY 目录。 */
async function findLatestDiyImage(
  diyDirectory: FileSystemDirectoryHandle
): Promise<{ file: File } | null> {
  let latest: { file: File } | null = null
  for await (const [name, handle] of diyDirectory.entries()) {
    if (handle.kind !== 'file' || !isSupportedImage(name)) continue
    const file = await (handle as FileSystemFileHandle).getFile()
    if (
      !latest ||
      file.lastModified > latest.file.lastModified ||
      (file.lastModified === latest.file.lastModified && file.name > latest.file.name)
    ) {
      latest = { file }
    }
  }
  return latest
}

interface PlayerProgress {
  timestamp: number
}
interface GameSourceState {
  id: string
  directory: FileSystemDirectoryHandle
  players: Record<string, PlayerProgress>
}

async function gameSourceState(directory: FileSystemDirectoryHandle): Promise<GameSourceState> {
  const sources = await runStoreRequest<GameSourceState[]>(
    OUTFIT_GAME_SOURCES_STORE,
    'readonly',
    (store) => store.getAll()
  )
  for (const source of sources) if (await directory.isSameEntry(source.directory)) return source
  const next: GameSourceState = { id: createOutfitId(), directory, players: {} }
  await runStoreRequest(OUTFIT_GAME_SOURCES_STORE, 'readwrite', (store) => store.put(next))
  return next
}

/** Seed only timestamps demonstrably migrated from this game installation, never the global maximum. */
async function migratedPlayerTimestamp(
  directory: FileSystemDirectoryHandle,
  playerId: string
): Promise<number> {
  if (!directory.resolve) return 0
  const sources = await runStoreRequest<OutfitMigrationSource[]>(
    OUTFIT_MIGRATION_SOURCES_STORE,
    'readonly',
    (store) => store.getAll()
  )
  const sourceIds = new Set<string>()
  for (const source of sources) {
    let path: string[] | null
    try {
      path = await directory.resolve(source.albumDirectory ?? source.directory)
    } catch (error) {
      if (isMissingEntryError(error)) continue
      throw error
    }
    if (path && path[0] === 'Saved' && path[1] === 'GamePlayPhotos') sourceIds.add(source.id)
  }
  if (!sourceIds.size) return 0
  return outfitTransaction(
    [OUTFITS_STORE, OUTFIT_MIGRATION_ENTRIES_STORE],
    'readonly',
    async (tx) => {
      const markers = (await outfitRequest(
        tx.objectStore(OUTFIT_MIGRATION_ENTRIES_STORE).getAll()
      )) as OutfitMigrationMarker[]
      let latest = 0
      for (const marker of markers) {
        if (marker.kind !== 'legacy' || !sourceIds.has(marker.sourceId)) continue
        if (marker.sourcePlayerId === playerId)
          latest = Math.max(latest, marker.diyImageModifiedAt ?? 0)
      }
      return latest
    }
  )
}

async function importShared(source: SharedOutfitSource): Promise<SharedOutfitImportResult> {
  let failureStage: SharedOutfitImportResult['failureStage']
  try {
    await initializeOutfitTags()
    const shareDirectory = await findOptionalNestedDirectory(source.x6GameDirectory, [
      'Saved',
      'ShareCode'
    ])
    if (!shareDirectory) return { importedCount: 0, duplicateCount: 0, failedCount: 0 }
    const latest = await findLatestShareCode(shareDirectory)
    if (!latest) return { importedCount: 0, duplicateCount: 0, failedCount: 0 }
    const codeState = await outfitTransaction(
      [OUTFITS_STORE, OUTFIT_IGNORED_CODES_STORE],
      'readonly',
      async (tx) => ({
        duplicate: Boolean(
          await outfitRequest(tx.objectStore(OUTFITS_STORE).index('code').get(latest.code))
        ),
        ignored: Boolean(
          await outfitRequest(tx.objectStore(OUTFIT_IGNORED_CODES_STORE).get(latest.code))
        )
      })
    )
    if (codeState.ignored) return { importedCount: 0, duplicateCount: 0, failedCount: 0 }
    if (codeState.duplicate)
      return { importedCount: 0, duplicateCount: 1, failedCount: 0, failureStage: 'duplicate' }
    const diyDirectory = await findOptionalNestedDirectory(source.x6GameDirectory, [
      'Saved',
      'DIY',
      latest.playerId
    ])
    const latestImage = diyDirectory ? await findLatestDiyImage(diyDirectory) : null
    if (!latestImage || !diyDirectory)
      return { importedCount: 0, duplicateCount: 0, failedCount: 1, failureStage: 'missing-image' }
    const state = await gameSourceState(source.x6GameDirectory)
    const baseline =
      state.players[latest.playerId]?.timestamp ??
      (await migratedPlayerTimestamp(source.x6GameDirectory, latest.playerId))
    if (baseline && latestImage.file.lastModified <= baseline)
      return {
        importedCount: 0,
        duplicateCount: 0,
        failedCount: 1,
        failureStage: 'image-not-updated'
      }
    const fingerprint = await hashOutfitBlob(latest.file),
      originalImageHash = await hashOutfitBlob(latestImage.file)
    const id = createOutfitId()
    const image = await prepareOutfitUpload(latestImage.file, id)
    const refreshedCode = await findLatestShareCode(shareDirectory),
      refreshedImage = await findLatestDiyImage(diyDirectory)
    if (
      !refreshedCode ||
      refreshedCode.code !== latest.code ||
      refreshedCode.fileName !== latest.fileName ||
      (await hashOutfitBlob(refreshedCode.file)) !== fingerprint ||
      !refreshedImage ||
      refreshedImage.file.name !== latestImage.file.name ||
      refreshedImage.file.lastModified !== latestImage.file.lastModified ||
      (await hashOutfitBlob(refreshedImage.file)) !== originalImageHash
    ) {
      return { importedCount: 0, duplicateCount: 0, failedCount: 1, failureStage: 'source-changed' }
    }
    const record = normalizeOutfitRecord({
      version: 1,
      id,
      image: `${id}.${image.extension}`,
      imageSize: image.size,
      code: latest.code,
      tags: [],
      note: '',
      createdAt: new Date(latest.timestamp).toISOString(),
      updatedAt: new Date(latest.timestamp).toISOString(),
      diyImageModifiedAt: latestImage.file.lastModified,
      sourcePlayerId: latest.playerId,
      gameSourceId: state.id
    })
    failureStage = 'image-write-failed'
    const outcome = await outfitTransaction(
      [OUTFITS_STORE, OUTFIT_IMAGES_STORE, OUTFIT_IGNORED_CODES_STORE, OUTFIT_GAME_SOURCES_STORE],
      'readwrite',
      async (tx) => {
        const records = tx.objectStore(OUTFITS_STORE),
          states = tx.objectStore(OUTFIT_GAME_SOURCES_STORE)
        if (await outfitRequest(tx.objectStore(OUTFIT_IGNORED_CODES_STORE).get(latest.code)))
          return 'ignored'
        if (await outfitRequest(records.index('code').get(latest.code))) return 'duplicate'
        const current = (await outfitRequest(states.get(state.id))) as GameSourceState
        const progress = current.players[latest.playerId]
        if (progress && latestImage.file.lastModified <= progress.timestamp) return 'stale'
        records.put(record)
        tx.objectStore(OUTFIT_IMAGES_STORE).put(image)
        states.put({
          ...current,
          players: {
            ...current.players,
            [latest.playerId]: {
              timestamp: latestImage.file.lastModified
            }
          }
        })
        return 'added'
      }
    )
    return {
      importedCount: outcome === 'added' ? 1 : 0,
      duplicateCount: outcome === 'duplicate' ? 1 : 0,
      failedCount: outcome === 'stale' ? 1 : 0,
      ...(outcome === 'duplicate'
        ? { failureStage: 'duplicate' as const }
        : outcome === 'stale'
          ? { failureStage: 'image-not-updated' as const }
          : {})
    }
  } catch {
    return {
      importedCount: 0,
      duplicateCount: 0,
      failedCount: 1,
      failureStage: failureStage ?? 'image-write-failed'
    }
  }
}
export function importLatestSharedOutfit(
  source: SharedOutfitSource
): Promise<SharedOutfitImportResult> {
  return withOutfitImportLock(() => importShared(source))
}

export async function readOutfitLibrary(
  album?: FileSystemDirectoryHandle | null,
  options: { sharedSource?: SharedOutfitSource | null } = {}
): Promise<OutfitLibraryResult> {
  let migration: OutfitLibraryResult['migration']
  if (album) {
    try {
      migration = await migrateOutfitLibrary(album)
    } catch (error) {
      migration = {
        addedCount: 0,
        replacedCount: 0,
        skippedCount: 0,
        failedCount: 1,
        tagsChanged: false,
        clotheDirectoryRemoved: false,
        failures: [
          {
            fileName: 'clothe',
            message: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : ''
          }
        ]
      }
    }
  }
  // Always process game input independently of a missing or failed legacy directory.
  const shared: SharedOutfitImportResult = options.sharedSource
    ? await importLatestSharedOutfit(options.sharedSource)
    : { importedCount: 0, duplicateCount: 0, failedCount: 0 }
  const library = await readOutfitCollection()
  return {
    ...library,
    importedSharedCount: shared.importedCount,
    failedCount: (migration?.failedCount ?? 0) + shared.failedCount,
    sharedFailureStage: shared.failureStage,
    migration
  }
}
