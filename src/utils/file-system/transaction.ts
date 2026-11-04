import { annotateDiagnosticError } from '../errorReporting/errorReporter'
import { isDatabaseConnectionLost, openDb } from './database'
import {
  announceBackupChange,
  changedModules,
  journalStores,
  needsJournal,
  prepareJournal
} from '../directory-backup/changeJournal'
import { withBusinessWrites } from '../directory-backup/coordination'

export function databaseRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 事务内只等待 IDB 请求；文件、图片处理放在外部，提交后才返回成功。 */
export async function runDatabaseTransaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => Promise<T>
): Promise<T> {
  try {
    return await (needsJournal(stores, mode)
      ? withBusinessWrites(changedModules(stores), () =>
          runTransactionAttempt(stores, mode, action)
        )
      : runTransactionAttempt(stores, mode, action))
  } catch (error) {
    if (mode !== 'readonly' || !isDatabaseConnectionLost(error)) throw error
    return runTransactionAttempt(stores, mode, action)
  }
}

async function runTransactionAttempt<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => Promise<T>
): Promise<T> {
  const detail = { stage: 'indexeddb-transaction', context: { stores, mode } }
  const db = await openDb().catch((error) => {
    throw annotateDiagnosticError(error, detail)
  })
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction | undefined
    let result: T
    let failure: unknown
    try {
      const tracked = needsJournal(stores, mode)
      tx = db.transaction(tracked ? journalStores(stores) : stores, mode)
      tx.oncomplete = () => {
        db.close()
        if (tracked) announceBackupChange()
        resolve(result)
      }
      tx.onabort = () => {
        db.close()
        reject(
          annotateDiagnosticError(
            failure ?? tx!.error ?? new Error('IndexedDB transaction aborted'),
            detail
          )
        )
      }
      tx.onerror = () => {
        /* onabort reports the final failure */
      }
      const execution = tracked ? prepareJournal(tx).then(action) : action(tx)
      execution
        .then((value) => {
          result = value
        })
        .catch((error) => {
          failure = error
          try {
            tx!.abort()
          } catch {
            db.close()
            reject(annotateDiagnosticError(error, detail))
          }
        })
    } catch (error) {
      try {
        tx?.abort()
      } catch {
        /* already inactive */
      }
      db.close()
      reject(annotateDiagnosticError(error, detail))
    }
  })
}
