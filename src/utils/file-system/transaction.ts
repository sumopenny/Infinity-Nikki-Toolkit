import type { IDBPTransaction, IDBPDatabase } from 'idb'
import { annotateDiagnosticError } from '../errorReporting/errorReporter'
import { closeDatabase, getDatabase, isDatabaseConnectionLost, type DatabaseMode } from './database'
import {
  announceBackupChange,
  changedModules,
  journalStores,
  needsJournal,
  prepareJournal
} from '../directory-backup/changeJournal'
import { withBusinessWrites } from '../directory-backup/coordination'

export type DatabaseTransaction<M extends DatabaseMode = 'readwrite'> = IDBPTransaction<
  unknown,
  string[],
  M
>

/** 事务内只等待数据库请求；文件、图片和哈希准备在事务外完成。 */
export async function runDatabaseTransaction<T, M extends DatabaseMode>(
  stores: string[],
  mode: M,
  action: (tx: DatabaseTransaction<M>) => Promise<T>
): Promise<T> {
  const tracked = needsJournal(stores, mode)
  try {
    return await (tracked
      ? withBusinessWrites(changedModules(stores), () => execute(stores, mode, action, true))
      : execute(stores, mode, action, false))
  } catch (error) {
    if (mode !== 'readonly' || !isDatabaseConnectionLost(error)) throw error
    closeDatabase()
    return execute(stores, mode, action, false)
  }
}

/** 恢复与重置专用：调用方持有独占锁，并负责日志与修订的原子调整。 */
export function runMaintenanceTransaction<T>(
  stores: string[],
  action: (tx: DatabaseTransaction) => Promise<T>
): Promise<T> {
  return execute(stores, 'readwrite', action, false)
}

async function execute<T, M extends DatabaseMode>(
  stores: string[],
  mode: M,
  action: (tx: DatabaseTransaction<M>) => Promise<T>,
  tracked: boolean
): Promise<T> {
  const detail = { stage: 'indexeddb-transaction', context: { stores, mode } }
  try {
    const db = await getDatabase()
    // 动态备份适配器跨不同值类型的表，统一执行器保留运行时校验边界。
    const tx: DatabaseTransaction<M> = (db as IDBPDatabase).transaction(
      tracked ? journalStores(stores) : stores,
      mode
    )
    // 立即监听提交失败，包括 action 同步抛错后产生的中止。
    const done = tx.done
    void done.catch(() => undefined)
    try {
      const value = await action(
        tracked
          ? ((await prepareJournal(
              tx as DatabaseTransaction<'readwrite'>
            )) as DatabaseTransaction<M>)
          : tx
      )
      await done
      if (tracked) announceBackupChange()
      return value
    } catch (error) {
      try {
        tx.abort()
      } catch {
        /* Already completed or aborted. */
      }
      await done.catch(() => undefined)
      throw error
    }
  } catch (error) {
    throw annotateDiagnosticError(error, detail)
  }
}
