import { catalogResources, loadCatalogNames } from '../gongeo/catalogResources'
import { getCatalogImageSource } from '../gongeo/catalogImage'
import { getBannerMeta, loadResonanceBanners, localizedName } from './resonanceBanners'
import { getResonancePartIconUrl } from './resonanceView'
import type {
  ResonanceBanner,
  ResonanceLocalizedName,
  ResonancePull,
  ResonanceRecord,
  ResonanceRarity,
  ResonanceSet
} from './resonanceTypes'

async function loadResources() {
  const [outfitItems, outfits, zhItems, enItems, zhOutfits, enOutfits] = await Promise.all([
    catalogResources.outfitItems(),
    catalogResources.outfits(),
    loadCatalogNames('item', 'zh'),
    loadCatalogNames('item', 'en'),
    loadCatalogNames('outfit', 'zh'),
    loadCatalogNames('outfit', 'en')
  ])
  return {
    outfitItems,
    outfits,
    itemNames: { zh: zhItems, en: enItems },
    outfitNames: { zh: zhOutfits, en: enOutfits }
  }
}

function createCatalog({
  outfitItems,
  outfits,
  itemNames,
  outfitNames
}: Awaited<ReturnType<typeof loadResources>>) {
  /** 套装 ID -> 该套装的全部部件 ID */
  const outfitParts = new Map(
    (outfitItems as unknown as Array<[number, number[]]>).map(([id, items]) => [
      String(id),
      items.map(String)
    ])
  )
  /** 部件 ID -> 所属套装 ID（变体部件可能同时属于多个条目） */
  const itemOutfits = new Map<string, string[]>()
  for (const [outfitId, itemIds] of outfitParts) {
    for (const itemId of itemIds) {
      const related = itemOutfits.get(itemId) ?? []
      related.push(outfitId)
      itemOutfits.set(itemId, related)
    }
  }

  function getOutfitDisplayId(outfitId: string): string {
    const outfit = (outfits as unknown as Array<unknown[]>).find((entry) => {
      const variants = Array.isArray(entry[0]) ? entry[0] : [entry[0]]
      return variants.map(String).includes(outfitId)
    })
    return outfit && Array.isArray(outfit[0]) ? String(outfit[0][0]) : outfitId
  }

  function getOutfitName(outfitId: string): ResonanceLocalizedName {
    const displayId = getOutfitDisplayId(outfitId)
    return localizedName(
      outfitNames.zh[`outfit.${displayId}.name`],
      outfitNames.en[`outfit.${displayId}.name`],
      outfitId
    )
  }

  function getItemName(itemId: string): ResonanceLocalizedName {
    return localizedName(
      itemNames.zh[`item.${itemId}.name`],
      itemNames.en[`item.${itemId}.name`],
      itemId
    )
  }

  function rarityForOutfit(banner: ResonanceBanner, outfitId: string): ResonanceRarity | null {
    if (banner.outfit5StarIds.includes(outfitId)) return 5
    if (banner.outfit4StarIds.includes(outfitId)) return 4
    return null
  }

  /** 部件在当前卡池内归属的套装与稀有度。 */
  function resolveOutfit(
    banner: ResonanceBanner,
    itemId: string
  ): { outfitId: string; rarity: ResonanceRarity } | null {
    for (const outfitId of itemOutfits.get(itemId) ?? []) {
      const rarity = rarityForOutfit(banner, outfitId)
      if (rarity) return { outfitId, rarity }
    }
    return null
  }

  /**
   * 归一化单个卡池的抽卡历史。
   * 上游按最新记录优先返回；同一部件按 pool_cnt 顺序取前两次，分别计入第一、第二套。
   */
  function normalizeBannerPulls(bannerId: string, rawPulls: unknown[]): ResonancePull[] {
    const banner = getBannerMeta(bannerId)
    if (!banner) throw new Error(`Unknown banner: ${bannerId}`)
    const tuples = rawPulls
      .map((row) => {
        if (Array.isArray(row))
          return {
            itemId: String(row[1] ?? ''),
            obtainedAt: String(row[0] ?? ''),
            pity: null as number | null,
            poolCount: null as number | null
          }
        const item = row as Record<string, unknown>
        return {
          itemId: String(item.itemId ?? item.item_id ?? item.result ?? ''),
          obtainedAt: String(item.obtainedAt ?? item.time ?? item.timestamp ?? ''),
          pity: Number.isFinite(Number(item.pullsToObtain)) ? Number(item.pullsToObtain) : null,
          poolCount: Number.isInteger(Number(item.poolCount)) ? Number(item.poolCount) : null
        }
      })
      .filter((row) => /^\d+$/.test(row.itemId))

    const chronological = tuples.reverse()
    const pity = { 4: 0, 5: 0 }
    const occurrences = new Map<string, number>()
    const result: ResonancePull[] = []
    chronological.forEach((row, index) => {
      pity[4] += 1
      pity[5] += 1
      const resolved = resolveOutfit(banner, row.itemId)
      if (!resolved) return

      const pullsToObtain = row.pity ?? pity[resolved.rarity]
      pity[resolved.rarity] = 0
      const itemIds = outfitParts.get(resolved.outfitId) ?? []
      if (!itemIds.length) return
      const occurrence = (occurrences.get(row.itemId) ?? 0) + 1
      occurrences.set(row.itemId, occurrence)
      if (occurrence > 2) return
      const setNumber = occurrence as 1 | 2

      result.push({
        itemId: row.itemId,
        outfitId: resolved.outfitId,
        rarity: resolved.rarity,
        setNumber,
        // 手账的 pool_cnt 从 0 开始，不能用数组下标代替累计抽数（源数据可能缺行）。
        pullNumber: row.poolCount === null ? index + 1 : row.poolCount + 1,
        pullsToObtain,
        obtainedAt: row.obtainedAt
      })
    })
    return result
  }

  /** 把归一化后的抽卡记录组装成两套装箱的成品记录。 */
  function buildResonanceRecords(bannerId: string, pulls: ResonancePull[]): ResonanceRecord[] {
    const banner = getBannerMeta(bannerId)
    if (!banner) throw new Error(`Unknown banner: ${bannerId}`)
    const ids = [
      ...banner.outfit5StarIds.map((id) => ({ id, rarity: 5 as const })),
      ...banner.outfit4StarIds.map((id) => ({ id, rarity: 4 as const }))
    ]
    return ids
      .filter(({ id }) => pulls.some((pull) => pull.outfitId === id))
      .map(({ id, rarity }) => {
        const itemIds = outfitParts.get(id) ?? []
        const makeSet = (setNumber: 1 | 2): ResonanceSet => {
          const parts: ResonanceSet['parts'] = itemIds.map((itemId) => ({
            id: itemId,
            name: getItemName(itemId),
            imageUrl: getResonancePartIconUrl(itemId),
            pullNumber: 0
          }))
          let totalPulls = 0
          for (const [order, pull] of pulls.entries()) {
            if (pull.outfitId !== id || pull.setNumber !== setNumber) continue
            const index = parts.findIndex((part) => part.id === pull.itemId)
            if (index < 0 || parts[index]!.pullNumber > 0 || parts[index]!.manual) continue
            parts[index] = {
              ...parts[index]!,
              pullNumber: pull.pullsToObtain,
              acquisitionOrder: order + 1,
              ...(pull.manual ? { manual: true } : {})
            }
            totalPulls += pull.pullsToObtain
          }
          return { setNumber, parts, totalPulls }
        }
        const displayId = getOutfitDisplayId(id)
        return {
          id: `${bannerId}:${id}`,
          bannerId,
          bannerName: banner.name,
          bannerStartAt: banner.startAt,
          outfitId: id,
          outfitName: getOutfitName(id),
          rarity,
          outfitImageUrl: getCatalogImageSource('outfit', displayId),
          sets: [makeSet(1), makeSet(2)]
        }
      })
  }

  return {
    loadResonanceBanners,
    getBannerMeta,
    resolveOutfit,
    normalizeBannerPulls,
    buildResonanceRecords
  }
}

export type ResonanceCatalog = ReturnType<typeof createCatalog>
let pending: Promise<ResonanceCatalog> | undefined
/** 仅在导入需要部件关系和双语名称时构建目录；记录展示和备份不触发它。 */
export function loadResonanceCatalog(): Promise<ResonanceCatalog> {
  pending ??= loadResources()
    .then(createCatalog)
    .catch((error) => {
      pending = undefined
      throw error
    })
  return pending
}
