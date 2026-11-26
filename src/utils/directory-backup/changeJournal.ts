import type { DatabaseTransaction } from '../file-system/transaction'
import type { DatabaseStore } from '../file-system/database'
import {
  BACKUP_DIRTY_STORE,
  BACKUP_SETTINGS_STORE,
  BACKUP_MONITORED_STORES as monitored
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
const contexts = new WeakMap<DatabaseTransaction, Tracking>()

/** 只等待 IDB 请求；读配置、写业务、推进修订和合并脏项处于同一个事务。 */
export async function prepareJournal(tx: DatabaseTransaction): Promise<DatabaseTransaction> {
  const config = (await tx.objectStore(BACKUP_SETTINGS_STORE).get('config')) as
    { enabled?: Tracking['enabled'] } | undefined
  contexts.set(tx, {
    enabled: config?.enabled ?? {},
    revisions: new Map(),
    confirmedDeletes: new Set()
  })
  return trackTransaction(tx)
}
/** 只允许已向用户展示确认框的业务删除入口调用；与删除原子提交。 */
export function markConfirmedDeletion(tx: DatabaseTransaction, module: BackupModule): void {
  const context = contexts.get(tx)
  if (!context)
    throw new Error('Backup journal must be initialized inside the business transaction')
  context.confirmedDeletes.add(module)
}
async function mark(
  tx: DatabaseTransaction,
  module: BackupModule,
  kind: ChangeKind,
  id: string,
  deletion = false
) {
  const context = contexts.get(tx)
  if (!context)
    throw new Error('Backup journal must be initialized inside the business transaction')
  const writes: Promise<unknown>[] = []
  try {
    if (!context.revisions.has(module)) {
      const revision = createUuid()
      context.revisions.set(module, revision)
      writes.push(
        tx.objectStore(BACKUP_SETTINGS_STORE).put({
          key: revisionKey(module),
          revision
        } satisfies Revision)
      )
    }
    // 关闭时只推进小型模块修订，不积攒永不消费的删除任务；重新开启会显式全量比对。
    if (context.enabled[module]) {
      writes.push(
        tx.objectStore(BACKUP_DIRTY_STORE).put({
          key: [module, kind, id],
          revision: context.revisions.get(module)!,
          at: new Date().toISOString(),
          ...(deletion && context.confirmedDeletes.has(module)
            ? { intent: 'confirmed-delete' as const }
            : {})
        } satisfies DirtyChange)
      )
    }
  } finally {
    // 后续请求可能同步抛错；已入队请求中止时仍需有人接收拒绝。
    for (const write of writes) void write.catch(() => undefined)
  }
  await Promise.all(writes)
}

/** 局部代理 idb 表方法；业务和日志共享同一个底层事务。 */
export function trackTransaction(tx: DatabaseTransaction): DatabaseTransaction {
  const cache = new Map<string, DatabaseStore>()
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
            const actual =
              key ??
              (typeof target.keyPath === 'string'
                ? (value as Record<string, IDBValidKey>)[target.keyPath]
                : undefined)
            const id = entry[1] === 'tags' ? 'default' : String(actual ?? '')
            if (!id) throw new Error('Invalid backup change key')
            const result = key === undefined ? target[prop](value) : target[prop](value, key)
            return Promise.all([result, mark(tx, entry[0], entry[1], id)]).then(([key]) => key)
          }
        if (prop === 'delete')
          return (key: IDBValidKey | IDBKeyRange) => {
            const result = target.delete(key)
            const journal = mark(
              tx,
              entry[0],
              key instanceof IDBKeyRange ? 'reset' : entry[1],
              key instanceof IDBKeyRange ? '*' : String(key),
              true
            )
            return Promise.all([result, journal]).then(([value]) => value)
          }
        if (prop === 'clear')
          return () => {
            const result = target.clear()
            return Promise.all([result, mark(tx, entry[0], 'reset', '*', true)]).then(
              ([value]) => value
            )
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
