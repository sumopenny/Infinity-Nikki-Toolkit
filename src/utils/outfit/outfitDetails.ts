import { catalogResources, loadCatalogNames } from '../gongeo/catalogResources'
import { registerCacheReset } from '../cacheLifecycle'
import type { Language } from '../../i18n'

import { outfitMessages } from '../../i18n/messages/outfit'
import type { LookbookDyeSwatch } from './outfitCodeParser'

import { getCatalogImageSource } from '../gongeo/catalogImage'
const getItemDisplayImageUrl = (itemId: number): string => getCatalogImageSource('item', itemId)

const isMakeupClothType = (clothType: number | null): boolean =>
  clothType !== null && clothType >= 80 && clothType <= 85

const PALETTE_NAMES: Record<number, [string, string]> = {
  1: ['围兜暖毛球', 'Bibcoon Furball Hug'],
  2: ['星夜时光树', 'Starlit Chronos Tree'],
  3: ['星光果之梦', 'Stellar Fruit Dream'],
  4: ['眼影鱼碎闪', 'Palettetail Shimmer'],
  5: ['春日满满星', 'Spring Starlit Breath'],
  6: ['飞球果飘飘', 'Flight Fruit Flutter'],
  7: ['崖上的壁灯', 'Lantern by the Cliff'],
  8: ['风铃子腹语', "Chimecada's Murmur"],
  9: ['风絮草飘飞时', 'Windbloom Whirl'],
  10: ['雨夜路灯花', 'Lampbloom Mist'],
  11: ['耳坠萤未眠', 'Sleepless Glimmerdrop'],
  12: ['碧波裙摆湖', 'Silken Lake Emerald'],
  13: ['星荧草来信', "Glimmergrass's Letter"],
  14: ['丝巾蛾魅影', "Scarfmoth's Phantom"],
  15: ['花伞藤萝之雨', 'Wisteriasol Rain'],
  16: ['兔耳草嫩蕊', 'Budding Hare Ears'],
  17: ['裙撑萤之歌', "Bustlefly's Song"],
  18: ['名流鸦盛宴', "Celebcrow's Feast"],
  19: ['绒绒衬衫毛团', 'Puffy Shirtcat Fluff']
}

const EVOLUTION_LABELS: Record<Language, string[]> = {
  zh: ['原套', '焕新', '1进', '2进', '满进'],
  en: ['Original', 'Glow-Up', 'Evo. 1', 'Evo. 2', 'Evo. 3']
}

const DYE_UNLOCK_LABELS: Record<Language, string[]> = {
  // 与暖暖相册 DyeCondition 保持同一顺序：directly、complete、growUp、evolution1、evolution2、evolution3。
  zh: ['直接可染', '集齐整套可染', '焕新可染', '一进可染', '二进可染', '满进可染'],
  en: ['Direct dyeable', 'Complete Set', 'Grow Up', 'Evolution 1', 'Evolution 2', 'Full Evolution']
}

export interface OutfitDyeDetail {
  area: string
  paletteId: number
  paletteName: string
  slot: number | null
  color: string
}

export interface OutfitDetail {
  itemId: number
  outfitId: number | null
  itemName: string
  outfitName: string
  detailImageUrl: string | null
  quality: number | null
  outfitItemIds: number[]
  outfitImageUrl: string | null
  evolution: string
  dyeCondition: string
  dyes: OutfitDyeDetail[]
  loadError: boolean
}

type CompactRow = unknown[]
type DyeAreaInfo = { primaryCount: number; customOrder: number[] }
type CatalogSnapshot = {
  items: CompactRow[]
  outfits: CompactRow[]
  outfitItems: CompactRow[]
  makeupItems: CompactRow[]
  makeupOutfits: CompactRow[]
  dyeCatalog: { raw: CompactRow[]; areas: CompactRow[] }
  outfitNames: Record<string, string>
}

const detailCache = new Map<string, Promise<OutfitDetail>>()
let catalogSnapshotPromise: Promise<Omit<CatalogSnapshot, 'outfitNames'>> | null = null

const loadCatalogSnapshot = async (language: Language): Promise<CatalogSnapshot> => {
  catalogSnapshotPromise ??= Promise.all([
    catalogResources.items(),
    catalogResources.outfits(),
    catalogResources.outfitItems(),
    catalogResources.makeupItems(),
    catalogResources.makeupOutfits(),
    catalogResources.palettes()
  ])
    .then(([items, outfits, outfitItems, makeupItems, makeupOutfits, dyeCatalog]) => ({
      items: items as CompactRow[],
      outfits: outfits as CompactRow[],
      outfitItems: outfitItems as CompactRow[],
      makeupItems: makeupItems as CompactRow[],
      makeupOutfits: makeupOutfits as CompactRow[],
      dyeCatalog: dyeCatalog as CatalogSnapshot['dyeCatalog']
    }))
    .catch((error) => {
      catalogSnapshotPromise = null
      throw error
    })
  const [snapshot, names] = await Promise.all([
    catalogSnapshotPromise,
    loadCatalogNames('outfit', language)
  ])
  return { ...snapshot, outfitNames: names as Record<string, string> }
}

const asId = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

const idsIn = (value: unknown): number[] =>
  (Array.isArray(value) ? value : [value]).map(asId).filter((id): id is number => id !== null)

const compactIds = (row: CompactRow | undefined): number[] => idsIn(row?.[0])

const findItemRow = (catalog: CatalogSnapshot, itemId: number) =>
  catalog.items.find((row) => compactIds(row).includes(itemId))

const getItemFamilyIds = (catalog: CatalogSnapshot, itemId: number): number[] => {
  const familyIds = compactIds(findItemRow(catalog, itemId))
  return familyIds.length ? familyIds : [itemId]
}

const findOutfitRow = (catalog: CatalogSnapshot, outfitId: number) =>
  catalog.outfits.find((row) => compactIds(row).includes(outfitId))

const findDyeRow = (catalog: CatalogSnapshot, itemId: number) =>
  catalog.dyeCatalog.raw.find((row) => compactIds(row).includes(itemId))

const findDyeArea = (catalog: CatalogSnapshot, itemId: number): DyeAreaInfo | null => {
  const row = catalog.dyeCatalog.areas.find((entry) => compactIds(entry).includes(itemId))
  if (!row || typeof row[1] !== 'number' || !Array.isArray(row[2])) return null
  return {
    primaryCount: row[1],
    customOrder: row[2].filter((area): area is number => typeof area === 'number')
  }
}

// 共鸣录按“当前部件 -> 部件家族根 ID”选择染色目录，不能从整个家族随意取第一条。
const getDyeCatalogItemId = (catalog: CatalogSnapshot, itemId: number): number => {
  if (findDyeRow(catalog, itemId)) return itemId
  const rootId = asId(findItemRow(catalog, itemId)?.[6])
  return rootId && findDyeRow(catalog, rootId) ? rootId : itemId
}

const getVariantIndex = (itemId: number): number => {
  const prefix = String(itemId).slice(0, 4)
  if (['1021', '1020', '1029'].includes(prefix)) return 0
  if (['1022', '1026', '1027', '1028'].includes(prefix)) return 1
  if (prefix === '1023') return 2
  if (prefix === '1024') return 3
  if (prefix === '1025') return 4
  return 0
}

/** 将原套/变体套装 ID 对齐到当前部件的变体。共鸣录的套装行按该顺序存储变体。 */
const resolveOutfitVariantId = (
  catalog: CatalogSnapshot,
  outfitId: number,
  itemId: number
): number => {
  const variants = compactIds(findOutfitRow(catalog, outfitId))
  return variants[getVariantIndex(itemId)] ?? outfitId
}

const getLocalizedName = (outfitId: number, catalog: CatalogSnapshot) => {
  const names = catalog.outfitNames
  const variantName = names[`outfit.${outfitId}.name`]
  if (typeof variantName === 'string' && variantName.trim()) return variantName
  const row = findOutfitRow(catalog, outfitId)
  const baseId = asId(row?.[5]) ?? compactIds(row)[0]
  const baseName = baseId ? names[`outfit.${baseId}.name`] : null
  return typeof baseName === 'string' && baseName.trim() ? baseName : ''
}

const findRelatedOutfitId = (
  catalog: CatalogSnapshot,
  itemId: number,
  itemIds: number[]
): number | null => {
  // 先用当前变体部件精确匹配，避免家族展开后被原套关系行抢先命中。
  for (const row of catalog.outfitItems) {
    const outfitId = asId(row[0])
    const outfitItems = idsIn(row[1])
    if (outfitId && outfitItems.includes(itemId) && findOutfitRow(catalog, outfitId))
      return outfitId
  }
  for (const row of catalog.outfitItems) {
    const outfitId = asId(row[0])
    const outfitItems = idsIn(row[1])
    if (
      outfitId &&
      itemIds.some((itemId) => outfitItems.includes(itemId)) &&
      findOutfitRow(catalog, outfitId)
    ) {
      return outfitId
    }
  }
  return null
}

// 妆容部件通过“完整妆容 -> 妆容套装”两级目录关联套装，不能直接套用服装关系表。
const findRelatedMakeupOutfitId = (catalog: CatalogSnapshot, itemIds: number[]): number | null => {
  const fullMakeupIds = new Set<number>()
  for (const [fullMakeupId, componentIds] of catalog.makeupItems) {
    const fullId = asId(fullMakeupId)
    if (
      fullId &&
      (itemIds.includes(fullId) || idsIn(componentIds).some((id) => itemIds.includes(id)))
    ) {
      fullMakeupIds.add(fullId)
    }
  }
  for (const [outfitId, makeupIds] of catalog.makeupOutfits) {
    const id = asId(outfitId)
    if (
      id &&
      idsIn(makeupIds).some((makeupId) => fullMakeupIds.has(makeupId)) &&
      findOutfitRow(catalog, id)
    ) {
      return id
    }
  }
  return null
}

const isMakeupCatalogItem = (catalog: CatalogSnapshot, itemId: number): boolean =>
  catalog.makeupItems.some(
    ([makeupId, componentIds]) => asId(makeupId) === itemId || idsIn(componentIds).includes(itemId)
  )

const isOutfitRelatedToItem = (catalog: CatalogSnapshot, outfitId: number, itemIds: number[]) => {
  const outfitVariants = compactIds(findOutfitRow(catalog, outfitId))
  const outfitBaseId = outfitVariants[0]
  return catalog.outfitItems.some((row) => {
    const relationOutfitId = Number(row[0])
    const relatedIds = idsIn(row[1])
    return (
      (relationOutfitId === outfitId || relationOutfitId === outfitBaseId) &&
      itemIds.some((itemId) => relatedIds.includes(itemId))
    )
  })
}

// 共鸣录以 featureTag 区分主/次区域，次区域需从主区域数量之后顺延。
const getDyeAreaNumber = (
  dye: LookbookDyeSwatch,
  areaInfo: DyeAreaInfo | null,
  fallbackPrimaryCount: number
) => {
  // Only feature tags 1 and 3 are the outfit's primary/secondary dye areas.
  // Other tags use their target group directly, as in the upstream lookbook.
  if (dye.featureTag !== 1 && dye.featureTag !== 3) return dye.targetGroupId
  let area =
    dye.featureTag === 3
      ? (areaInfo?.primaryCount ?? fallbackPrimaryCount) + dye.targetGroupId
      : dye.targetGroupId
  if (areaInfo) {
    const customIndex = areaInfo.customOrder.indexOf(area)
    if (customIndex >= 0) return customIndex + 1
    area += areaInfo.customOrder.filter((value) => value > area).length
  }
  return area
}

const getPaletteSerial = (dyeGroups: unknown[], paletteId: number): number | null => {
  let position = 0
  for (const group of dyeGroups) {
    if (!Array.isArray(group)) continue
    for (const value of group) {
      position += 1
      if (Number(value) === paletteId) return position
    }
  }
  return null
}

const getPaletteName = (paletteId: number, language: Language): string => {
  if (paletteId < 0) return language === 'en' ? 'Slider' : '拉条'
  const names = PALETTE_NAMES[paletteId]
  return names
    ? names[language === 'en' ? 1 : 0]
    : language === 'en'
      ? `Palette ${paletteId}`
      : `染色盘 ${paletteId}`
}

const getDyeCondition = (
  dyes: LookbookDyeSwatch[],
  dyeGroups: unknown[],
  language: Language,
  hasSpecialEffect = false
): string => {
  if (hasSpecialEffect) return DYE_UNLOCK_LABELS[language][5]
  if (!dyes.length) return DYE_UNLOCK_LABELS[language][0]
  const conditions = new Set<number>()
  for (const dye of dyes) {
    if (dye.paletteId < 0) {
      conditions.add(5)
      continue
    }
    const condition = dyeGroups.findIndex(
      (group) => Array.isArray(group) && group.some((palette) => Number(palette) === dye.paletteId)
    )
    if (condition >= 0) conditions.add(condition)
  }
  const highestCondition = Math.max(...conditions, -1)
  return DYE_UNLOCK_LABELS[language][highestCondition] || (language === 'en' ? 'Unknown' : '未知')
}

const createDetail = async (
  itemId: number,
  outfitId: number | null,
  language: Language,
  fallbackItemName: string,
  dyes: LookbookDyeSwatch[],
  clothType: number | null,
  hasSpecialEffect: boolean
): Promise<OutfitDetail> => {
  const catalog = await loadCatalogSnapshot(language)
  const isMakeup = isMakeupClothType(clothType) || isMakeupCatalogItem(catalog, itemId)
  // 搭配码的 outfit 字段不一定是图鉴套装 ID；无效时按部件家族回查套装关系。
  const familyIds = getItemFamilyIds(catalog, itemId)
  const catalogOutfitId =
    outfitId &&
    findOutfitRow(catalog, outfitId) &&
    isOutfitRelatedToItem(catalog, outfitId, familyIds)
      ? outfitId
      : isMakeup
        ? findRelatedMakeupOutfitId(catalog, [itemId, ...familyIds])
        : findRelatedOutfitId(catalog, itemId, familyIds)
  const resolvedCatalogOutfitId = catalogOutfitId
    ? resolveOutfitVariantId(catalog, catalogOutfitId, itemId)
    : null
  const outfitRow = resolvedCatalogOutfitId
    ? findOutfitRow(catalog, resolvedCatalogOutfitId)
    : undefined
  const relation = resolvedCatalogOutfitId
    ? catalog.outfitItems.find((row) => Number(row[0]) === resolvedCatalogOutfitId)
    : undefined
  const dyeCatalogItemId = getDyeCatalogItemId(catalog, itemId)
  const dyeRow = findDyeRow(catalog, dyeCatalogItemId)
  const dyeGroups = dyeRow?.slice(1) ?? []
  // 上游区域目录先查当前部件，再回退到部件根 ID；它与 raw 染色盘目录不是同一套索引。
  const rootItemId = asId(findItemRow(catalog, itemId)?.[6])
  const areaInfo =
    findDyeArea(catalog, itemId) ?? (rootItemId ? findDyeArea(catalog, rootItemId) : null)
  const fallbackPrimaryCount = Math.max(
    0,
    ...dyes.filter((dye) => dye.featureTag === 1).map((dye) => dye.targetGroupId)
  )
  const paletteRows: OutfitDyeDetail[] = []

  for (const dye of dyes) {
    const areaNumber = getDyeAreaNumber(dye, areaInfo, fallbackPrimaryCount)
    const paletteSerial = getPaletteSerial(dyeGroups, dye.paletteId)
    const detail = {
      area: `${outfitMessages[language].detailArea} ${String(areaNumber).padStart(2, '0')}`,
      paletteId: paletteSerial ?? dye.paletteId,
      paletteName: getPaletteName(dye.paletteId, language),
      slot: dye.slot,
      color: dye.color
    }
    paletteRows.push(detail)
  }

  const resolvedOutfitId = resolvedCatalogOutfitId
  const outfitName = resolvedOutfitId ? getLocalizedName(resolvedOutfitId, catalog) : ''

  return {
    itemId,
    outfitId: resolvedOutfitId,
    itemName: fallbackItemName,
    outfitName,
    detailImageUrl: getItemDisplayImageUrl(itemId),
    quality: outfitRow && Number.isSafeInteger(Number(outfitRow[1])) ? Number(outfitRow[1]) : null,
    outfitItemIds: idsIn(relation?.[1]),
    outfitImageUrl: resolvedOutfitId ? getCatalogImageSource('outfit', resolvedOutfitId) : null,
    evolution: EVOLUTION_LABELS[language][getVariantIndex(itemId)],
    dyeCondition: isMakeup
      ? language === 'en'
        ? 'None'
        : '无'
      : getDyeCondition(dyes, dyeGroups, language, hasSpecialEffect),
    dyes: paletteRows.sort((left, right) => {
      const areaOrder = Number(left.area.replace(/\D/g, '')) - Number(right.area.replace(/\D/g, ''))
      return areaOrder
    }),
    loadError: false
  }
}

/** 仅使用本地快照生成详情，不请求第三方接口。 */
export function loadLocalOutfitDetail(
  itemId: number,
  outfitId: number | null,
  language: Language,
  fallbackItemName: string,
  dyes: LookbookDyeSwatch[],
  clothType: number | null = null,
  hasSpecialEffect = false
): Promise<OutfitDetail> {
  return createDetail(
    itemId,
    outfitId,
    language,
    fallbackItemName,
    dyes,
    clothType,
    hasSpecialEffect
  )
}

/** 弹窗打开时立即可用的预览；尚未读取的图鉴字段明确显示为加载中。 */
export function createOutfitDetailPreview(
  itemId: number,
  language: Language,
  name: string
): OutfitDetail {
  const pending = outfitMessages[language].detailPending
  return {
    itemId,
    itemName: name,
    detailImageUrl: getItemDisplayImageUrl(itemId),
    outfitId: null,
    outfitName: pending,
    quality: null,
    outfitItemIds: [],
    outfitImageUrl: null,
    evolution: EVOLUTION_LABELS[language][getVariantIndex(itemId)],
    dyeCondition: pending,
    dyes: [],
    loadError: false
  }
}

export function loadOutfitDetail(
  itemId: number,
  outfitId: number | null,
  language: Language,
  fallbackItemName: string,
  dyes: LookbookDyeSwatch[],
  clothType: number | null = null,
  hasSpecialEffect = false
): Promise<OutfitDetail> {
  const key = `${itemId}:${outfitId ?? 'none'}:${clothType ?? 'none'}:${hasSpecialEffect ? 'effect' : 'plain'}:${language}:${dyes.map((dye) => `${dye.targetGroupId}:${dye.featureTag}:${dye.paletteId}:${dye.slot}:${dye.color}`).join(',')}`
  const cached = detailCache.get(key)
  if (cached) return cached
  const promise = createDetail(
    itemId,
    outfitId,
    language,
    fallbackItemName,
    dyes,
    clothType,
    hasSpecialEffect
  ).catch(() => ({
    itemId,
    outfitId: null,
    itemName: fallbackItemName,
    outfitName: '',
    detailImageUrl: getItemDisplayImageUrl(itemId),
    quality: null,
    outfitItemIds: [],
    outfitImageUrl: null,
    evolution: EVOLUTION_LABELS[language][getVariantIndex(itemId)],
    dyeCondition: isMakeupClothType(clothType)
      ? language === 'en'
        ? 'None'
        : '无'
      : language === 'en'
        ? 'Catalog details unavailable'
        : '图鉴详情加载失败',
    dyes: [],
    loadError: true
  }))
  void promise.then((detail) => {
    if (detail.loadError && detailCache.get(key) === promise) detailCache.delete(key)
  })
  detailCache.set(key, promise)
  return promise
}

export function clearOutfitDetailCache(): void {
  detailCache.clear()
  catalogSnapshotPromise = null
}
registerCacheReset('outfit-details', clearOutfitDetailCache)
