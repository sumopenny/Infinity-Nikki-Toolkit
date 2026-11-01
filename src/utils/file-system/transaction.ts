import { annotateDiagnosticError } from '../errorReporting/errorReporter'
import { isDatabaseConnectionLost, openDb } from './database'

export function databaseRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 仅在事务内等待 IndexedDB 请求；图片/文件处理须提前完成，提交后才返回成功。 */
export async function runDatabaseTransaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => Promise<T>
): Promise<T> {
  try {
    return await runTransactionAttempt(stores, mode, action)
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
      tx = db.transaction(stores, mode)
      tx.oncomplete = () => {
        db.close()
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
      action(tx)
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
