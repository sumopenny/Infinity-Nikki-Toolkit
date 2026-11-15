import { cloneJsonData } from '../cloneJsonData'
import { openDb } from '../file-system/database'
import { emptyWardrobe, validateWardrobe, wardrobeBaseline } from '../wardrobe/wardrobeSchema'
import {
  archiveModules,
  type ArchiveLocal,
  type ArchiveModule,
  type ArchiveSnapshot
} from './archiveSchema'

const stores = { resonance: 'resonance-records', wardrobe: 'wardrobe' }
const keys = { resonance: 'current-profile', wardrobe: 'current' }
function decode(module: ArchiveModule, value: unknown) {
  if (module === 'wardrobe') return value === undefined ? emptyWardrobe() : validateWardrobe(value)
  if (value !== undefined && !Array.isArray(value)) throw new Error('LOCAL_READ_FAILED')
  return value ?? []
}
export const archiveBaseline = (module: ArchiveModule, value: ArchiveLocal[ArchiveModule]) =>
  module === 'wardrobe'
    ? wardrobeBaseline(value as ArchiveLocal['wardrobe'])
    : JSON.stringify(value)

export interface ArchiveLocalPreview {
  data: Partial<ArchiveLocal>
  errors: Partial<Record<ArchiveModule, string>>
}

/** 同一只读事务固定预览；模块解码错误单独报告，数据库故障仍使整个读取失败。 */
export async function readArchiveLocalPreview(
  selected: readonly ArchiveModule[] = archiveModules
): Promise<ArchiveLocalPreview> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(
        selected.map((module) => stores[module]),
        'readonly'
      )
    } catch (cause) {
      db.close()
      reject(cause)
      return
    }
    const output: ArchiveLocalPreview = { data: {}, errors: {} }
    tx.oncomplete = () => {
      db.close()
      resolve(output)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error ?? new Error('LOCAL_READ_FAILED'))
    }
    tx.onerror = () => {}
    for (const module of selected) {
      const request = tx.objectStore(stores[module]).get(keys[module])
      request.onsuccess = () => {
        try {
          Object.assign(output.data, { [module]: decode(module, request.result) })
        } catch {
          output.errors[module] = 'INVALID_DATA'
        }
      }
    }
  })
}

export function readArchiveLocal(): Promise<ArchiveLocal>
export function readArchiveLocal(selected: ArchiveModule[]): Promise<Partial<ArchiveLocal>>
/** 备份和提交复查采用严格读取，只校验被选择模块，绝不把坏数据替换成空存档。 */
export async function readArchiveLocal(
  selected: ArchiveModule[] = [...archiveModules]
): Promise<Partial<ArchiveLocal>> {
  const preview = await readArchiveLocalPreview(selected)
  if (selected.some((module) => preview.errors[module])) throw new Error('LOCAL_READ_FAILED')
  return preview.data
}

/** 先在同一读写事务核对全部基线，再写入；任一失败都回滚两个模块。 */
export async function replaceArchiveLocal(
  expected: Partial<ArchiveLocal>,
  incoming: ArchiveSnapshot,
  selected: ArchiveModule[]
) {
  const snapshot = cloneJsonData(incoming)
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(
        selected.map((k) => stores[k]),
        'readwrite'
      )
    } catch (cause) {
      db.close()
      reject(cause)
      return
    }
    let failure: unknown,
      remaining = selected.length
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onabort = () => {
      db.close()
      reject(failure ?? tx.error)
    }
    tx.onerror = () => {}
    for (const module of selected) {
      const request = tx.objectStore(stores[module]).get(keys[module])
      request.onsuccess = () => {
        try {
          if (
            expected[module] === undefined ||
            archiveBaseline(
              module,
              decode(module, request.result) as ArchiveLocal[ArchiveModule]
            ) !== archiveBaseline(module, expected[module]!)
          )
            throw new Error('LOCAL_CHANGED')
          if (--remaining !== 0) return
          for (const key of selected) {
            const value =
              key === 'resonance'
                ? snapshot.resonance!.records
                : {
                    ...validateWardrobe(snapshot.wardrobe!.data),
                    updatedAt: new Date().toISOString()
                  }
            tx.objectStore(stores[key]).put(value, keys[key])
          }
        } catch (error) {
          failure = error
          tx.abort()
        }
      }
    }
  })
}
