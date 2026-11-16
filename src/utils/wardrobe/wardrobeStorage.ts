import { openDb, runStoreRequest } from '../file-system/database'
import type { WardrobeCatalog } from './wardrobeCatalog'
import { wardrobeRegionScope, type WardrobeRegionScope } from './wardrobeRegion'

import { emptyWardrobe, validateWardrobe, type WardrobeSnapshot } from './wardrobeSchema'
export {
  emptyWardrobe,
  validateWardrobe,
  type WardrobeSnapshot,
  type Ownership,
  type OwnershipSource
} from './wardrobeSchema'

/** 无副作用读取；用于云端预览基线与提交前复查。 */
export async function readWardrobeSnapshot(): Promise<WardrobeSnapshot> {
  const value = await runStoreRequest('wardrobe', 'readonly', (store) => store.get('current'))
  return value === undefined ? emptyWardrobe() : validateWardrobe(value)
}

export type WardrobeLoadStage = 'read-storage' | 'load-catalog' | 'resolve-suits' | 'write-storage'

export async function loadWardrobe(
  onStage?: (stage: WardrobeLoadStage) => void
): Promise<WardrobeSnapshot> {
  onStage?.('read-storage')
  const snapshot = await readWardrobeSnapshot()
  if (!snapshot.unknownSuitIds.length) return snapshot
  onStage?.('load-catalog')
  const { loadWardrobeCatalog } = await import('./wardrobeCatalog')
  const catalog = await loadWardrobeCatalog()
  onStage?.('resolve-suits')
  if (resolveUnknownWardrobeSuits(snapshot, catalog) === snapshot) return snapshot
  // Re-read inside the transaction so another tab's import is never overwritten.
  onStage?.('write-storage')
  return updateWardrobe((latest) => resolveUnknownWardrobeSuits(latest, catalog))
}

/** 读改写位于同一事务；导入和清空整份替换时验证基线，避免覆盖其他标签页的新数据。 */
export async function updateWardrobe(
  change: (latest: WardrobeSnapshot) => WardrobeSnapshot,
  expected?: string
): Promise<WardrobeSnapshot> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('wardrobe', 'readwrite')
    const store = tx.objectStore('wardrobe')
    let result: WardrobeSnapshot
    let failure: unknown
    tx.oncomplete = () => {
      db.close()
      resolve(result)
    }
    tx.onabort = () => {
      db.close()
      reject(failure ?? tx.error)
    }
    tx.onerror = () => {
      /* 等待事务回滚后统一报告。 */
    }
    const request = store.get('current')
    request.onsuccess = () => {
      try {
        const current =
          request.result === undefined ? emptyWardrobe() : validateWardrobe(request.result)
        if (expected !== undefined && JSON.stringify(current) !== expected)
          throw new Error('WARDROBE_CHANGED')
        result = validateWardrobe(change(current))
        result.updatedAt = new Date().toISOString()
        store.put(result, 'current')
      } catch (error) {
        failure = error
        tx.abort()
      }
    }
  })
}
export function createWardrobeBackup(snapshot: WardrobeSnapshot): string {
  return JSON.stringify(
    { format: 'nikki-personal-wardrobe', version: 1, data: validateWardrobe(snapshot) },
    null,
    2
  )
}
export function parseWardrobeBackup(text: string): WardrobeSnapshot {
  const file = JSON.parse(text)
  if (file?.format !== 'nikki-personal-wardrobe' || file.version !== 1)
    throw new Error('INVALID_WARDROBE')
  return validateWardrobe(file.data)
}

/** Resolve only complete catalog mappings; retain IDs whose pieces are still unavailable. */
export function resolveUnknownWardrobeSuits(
  snapshot: WardrobeSnapshot,
  catalog: WardrobeCatalog
): WardrobeSnapshot {
  const resolvable = snapshot.unknownSuitIds.filter((id) => {
    const outfit = catalog.byId.get(id)
    return (
      outfit?.kind === 'outfit' &&
      outfit.parts.length > 0 &&
      outfit.parts.every((part) => catalog.byId.get(part)?.kind === 'item')
    )
  })
  if (!resolvable.length) return snapshot
  const resolved = new Set(resolvable)
  const entries = { ...snapshot.entries }
  for (const id of resolvable)
    for (const part of catalog.byId.get(id)!.parts)
      entries[part] = { owned: true, source: 'pearpal' }
  return {
    ...snapshot,
    entries,
    unknownSuitIds: snapshot.unknownSuitIds.filter((id) => !resolved.has(id))
  }
}

/** 合并已拥有记录；总备份可传入明确确认的展示区服，并校验恢复期间区服未变化。 */
export async function mergeWardrobe(
  incoming: WardrobeSnapshot,
  options: { regionScope?: WardrobeRegionScope; expectedRegionScope?: WardrobeRegionScope } = {}
): Promise<{ saved: number; skipped: number }> {
  const data = validateWardrobe(incoming)
  const catalog = data.unknownSuitIds.length
    ? await import('./wardrobeCatalog').then((module) => module.loadWardrobeCatalog())
    : null
  let saved = 0,
    skipped = 0
  await updateWardrobe((latest) => {
    if (
      options.expectedRegionScope !== undefined &&
      wardrobeRegionScope(latest) !== options.expectedRegionScope
    )
      throw new Error('WARDROBE_CHANGED')
    const entries = { ...latest.entries }
    for (const [id, entry] of Object.entries(data.entries)) {
      const existing = entries[id]
      if (!existing || (!existing.owned && entry.owned)) {
        entries[id] = entry
        saved++
      } else skipped++
    }
    const unknown = new Set(latest.unknownSuitIds)
    for (const id of data.unknownSuitIds) {
      if (unknown.has(id)) skipped++
      else {
        unknown.add(id)
        saved++
      }
    }
    const result = {
      ...latest,
      // 总备份使用确认后的展示区服；普通合并默认保持已有区服，空库继承备份。
      ...(options.regionScope !== undefined
        ? { regionScope: options.regionScope }
        : !latest.imported && !Object.keys(latest.entries).length && data.regionScope
          ? { regionScope: data.regionScope }
          : {}),
      entries,
      unknownSuitIds: [...unknown],
      imported: !!latest.imported || !!data.imported
    }
    return catalog ? resolveUnknownWardrobeSuits(result, catalog) : result
  })
  return { saved, skipped }
}
