import { databaseRequest, runDatabaseTransaction } from './file-system/transaction'
import { parsePearpalResonance, PEARPAL_NO_RECORDS } from './resonance/resonanceImport'
import { parseResonanceFile } from './resonance/resonanceFile'
import { cloneResonanceRecords, type ResonanceRecord } from './resonance/resonanceTypes'
import { loadWardrobeCatalog } from './wardrobe/wardrobeCatalog'
import { parseWardrobePearpal } from './wardrobe/wardrobeImport'
import type { WardrobeRegionScope } from './wardrobe/wardrobeRegion'
import {
  emptyWardrobe,
  parseWardrobeBackup,
  validateWardrobe,
  type WardrobeSnapshot
} from './wardrobe/wardrobeStorage'

export interface DataPreview {
  resonance: ResonanceRecord[] | null
  wardrobe: WardrobeSnapshot | null
  skippedPools: number
}

export type DataPreviewStage = 'check' | 'wardrobe' | 'resonance'
export interface DataPreviewOptions {
  regionScope?: WardrobeRegionScope
  signal?: AbortSignal
  onProgress?: (
    stage: DataPreviewStage,
    stages: readonly DataPreviewStage[]
  ) => void | Promise<void>
}

/** 两种备份仅启用自身模块；原始手账分别解析，缺失的数据不可用于清空另一模块。 */
export async function parseDataPreview(
  value: unknown,
  options: DataPreviewOptions = {}
): Promise<DataPreview> {
  const raw = value as {
    format?: string
    info_from_self?: { suit_list?: unknown; gacha_list?: unknown }
    info_from_gm?: { clothes?: unknown }
  } | null
  const wardrobeBackup = raw?.format === 'nikki-personal-wardrobe'
  const resonanceBackup =
    !wardrobeBackup &&
    (!!raw?.format ||
      (!!raw && typeof raw === 'object' && !('info_from_self' in raw || 'info_from_gm' in raw)))
  const hasWardrobe =
    wardrobeBackup ||
    (!resonanceBackup &&
      (Array.isArray(raw?.info_from_self?.suit_list) || Array.isArray(raw?.info_from_gm?.clothes)))
  const hasResonance = resonanceBackup || (!wardrobeBackup && !!raw?.info_from_self?.gacha_list)
  const stages: DataPreviewStage[] = ['check']
  if (hasWardrobe) stages.push('wardrobe')
  if (hasResonance) stages.push('resonance')
  const checkCurrent = () => {
    if (options.signal?.aborted) throw new DOMException('Import cancelled', 'AbortError')
  }
  // 在实际工作边界报告阶段；回调可让页面先绘制进度，取消后不再继续解析。
  const report = async (stage: DataPreviewStage) => {
    checkCurrent()
    await options.onProgress?.(stage, stages)
    checkCurrent()
  }
  await report('check')
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_IMPORT')
  const result: DataPreview = { resonance: null, wardrobe: null, skippedPools: 0 }
  if (raw.format === 'nikki-personal-wardrobe') {
    await report('wardrobe')
    result.wardrobe = parseWardrobeBackup(JSON.stringify(raw))
    // 备份自身的明确区服优先；旧备份允许用户选择，未提供选择时保持兼容行为。
    if (result.wardrobe.regionScope === undefined && options.regionScope !== undefined)
      result.wardrobe.regionScope = options.regionScope
    return result
  }
  if (raw.format || !('info_from_self' in raw || 'info_from_gm' in raw)) {
    await report('resonance')
    const parsed = await parseResonanceFile(raw, true)
    checkCurrent()
    result.resonance = parsed.records
    result.skippedPools = parsed.skippedPools
    return result
  }
  // 单独的共鸣清单不能证明完整衣橱；至少需要手账套装或直接服装字段。
  if (Array.isArray(raw.info_from_self?.suit_list) || Array.isArray(raw.info_from_gm?.clothes)) {
    await report('wardrobe')
    const catalog = await loadWardrobeCatalog()
    checkCurrent()
    result.wardrobe = parseWardrobePearpal(raw, catalog, options.regionScope).snapshot
  }
  if (raw.info_from_self?.gacha_list) {
    await report('resonance')
    try {
      const parsed = await parsePearpalResonance(raw, undefined, options.signal)
      checkCurrent()
      result.resonance = parsed.records
      result.skippedPools = parsed.skippedPools
    } catch (error) {
      if (!(error instanceof Error) || error.message !== PEARPAL_NO_RECORDS) throw error
    }
  }
  if (result.resonance === null && result.wardrobe === null) throw new Error('NO_IMPORT_DATA')
  return result
}

/** 选中的模块在同一事务内校验预览基线并替换，任一失败均回滚，未勾选模块不读写。 */
export async function saveDataImport(
  data: DataPreview,
  selected: { resonance: boolean; wardrobe: boolean },
  base: { resonance: string; wardrobe: string }
): Promise<void> {
  const resonance = selected.resonance ? data.resonance : null
  const wardrobe = selected.wardrobe ? data.wardrobe : null
  const jobs: {
    store: 'resonance-records' | 'wardrobe'
    key: string
    expected: string
    value: unknown
    empty: unknown
  }[] = []
  if (resonance !== null)
    jobs.push({
      store: 'resonance-records',
      key: 'current-profile',
      expected: base.resonance,
      value: cloneResonanceRecords(resonance),
      empty: []
    })
  if (wardrobe !== null)
    jobs.push({
      store: 'wardrobe',
      key: 'current',
      expected: base.wardrobe,
      value: { ...validateWardrobe(wardrobe), updatedAt: new Date().toISOString() },
      empty: emptyWardrobe()
    })
  if (!jobs.length) throw new Error('NO_SELECTION')
  await runDatabaseTransaction(
    jobs.map((job) => job.store),
    'readwrite',
    async (tx) => {
      for (const job of jobs) {
        const store = tx.objectStore(job.store)
        const value: unknown = await databaseRequest(store.get(job.key))
        const current =
          value === undefined
            ? job.empty
            : job.store === 'wardrobe'
              ? validateWardrobe(value)
              : value
        if (JSON.stringify(current) !== job.expected) throw new Error('LOCAL_CHANGED')
        store.put(job.value, job.key)
      }
    }
  )
}
