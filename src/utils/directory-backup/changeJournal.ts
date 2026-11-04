import {
  BACKUP_DIRTY_STORE,
  BACKUP_SETTINGS_STORE,
  CAMERA_COVERS_STORE,
  CAMERA_FAVORITES_STORE,
  CAMERA_TAGS_STORE,
  HOME_IMAGES_STORE,
  HOME_SCHEMES_STORE,
  HOME_TAGS_STORE,
  OUTFIT_IGNORED_CODES_STORE,
  OUTFIT_IMAGES_STORE,
  OUTFIT_TAGS_STORE,
  OUTFITS_STORE
} from '../file-system/database'
import { createUuid } from '../uuid'

export type BackupModule = 'outfits' | 'home' | 'camera'
export type ChangeKind = 'record' | 'image' | 'tags' | 'ignored' | 'reset'
export interface DirtyChange {
  key: [BackupModule, ChangeKind, string]
  revision: string
  at: string
  /** 仅在用户确认删除后、与业务删除同一事务写入。 */
  intent?: 'confirmed-delete'
}
export interface Revision {
  key: string
  revision: string
}
export const revisionKey = (module: BackupModule) => `revision:${module}`
const monitored: Record<string, [BackupModule, ChangeKind]> = {
  [OUTFITS_STORE]: ['outfits', 'record'],
  [OUTFIT_IMAGES_STORE]: ['outfits', 'image'],
  [OUTFIT_TAGS_STORE]: ['outfits', 'tags'],
  [OUTFIT_IGNORED_CODES_STORE]: ['outfits', 'ignored'],
  [HOME_SCHEMES_STORE]: ['home', 'record'],
  [HOME_IMAGES_STORE]: ['home', 'image'],
  [HOME_TAGS_STORE]: ['home', 'tags'],
  [CAMERA_FAVORITES_STORE]: ['camera', 'record'],
  [CAMERA_COVERS_STORE]: ['camera', 'image'],
  [CAMERA_TAGS_STORE]: ['camera', 'tags']
}
export const changedModules = (stores: string[]): BackupModule[] => [
  ...new Set(stores.flatMap((name) => (monitored[name] ? [monitored[name][0]] : [])))
]
export const needsJournal = (stores: string[], mode: IDBTransactionMode): boolean =>
  mode === 'readwrite' && changedModules(stores).length > 0
export const journalStores = (stores: string[]): string[] => [
  ...new Set([...stores, BACKUP_DIRTY_STORE, BACKUP_SETTINGS_STORE])
]

interface Tracking {
  enabled: Partial<Record<BackupModule, boolean>>
  revisions: Map<BackupModule, string>
  confirmedDeletes: Set<BackupModule>
}
const contexts = new WeakMap<IDBTransaction, Tracking>()

/** 只等待 IDB 请求；读配置、写业务、推进修订和合并脏项处于同一个事务。 */
export async function prepareJournal(tx: IDBTransaction): Promise<IDBTransaction> {
  const config = await new Promise<{ enabled?: Tracking['enabled'] } | undefined>(
    (resolve, reject) => {
      const request = tx.objectStore(BACKUP_SETTINGS_STORE).get('config')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }
  )
  contexts.set(tx, {
    enabled: config?.enabled ?? {},
    revisions: new Map(),
    confirmedDeletes: new Set()
  })
  return trackTransaction(tx)
}
/** 只允许已向用户展示确认框的业务删除入口调用；与删除原子提交。 */
export function markConfirmedDeletion(tx: IDBTransaction, module: BackupModule): void {
  const context = contexts.get(tx)
  if (!context)
    throw new Error('Backup journal must be initialized inside the business transaction')
  context.confirmedDeletes.add(module)
}
function mark(
  tx: IDBTransaction,
  module: BackupModule,
  kind: ChangeKind,
  id: string,
  deletion = false
) {
  const context = contexts.get(tx)
  if (!context)
    throw new Error('Backup journal must be initialized inside the business transaction')
  if (!context.revisions.has(module)) {
    const revision = createUuid()
    context.revisions.set(module, revision)
    tx.objectStore(BACKUP_SETTINGS_STORE).put({
      key: revisionKey(module),
      revision
    } satisfies Revision)
  }
  // 关闭时只推进小型模块修订，不积攒永不消费的删除任务；重新开启会显式全量比对。
  if (context.enabled[module]) {
    tx.objectStore(BACKUP_DIRTY_STORE).put({
      key: [module, kind, id],
      revision: context.revisions.get(module)!,
      at: new Date().toISOString(),
      ...(deletion && context.confirmedDeletes.has(module)
        ? { intent: 'confirmed-delete' as const }
        : {})
    } satisfies DirtyChange)
  }
}

/** 局部代理而非修改 IDB 原型；所有调用保持原生请求和事务回滚语义。 */
export function trackTransaction(tx: IDBTransaction): IDBTransaction {
  const cache = new Map<string, IDBObjectStore>()
  const storeFor = (name: string) => {
    const cached = cache.get(name)
    if (cached) return cached
    const native = tx.objectStore(name)
    const entry = monitored[name]
    if (!entry) return native
    const store = new Proxy(native, {
      get(target, prop) {
        if (prop === 'put' || prop === 'add')
          return (value: unknown, key?: IDBValidKey) => {
            const result = key === undefined ? target[prop](value) : target[prop](value, key)
            const actual =
              key ??
              (typeof target.keyPath === 'string'
                ? (value as Record<string, IDBValidKey>)[target.keyPath]
                : undefined)
            const id = entry[1] === 'tags' ? 'default' : String(actual ?? '')
            if (!id) throw new Error('Invalid backup change key')
            mark(tx, entry[0], entry[1], id)
            return result
          }
        if (prop === 'delete')
          return (key: IDBValidKey | IDBKeyRange) => {
            const result = target.delete(key)
            mark(
              tx,
              entry[0],
              key instanceof IDBKeyRange ? 'reset' : entry[1],
              key instanceof IDBKeyRange ? '*' : String(key),
              true
            )
            return result
          }
        if (prop === 'clear')
          return () => {
            const result = target.clear()
            mark(tx, entry[0], 'reset', '*', true)
            return result
          }
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      }
    })
    cache.set(name, store)
    return store
  }
  const tracked = new Proxy(tx, {
    get(target, prop) {
      if (prop === 'objectStore') return storeFor
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
  // 业务 action 收到代理事务，操作来源标记需要共享原生事务的上下文。
  const context = contexts.get(tx)
  if (context) contexts.set(tracked, context)
  return tracked
}
/** 当前业务唯一的 IDBCursor.update 入口，不能从 objectStore.put 代理捕获。 */
export function markCursorUpdate(tx: IDBTransaction, module: BackupModule, id: string): void {
  mark(tx, module, 'record', id)
}
export function announceBackupChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('nuan-backup-change'))
  try {
    const channel = new window.BroadcastChannel('nuan-backup-change')
    channel.postMessage('changed')
    channel.close()
  } catch {
    /* BroadcastChannel 仅用于调度；正确性由持久队列和锁保证。 */
  }
}
