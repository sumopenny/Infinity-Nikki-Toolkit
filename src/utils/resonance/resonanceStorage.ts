import { cloneResonanceRecords, type ResonanceRecord } from './resonanceTypes'

import { openDb, runStoreRequest } from '../file-system/database'
const STORE_NAME = 'resonance-records'
const RECORDS_KEY = 'current-profile'

function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return runStoreRequest(STORE_NAME, mode, action)
}

export async function loadResonanceRecords(): Promise<ResonanceRecord[]> {
  const value = await transact<unknown>('readonly', (store) => store.get(RECORDS_KEY))
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('Invalid resonance storage')
  return value as ResonanceRecord[]
}

/** 整批替换全部共鸣记录，固定输入快照并等待事务提交；失败时原数据不变。 */
export async function saveResonanceRecords(records: ResonanceRecord[]): Promise<void> {
  const snapshot = cloneResonanceRecords(records)
  await transact('readwrite', (store) => store.put(snapshot, RECORDS_KEY))
}

/** 完整备份恢复在同一读写事务内合并最新记录；只覆盖备份中的 ID，不回写页面旧快照。 */
export async function mergeResonanceRecords(
  incoming: ResonanceRecord[]
): Promise<ResonanceRecord[]> {
  // 等待数据库连接前固定本次输入，避免调用方在等待期间改动导入内容。
  const imported = cloneResonanceRecords(incoming)
  const db = await openDb()
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    let merged: ResonanceRecord[] = []
    let failure: unknown
    try {
      tx = db.transaction(STORE_NAME, 'readwrite')
    } catch (error) {
      db.close()
      reject(error)
      return
    }
    tx.oncomplete = () => {
      db.close()
      resolve(merged)
    }
    tx.onabort = () => {
      db.close()
      reject(failure ?? tx.error ?? new Error('Resonance transaction aborted'))
    }
    tx.onerror = () => {
      /* 等待 onabort，避免请求成功但事务未提交时提前返回。 */
    }
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(RECORDS_KEY)
    request.onsuccess = () => {
      try {
        const current: unknown = request.result
        if (current !== undefined && !Array.isArray(current))
          throw new Error('Invalid resonance storage')
        const records = new Map(
          ((current ?? []) as ResonanceRecord[]).map((record) => [record.id, record])
        )
        for (const record of imported) records.set(record.id, record)
        merged = [...records.values()]
        if (imported.length) store.put(merged, RECORDS_KEY)
      } catch (error) {
        failure = error
        tx.abort()
      }
    }
  })
}
