import type { NikkiSchema } from './schema'
import { openDB, type IDBPDatabase, type IDBPObjectStore } from 'idb'
import type { BackupModule, ChangeKind } from '../directory-backup/changeJournal'
// 所有本地数据共用升级入口，避免先打开不同模块时漏建存储。
export const DB_NAME = 'nikki'
export const DB_VERSION = 12
/** Higher-version databases must never be reset or silently downgraded. */
const versionMismatchListeners = new Set<() => void>()
let versionMismatchDetected = false
export function isDatabaseVersionMismatch(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'VersionError' || error.message === 'DATABASE_VERSION_MISMATCH')
  )
}
export function subscribeDatabaseVersionMismatch(notify: () => void): () => void {
  versionMismatchListeners.add(notify)
  if (versionMismatchDetected) notify()
  return () => versionMismatchListeners.delete(notify)
}
function notifyVersionMismatch(): void {
  if (versionMismatchDetected) return
  versionMismatchDetected = true
  for (const notify of versionMismatchListeners) notify()
}
export const OUTFITS_STORE = 'outfits'
export const OUTFIT_IMAGES_STORE = 'outfit-images'
export const OUTFIT_TAGS_STORE = 'outfit-tags'
export const OUTFIT_IGNORED_CODES_STORE = 'outfit-ignored-codes'
export const OUTFIT_GAME_SOURCES_STORE = 'outfit-game-sources'
export const HOME_SCHEMES_STORE = 'home-schemes'
export const HOME_IMAGES_STORE = 'home-scheme-images'
export const HOME_TAGS_STORE = 'home-scheme-tags'
export const CAMERA_PARAMS_STORE = 'camera-params'
export const CAMERA_TAGS_STORE = 'camera-param-tags'
export const CAMERA_COVERS_STORE = 'camera-param-covers'
export const BACKUP_DIRTY_STORE = 'directory-backup-changes'
export const BACKUP_SETTINGS_STORE = 'directory-backup-state'
export const BACKUP_RESTORE_STORE = 'directory-backup-staging'

/** 业务表与备份变更类型的对应关系，与数据库表名保持一致。 */
export const BACKUP_MONITORED_STORES: Record<string, [BackupModule, ChangeKind]> = {
  [OUTFITS_STORE]: ['outfits', 'record'],
  [OUTFIT_IMAGES_STORE]: ['outfits', 'image'],
  [OUTFIT_TAGS_STORE]: ['outfits', 'tags'],
  [OUTFIT_IGNORED_CODES_STORE]: ['outfits', 'ignored'],
  [HOME_SCHEMES_STORE]: ['home', 'record'],
  [HOME_IMAGES_STORE]: ['home', 'image'],
  [HOME_TAGS_STORE]: ['home', 'tags'],
  [CAMERA_PARAMS_STORE]: ['camera', 'record'],
  [CAMERA_COVERS_STORE]: ['camera', 'image'],
  [CAMERA_TAGS_STORE]: ['camera', 'tags']
}

/** Match the browser connection-loss failure, excluding validation and quota errors. */
export function isDatabaseConnectionLost(error: unknown): boolean {
  return (
    (error instanceof Error || error instanceof DOMException) &&
    /Connection to Indexed Database server lost/i.test(error.message)
  )
}

export type DatabaseMode = 'readonly' | 'readwrite'
// 动态备份适配器按表名选择不同值类型，读取入口负责校验。
export type DatabaseStore<
  M extends DatabaseMode = 'readwrite',
  S extends string = string
> = IDBPObjectStore<unknown, string[], S, M>

/** 独立结构检查使用新连接；业务事务统一通过 getDatabase 复用连接。 */
export async function openDb(): Promise<IDBPDatabase<NikkiSchema>> {
  let connection: IDBPDatabase<NikkiSchema> | undefined
  let blocked = false
  let rejectBlocked!: (error: Error) => void
  const blockedResult = new Promise<never>((_, reject) => {
    rejectBlocked = reject
  })
  const opening = openDB<NikkiSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      const outfits = db.objectStoreNames.contains(OUTFITS_STORE)
        ? transaction.objectStore(OUTFITS_STORE)
        : db.createObjectStore(OUTFITS_STORE, { keyPath: 'id' })
      // Pending outfits omit codeKey, so multiple empty codes remain valid.
      if (!outfits.indexNames.contains('code'))
        outfits.createIndex('code', 'codeKey', { unique: true })
      for (const name of [OUTFIT_IMAGES_STORE, OUTFIT_GAME_SOURCES_STORE] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(OUTFIT_TAGS_STORE)) db.createObjectStore(OUTFIT_TAGS_STORE)
      if (!db.objectStoreNames.contains(OUTFIT_IGNORED_CODES_STORE))
        db.createObjectStore(OUTFIT_IGNORED_CODES_STORE, { keyPath: 'code' })
      for (const name of [
        'local-state',
        'resonance-records',
        'wardrobe',
        CAMERA_COVERS_STORE,
        CAMERA_TAGS_STORE
      ] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
      if (!db.objectStoreNames.contains(BACKUP_DIRTY_STORE))
        db.createObjectStore(BACKUP_DIRTY_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(BACKUP_SETTINGS_STORE))
        db.createObjectStore(BACKUP_SETTINGS_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(BACKUP_RESTORE_STORE))
        db.createObjectStore(BACKUP_RESTORE_STORE, { keyPath: ['module', 'kind', 'id'] })
      const favorites = db.objectStoreNames.contains(CAMERA_PARAMS_STORE)
        ? transaction.objectStore(CAMERA_PARAMS_STORE)
        : db.createObjectStore(CAMERA_PARAMS_STORE, { keyPath: 'id' })
      if (!favorites.indexNames.contains('code'))
        favorites.createIndex('code', 'code', { unique: true })
      const schemes = db.objectStoreNames.contains(HOME_SCHEMES_STORE)
        ? transaction.objectStore(HOME_SCHEMES_STORE)
        : db.createObjectStore(HOME_SCHEMES_STORE, { keyPath: 'id' })
      if (!schemes.indexNames.contains('code'))
        schemes.createIndex('code', 'code', { unique: true })
      if (!db.objectStoreNames.contains(HOME_IMAGES_STORE))
        db.createObjectStore(HOME_IMAGES_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(HOME_TAGS_STORE)) db.createObjectStore(HOME_TAGS_STORE)
    },
    blocked() {
      blocked = true
      rejectBlocked(new Error('数据库升级被其他页面占用，请关闭本站其他标签页后重试。'))
    },
    blocking() {
      connection?.close()
      invalidate(connection)
    },
    terminated() {
      invalidate(connection)
    }
  }).then((db) => {
    connection = db
    if (blocked) db.close()
    return db
  })
  try {
    return await Promise.race([opening, blockedResult])
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      notifyVersionMismatch()
      throw new Error('DATABASE_VERSION_MISMATCH', { cause: error })
    }
    throw error
  }
}

let shared: Promise<IDBPDatabase<NikkiSchema>> | undefined
let current: IDBPDatabase<NikkiSchema> | undefined
let factory: IDBFactory | undefined
function invalidate(db: IDBPDatabase<NikkiSchema> | undefined): void {
  if (db && current === db) {
    shared = undefined
    current = undefined
  }
}
export function getDatabase(): Promise<IDBPDatabase<NikkiSchema>> {
  if (factory !== indexedDB) {
    closeDatabase()
    factory = indexedDB
  }
  if (!shared) {
    const pending = openDb()
      .then((db) => {
        if (shared !== pending) {
          db.close()
          throw new DOMException('Database opening was cancelled', 'AbortError')
        }
        current = db
        return db
      })
      .catch((error) => {
        if (shared === pending) shared = undefined
        throw error
      })
    shared = pending
  }
  return shared
}
export function closeDatabase(): void {
  current?.close()
  current = undefined
  shared = undefined
}

/** 单请求与多表操作复用提交、回滚及备份追踪逻辑。 */
export function runStoreRequest<T>(
  storeName: string,
  mode: 'readonly',
  action: (store: DatabaseStore<'readonly'>) => Promise<T>
): Promise<T>
export function runStoreRequest<T>(
  storeName: string,
  mode: 'readwrite',
  action: (store: DatabaseStore<'readwrite'>) => Promise<T>
): Promise<T>
export function runStoreRequest<T, M extends DatabaseMode>(
  storeName: string,
  mode: M,
  action: (store: DatabaseStore<M>) => Promise<T>
): Promise<T>
export async function runStoreRequest<T, M extends DatabaseMode>(
  storeName: string,
  mode: M,
  action: (store: DatabaseStore<M>) => Promise<T>
): Promise<T> {
  const { runDatabaseTransaction } = await import('./transaction')
  return runDatabaseTransaction([storeName], mode, (tx) => action(tx.objectStore(storeName)))
}

/** 原子清空全部表，不把全站重置转换为电脑备份的删除任务。 */
export async function clearAllBrowserData(): Promise<void> {
  const { runMaintenanceTransaction } = await import('./transaction')
  const db = await getDatabase()
  await runMaintenanceTransaction([...db.objectStoreNames], async (tx) => {
    for (const name of tx.objectStoreNames) await tx.objectStore(name).clear()
  })
  closeDatabase()
}
