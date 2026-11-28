import type { ResonancePull, ResonanceRecord } from './resonanceTypes'

const FORMAT = 'infinity-nikki-album-manager/resonance'
export const RESONANCE_FILE_INVALID = 'Invalid resonance JSON file'
export const RESONANCE_FILE_EMPTY = 'No supported resonance records in file'

type DataMap = Record<string, unknown>
const object = (value: unknown): value is DataMap =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const entries = (value: unknown): DataMap => (object(value) ? value : {})
const localizedName = (value: unknown): boolean =>
  object(value) && typeof value.zh === 'string' && typeof value.en === 'string'
const validTuple = (value: unknown): value is [string, string] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'string' &&
  /^\d+$/.test(String(value[1]))

export function createResonanceExport(records: ResonanceRecord[]) {
  return { format: FORMAT, version: 1, records }
}

function validBackupRecord(value: unknown): value is ResonanceRecord {
  if (
    !object(value) ||
    typeof value.bannerId !== 'string' ||
    typeof value.outfitId !== 'string' ||
    value.id !== `${value.bannerId}:${value.outfitId}` ||
    !localizedName(value.bannerName) ||
    !localizedName(value.outfitName) ||
    (value.rarity !== 4 && value.rarity !== 5) ||
    typeof value.bannerStartAt !== 'string' ||
    typeof value.outfitImageUrl !== 'string' ||
    !Array.isArray(value.sets) ||
    value.sets.length !== 2
  )
    return false
  return value.sets.every(
    (set, index) =>
      object(set) &&
      set.setNumber === index + 1 &&
      typeof set.totalPulls === 'number' &&
      Number.isFinite(set.totalPulls) &&
      set.totalPulls >= 0 &&
      Array.isArray(set.parts) &&
      set.parts.every(
        (part: unknown) =>
          object(part) &&
          typeof part.id === 'string' &&
          localizedName(part.name) &&
          typeof part.imageUrl === 'string' &&
          typeof part.pullNumber === 'number' &&
          Number.isFinite(part.pullNumber) &&
          part.pullNumber >= 0 &&
          (part.manual === undefined || typeof part.manual === 'boolean') &&
          (part.gift === undefined ||
            (typeof part.gift === 'boolean' &&
              (!part.gift || (part.manual === true && part.pullNumber === 0)))) &&
          (part.acquisitionOrder === undefined ||
            (typeof part.acquisitionOrder === 'number' &&
              Number.isInteger(part.acquisitionOrder) &&
              part.acquisitionOrder > 0))
      )
  )
}

export interface ResonanceFileResult {
  records: ResonanceRecord[]
  skippedPools: number
}

/** 识别本项目备份、共鸣录旧版逐抽文件和新版多来源文件；坏卡池不阻断其余卡池。 */
export async function parseResonanceFile(
  value: unknown,
  allowEmptyBackup = false
): Promise<ResonanceFileResult> {
  if (!object(value)) throw new Error(RESONANCE_FILE_INVALID)
  if ('format' in value) {
    if (
      value.format !== FORMAT ||
      value.version !== 1 ||
      !Array.isArray(value.records) ||
      !value.records.every(validBackupRecord)
    )
      throw new Error(RESONANCE_FILE_INVALID)
    if (!value.records.length && !allowEmptyBackup) throw new Error(RESONANCE_FILE_EMPTY)
    return { records: value.records, skippedPools: 0 }
  }

  const structuredKeys = [
    'pulls',
    'edits',
    'evo',
    'pearpal',
    'wardrobe',
    'bannerWishlist',
    'profile'
  ]
  const structured = structuredKeys.some((key) => key in value)
  if (!structured && !Object.keys(value).every((key) => /^\d+$/.test(key)))
    throw new Error(RESONANCE_FILE_INVALID)
  const pullsByBanner = structured ? entries(value.pulls) : value
  const editsByBanner = structured ? entries(value.edits) : {}
  const pearpalByBanner = structured ? entries(value.pearpal) : {}
  if (
    structured &&
    (('pulls' in value && !object(value.pulls)) ||
      ('edits' in value && !object(value.edits)) ||
      ('pearpal' in value && !object(value.pearpal)))
  )
    throw new Error(RESONANCE_FILE_INVALID)

  const bannerIds = new Set([
    ...Object.keys(pullsByBanner),
    ...Object.keys(editsByBanner),
    ...Object.keys(pearpalByBanner)
  ])
  if (!bannerIds.size) throw new Error(RESONANCE_FILE_EMPTY)
  // 标准备份已经包含名称与部件，只有旧版逐抽数据需要下载目录重新组装。
  const { loadResonanceCatalog } = await import('./resonanceCatalog')
  const {
    buildResonanceRecords,
    getBannerMeta,
    normalizeBannerPulls,
    normalizePearpalPulls,
    resolveOutfit
  } = await loadResonanceCatalog()
  const records: ResonanceRecord[] = []
  let skippedPools = 0
  for (const bannerId of bannerIds) {
    const banner = getBannerMeta(bannerId)
    const gameRows = pullsByBanner[bannerId]
    const editRows = editsByBanner[bannerId]
    const pearpalRows = pearpalByBanner[bannerId]
    if (
      !banner ||
      (gameRows !== undefined && (!Array.isArray(gameRows) || !gameRows.every(validTuple))) ||
      (editRows !== undefined && (!Array.isArray(editRows) || !editRows.every(validTuple))) ||
      (pearpalRows !== undefined &&
        (!Array.isArray(pearpalRows) ||
          !pearpalRows.every(
            (row) =>
              object(row) &&
              /^\d+$/.test(String(row.result)) &&
              Number.isInteger(Number(row.pool_cnt)) &&
              Number(row.pool_cnt) >= 0
          )))
    ) {
      skippedPools++
      continue
    }
    try {
      const game = (gameRows ?? []) as [string, string][]
      const edits = (editRows ?? []) as [string, string][]
      const pearpal = (pearpalRows ?? []) as DataMap[]
      const pearpalTotal = pearpal.reduce((max, row) => Math.max(max, Number(row.pool_cnt) + 1), 0)
      // 共鸣录自动来源规则：每池选择实际抽数更多的来源，平局选游戏记录。
      const usePearpal = pearpalTotal > game.length
      let pulls: ResonancePull[]
      if (usePearpal) {
        pulls = normalizePearpalPulls(bannerId, pearpal, value.cloth_random_box_list)
      } else {
        const real = normalizeBannerPulls(bannerId, game)
        // 共鸣录把手动记录放在真实抽卡之前计数，抽数为 0，但仍占第一/第二套位置。
        const manual: ResonancePull[] = [...edits].reverse().flatMap(([obtainedAt, itemId]) => {
          const found = resolveOutfit(banner, itemId)
          return found
            ? [
                {
                  itemId,
                  outfitId: found.outfitId,
                  rarity: found.rarity,
                  setNumber: 1 as const,
                  pullNumber: 0,
                  pullsToObtain: 0,
                  obtainedAt,
                  manual: true
                }
              ]
            : []
        })
        const counts = new Map<string, number>()
        pulls = [...manual, ...real].flatMap((pull) => {
          const count = (counts.get(pull.itemId) ?? 0) + 1
          counts.set(pull.itemId, count)
          return count <= 2 ? [{ ...pull, setNumber: count as 1 | 2 }] : []
        })
      }
      const built = buildResonanceRecords(bannerId, pulls)
      if (!built.length) skippedPools++
      else records.push(...built)
    } catch {
      skippedPools++
    }
  }
  if (!records.length) throw new Error(RESONANCE_FILE_EMPTY)
  return { records, skippedPools }
}
