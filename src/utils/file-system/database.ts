// 所有本地数据共用升级入口，避免先打开不同模块时漏建存储。
export const DB_NAME = 'infinity-nikki-album-manager'
export const DB_VERSION = 9
export const OUTFITS_STORE = 'outfits'
export const OUTFIT_IMAGES_STORE = 'outfit-images'
export const OUTFIT_TAGS_STORE = 'outfit-tags'
export const OUTFIT_IGNORED_CODES_STORE = 'outfit-ignored-sharecodes'
export const OUTFIT_GAME_SOURCES_STORE = 'outfit-game-sources'
export const OUTFIT_MIGRATION_SOURCES_STORE = 'outfit-migration-sources'
export const OUTFIT_MIGRATION_ENTRIES_STORE = 'outfit-migration-entries'
export const HOME_SCHEMES_STORE = 'home-schemes'
export const HOME_IMAGES_STORE = 'home-scheme-images'
export const HOME_TAGS_STORE = 'home-scheme-tags'
export const HOME_MIGRATION_SOURCES_STORE = 'home-scheme-migration-sources'
export const HOME_MIGRATION_ENTRIES_STORE = 'home-scheme-migration-entries'
export const CAMERA_FAVORITES_STORE = 'camera-favorites'
export const CAMERA_TAGS_STORE = 'camera-favorite-tags'
export const CAMERA_COVERS_STORE = 'camera-favorite-covers'

/** Match the browser connection-loss failure, excluding validation and quota errors. */
export function isDatabaseConnectionLost(error: unknown): boolean {
  return (
    (error instanceof Error || error instanceof DOMException) &&
    /Connection to Indexed Database server lost/i.test(error.message)
  )
}

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const outfits = db.objectStoreNames.contains(OUTFITS_STORE)
        ? request.transaction!.objectStore(OUTFITS_STORE)
        : db.createObjectStore(OUTFITS_STORE, { keyPath: 'id' })
      // Pending outfits omit codeKey, so multiple empty codes remain valid.
      if (!outfits.indexNames.contains('code'))
        outfits.createIndex('code', 'codeKey', { unique: true })
      for (const name of [
        OUTFIT_IMAGES_STORE,
        OUTFIT_GAME_SOURCES_STORE,
        OUTFIT_MIGRATION_SOURCES_STORE
      ]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(OUTFIT_TAGS_STORE)) db.createObjectStore(OUTFIT_TAGS_STORE)
      if (!db.objectStoreNames.contains(OUTFIT_IGNORED_CODES_STORE))
        db.createObjectStore(OUTFIT_IGNORED_CODES_STORE, { keyPath: 'code' })
      if (!db.objectStoreNames.contains(OUTFIT_MIGRATION_ENTRIES_STORE)) {
        db.createObjectStore(OUTFIT_MIGRATION_ENTRIES_STORE, { keyPath: ['sourceId', 'fileName'] })
      }
      for (const name of [
        'album-handles',
        'resonance-records',
        'wardrobe',
        CAMERA_COVERS_STORE,
        CAMERA_TAGS_STORE
      ]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
      }
      const favorites = db.objectStoreNames.contains(CAMERA_FAVORITES_STORE)
        ? request.transaction!.objectStore(CAMERA_FAVORITES_STORE)
        : db.createObjectStore(CAMERA_FAVORITES_STORE, { keyPath: 'id' })
      if (!favorites.indexNames.contains('code'))
        favorites.createIndex('code', 'code', { unique: true })
      const schemes = db.objectStoreNames.contains(HOME_SCHEMES_STORE)
        ? request.transaction!.objectStore(HOME_SCHEMES_STORE)
        : db.createObjectStore(HOME_SCHEMES_STORE, { keyPath: 'id' })
      if (!schemes.indexNames.contains('code'))
        schemes.createIndex('code', 'code', { unique: true })
      for (const name of [HOME_IMAGES_STORE, HOME_MIGRATION_SOURCES_STORE]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(HOME_TAGS_STORE)) db.createObjectStore(HOME_TAGS_STORE)
      if (!db.objectStoreNames.contains(HOME_MIGRATION_ENTRIES_STORE)) {
        db.createObjectStore(HOME_MIGRATION_ENTRIES_STORE, { keyPath: ['sourceId', 'fileName'] })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      reject(new Error('数据库升级被其他页面占用，请关闭本站其他标签页后重试。'))
      // 阻塞解除后请求可能仍成功，关闭无人使用的连接。
      request.onsuccess = () => request.result.close()
    }
  })
}

/** Resolve writes only after the transaction has committed. */
export async function runStoreRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    let request: IDBRequest<T> | undefined
    let result: T
    let tx: IDBTransaction | undefined
    try {
      tx = db.transaction(storeName, mode)
      tx.oncomplete = () => {
        db.close()
        resolve(result)
      }
      tx.onabort = () => {
        db.close()
        reject(tx?.error ?? request?.error ?? new Error('IndexedDB transaction aborted'))
      }
      tx.onerror = () => {
        /* onabort reports the final transaction failure. */
      }
      request = action(tx.objectStore(storeName))
      request.onsuccess = () => {
        result = request!.result
      }
    } catch (error) {
      try {
        tx?.abort()
      } catch {
        /* Transaction may already be inactive. */
      }
      db.close()
      reject(error)
    }
  })
}

/** 在同一事务内清空全部存储表，包含收藏、图片、授权和迁移来源；失败时整体回滚。 */
export async function clearAllBrowserData(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction | undefined
    try {
      const names = [...db.objectStoreNames]
      tx = db.transaction(names, 'readwrite')
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onabort = () => {
        db.close()
        reject(tx?.error ?? new Error('IndexedDB reset aborted'))
      }
      tx.onerror = () => {
        /* onabort reports the final failure. */
      }
      for (const name of names) tx.objectStore(name).clear()
    } catch (error) {
      try {
        tx?.abort()
      } catch {
        /* Transaction may already be inactive. */
      }
      db.close()
      reject(error)
    }
  })
}
