import { catalogResources, loadCatalogNames } from './gongeo/catalogResources'
import { getCatalogImageSource } from './gongeo/catalogImage'
import { wardrobeVariantLabels } from './wardrobe/wardrobePresentation'
import { itemVariant } from './wardrobe/wardrobeCatalog'
import { wardrobeGameVersionFromSource } from './wardrobe/wardrobeFilters'
import type { MakeupEntry, MakeupRelations, MakeupRelatedOutfit } from './makeupCatalog'

export interface MakeupCatalogData {
  entries: MakeupEntry[]
  parts: MakeupEntry[]
  relations: Map<string, MakeupRelations>
  relatedOutfits: MakeupRelatedOutfit[]
}
export async function loadMakeupCatalog(): Promise<MakeupCatalogData> {
  const [rows, makeups, outfits, makeupOutfits, zh, en, zhItems, enItems, zhOutfits, enOutfits] =
    await Promise.all([
      catalogResources.makeupItems(),
      catalogResources.makeups(),
      catalogResources.outfits(),
      catalogResources.makeupOutfits(),
      loadCatalogNames('makeup', 'zh'),
      loadCatalogNames('makeup', 'en'),
      loadCatalogNames('item', 'zh'),
      loadCatalogNames('item', 'en'),
      loadCatalogNames('outfit', 'zh'),
      loadCatalogNames('outfit', 'en')
    ])
  // 同一全妆可被多种套装形态复用，取首次出现的形态，优先保留原套。
  const outfitIds = new Set(outfits.flatMap((row) => row[0]).map(String))
  const variants = new Map<string, number>()
  const linkedOutfits = new Map<string, string[]>()
  const relatedOutfits = [...outfitIds].map((id) => ({
    id,
    name: {
      zh: zhOutfits['outfit.' + id + '.name'] || id,
      en: enOutfits['outfit.' + id + '.name'] || id
    },
    image: getCatalogImageSource('outfit', id),
    variant: id.length === 7 ? Number(id.slice(-2)) : 0
  }))
  for (const [outfitId, makeupIds] of makeupOutfits) {
    const key = String(outfitId)
    if (!outfitIds.has(key) || !Array.isArray(makeupIds)) continue
    const variant = key.length === 7 ? Number(key.slice(-2)) : 0
    if (!wardrobeVariantLabels.zh[variant]) continue
    for (const makeupId of makeupIds) {
      const id = String(makeupId)
      linkedOutfits.set(id, [...(linkedOutfits.get(id) ?? []), key])
      variants.set(id, Math.min(variants.get(id) ?? variant, variant))
    }
  }
  const familyGroups = new Map<string, string[]>()
  for (const row of makeups) {
    const ids = (Array.isArray(row[0]) ? row[0] : [row[0]]).map(String)
    const root = `${row[2]}:${typeof row[5] === 'number' ? row[5] : ids[0]}`
    familyGroups.set(root, [...(familyGroups.get(root) ?? []), ...ids])
  }
  const families = new Map<string, string[]>()
  for (const ids of familyGroups.values()) for (const id of ids) families.set(id, ids)
  const relations = new Map(
    rows.map(([rawId, rawParts]) => {
      const id = String(rawId)
      return [
        id,
        {
          partIds: Array.isArray(rawParts) ? [...new Set(rawParts.map(String))] : [],
          formIds: families.get(id) ?? [id],
          outfitIds: [...new Set(linkedOutfits.get(id) ?? [])]
        }
      ]
    })
  )
  const qualities = new Map<string, number>()
  const sources = new Map<string, number>()
  for (const row of makeups) {
    const ids = Array.isArray(row[0]) ? row[0] : [row[0]]
    const obtainType = row[4]
    if (typeof obtainType === 'number' && Number.isSafeInteger(obtainType) && obtainType > 0) {
      for (const id of ids) sources.set(String(id), obtainType)
    }
    const quality = row[1]
    if (typeof quality === 'number') {
      for (const id of ids) qualities.set(String(id), quality)
    }
  }
  // 全妆 ID 为唯一条目；不按服装套装关系展开，避免重复及遗漏独立妆容。
  const entries = [...new Set(rows.map((row) => String(row[0])))].map((id) => ({
    id,
    category: 0,
    name: { zh: zh[`makeup.${id}.name`] || id, en: en[`makeup.${id}.name`] || id },
    quality: qualities.get(id),
    variant: variants.get(id) ?? null,
    obtainType: sources.get(id) ?? null,
    version: wardrobeGameVersionFromSource(sources.get(id) ?? null),
    sourceDetails: [],
    image: getCatalogImageSource('makeup', id)
  }))
  // 部件以妆容目录为准，包含独立售卖部件；同一部件只显示一次。
  const partMap = new Map<string, MakeupEntry>()
  for (const row of makeups) {
    const category = row[2]
    if (typeof category !== 'number' || category < 1 || category > 5) continue
    const ids = Array.isArray(row[0]) ? row[0] : [row[0]]
    for (const rawId of ids) {
      const id = String(rawId)
      partMap.set(id, {
        id,
        category,
        name: {
          zh: zhItems['item.' + id + '.name'] || id,
          en: enItems['item.' + id + '.name'] || id
        },
        quality: qualities.get(id),
        variant: itemVariant(id, typeof row[5] === 'number' ? String(row[5]) : undefined),
        obtainType: sources.get(id) ?? null,
        version: wardrobeGameVersionFromSource(sources.get(id) ?? null),
        sourceDetails: [],
        image: getCatalogImageSource('item', id)
      })
    }
  }
  const parts = [...partMap.values()]
  for (const part of parts) {
    relations.set(part.id, {
      partIds: [],
      formIds: families.get(part.id) ?? [part.id],
      outfitIds: []
    })
  }
  return { entries, parts, relations, relatedOutfits }
}
