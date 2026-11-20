// 目录句柄存储：使用 IndexedDB 保存和读取相册及 X6Game 目录授权句柄。
import { runStoreRequest } from './database'
import { runDatabaseTransaction } from './transaction'
const STORE_NAME = 'album-handles'
const SAVED_DIRECTORY_KEY = 'current-album-directory'
const SAVED_X6GAME_DIRECTORY_KEY = 'current-x6game-directory'
const SAVED_CAMERA_PARAM_UIDS_KEY = 'current-camera-param-uids'
const OUTFIT_PARSE_CACHE_KEY_PREFIX = 'outfit-code-parse:'
// 特效染色标记的解析结果格式发生变化，避免继续命中旧版 IndexedDB 数据。
const OUTFIT_PARSE_CACHE_VERSION = 'v2:'
const HOME_SCHEME_PARSE_CACHE_KEY_PREFIX = 'home-scheme-parse:'
const PHOTO_ACTION_CACHE_KEY_PREFIX = 'photo-action-parse:v1:'

export interface PhotoActionCacheEntry {
  fingerprint: string
  parserVersion: string
  catalogVersion: string
  status: 'action' | 'none' | 'unparsed'
  actionId?: string
  actionName?: string
  actionImageUrl?: string
  errorCode?: string
  uidSignature?: string
  parsedAt: number
}

function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return runStoreRequest(STORE_NAME, mode, action)
}

export async function saveAlbumDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await transaction('readwrite', (store) => store.put(handle, SAVED_DIRECTORY_KEY))
}

export async function saveX6GameDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await transaction('readwrite', (store) => store.put(handle, SAVED_X6GAME_DIRECTORY_KEY))
}

export async function getSavedAlbumDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await transaction('readonly', (store) => store.get(SAVED_DIRECTORY_KEY))
  } catch {
    return null
  }
}

export async function clearSavedAlbumDirectoryHandle(): Promise<void> {
  await transaction('readwrite', (store) => store.delete(SAVED_DIRECTORY_KEY))
}

export async function getSavedX6GameDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await transaction('readonly', (store) => store.get(SAVED_X6GAME_DIRECTORY_KEY))
  } catch {
    return null
  }
}

export async function clearSavedX6GameDirectoryHandle(): Promise<void> {
  await transaction('readwrite', (store) => store.delete(SAVED_X6GAME_DIRECTORY_KEY))
}

export async function getSavedCameraParamUids(): Promise<string[]> {
  try {
    const value = await transaction('readonly', (store) => store.get(SAVED_CAMERA_PARAM_UIDS_KEY))
    return Array.isArray(value)
      ? value.filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0)
      : []
  } catch {
    return []
  }
}

export async function addSavedCameraParamUid(uid: string): Promise<void> {
  const normalized = uid.trim()
  if (!normalized) return
  const current = await getSavedCameraParamUids()
  if (current.includes(normalized)) return
  await transaction('readwrite', (store) =>
    store.put([...current, normalized], SAVED_CAMERA_PARAM_UIDS_KEY)
  )
}

export async function getSavedOutfitParseResult(code: string): Promise<unknown> {
  return transaction('readonly', (store) =>
    store.get(`${OUTFIT_PARSE_CACHE_KEY_PREFIX}${OUTFIT_PARSE_CACHE_VERSION}${code}`)
  )
}

function photoActionCacheKey(albumKey: string, photoKey: string): string {
  return `${PHOTO_ACTION_CACHE_KEY_PREFIX}${encodeURIComponent(albumKey)}:${encodeURIComponent(photoKey)}`
}

/** 一批缓存共用事务，批次失败整体回滚；不会改动授权或业务存档。 */
export async function savePhotoActionCaches(
  albumKey: string,
  entries: ReadonlyArray<readonly [photoKey: string, entry: PhotoActionCacheEntry]>
): Promise<void> {
  if (!entries.length) return
  await runDatabaseTransaction([STORE_NAME], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE_NAME)
    for (const [photoKey, entry] of entries)
      store.put(entry, photoActionCacheKey(albumKey, photoKey))
  })
}

export async function savePhotoActionCache(
  albumKey: string,
  photoKey: string,
  entry: PhotoActionCacheEntry
): Promise<void> {
  await savePhotoActionCaches(albumKey, [[photoKey, entry]])
}

/** 按前缀范围删除，不枚举整张授权与缓存表。 */
async function clearCachePrefixes(prefixes: readonly string[]): Promise<void> {
  await runDatabaseTransaction([STORE_NAME], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE_NAME)
    for (const prefix of prefixes) store.delete(IDBKeyRange.bound(prefix, prefix + '\uffff'))
  })
}

export function clearSavedParseCaches(): Promise<void> {
  return clearCachePrefixes([
    PHOTO_ACTION_CACHE_KEY_PREFIX,
    OUTFIT_PARSE_CACHE_KEY_PREFIX,
    HOME_SCHEME_PARSE_CACHE_KEY_PREFIX
  ])
}

export async function saveOutfitParseResult(code: string, result: unknown): Promise<void> {
  await transaction('readwrite', (store) =>
    store.put(result, `${OUTFIT_PARSE_CACHE_KEY_PREFIX}${OUTFIT_PARSE_CACHE_VERSION}${code}`)
  )
}

export function clearSavedOutfitParseResults(): Promise<void> {
  return clearCachePrefixes([OUTFIT_PARSE_CACHE_KEY_PREFIX])
}

export async function getSavedHomeSchemeParseResult(code: string): Promise<unknown> {
  return transaction('readonly', (store) =>
    store.get(`${HOME_SCHEME_PARSE_CACHE_KEY_PREFIX}${code}`)
  )
}

export async function saveHomeSchemeParseResult(code: string, result: unknown): Promise<void> {
  await transaction('readwrite', (store) =>
    store.put(result, `${HOME_SCHEME_PARSE_CACHE_KEY_PREFIX}${code}`)
  )
}

/** One readonly transaction for an album instead of one connection per photo. */
export async function getSavedPhotoActionCaches(
  albumKey: string
): Promise<Map<string, PhotoActionCacheEntry>> {
  const prefix = PHOTO_ACTION_CACHE_KEY_PREFIX + encodeURIComponent(albumKey) + ':'
  try {
    let keys: IDBValidKey[] = []
    const values = await transaction('readonly', (store) => {
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff')
      const request = store.getAllKeys(range)
      request.onsuccess = () => {
        keys = request.result
      }
      return store.getAll(range)
    })
    return new Map(
      values.flatMap((value, index) => {
        const key = keys[index]
        if (typeof key !== 'string' || !value || typeof value !== 'object') return []
        try {
          return [
            [decodeURIComponent(key.slice(prefix.length)), value as PhotoActionCacheEntry] as const
          ]
        } catch {
          return []
        }
      })
    )
  } catch {
    return new Map()
  }
}
