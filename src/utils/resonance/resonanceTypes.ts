export type ResonanceRarity = 4 | 5

export interface ResonanceLocalizedName {
  zh: string
  en: string
}

export interface ResonancePart {
  id: string
  name: ResonanceLocalizedName
  imageUrl: string
  pullNumber: number
  /** 部件在导入记录中的获得先后；旧记录可能没有此字段。 */
  acquisitionOrder?: number
  /** 手动补录的部件没有真实抽数，与未获得的 0 区分。 */
  manual?: boolean
}

export interface ResonanceSet {
  setNumber: 1 | 2
  parts: ResonancePart[]
  totalPulls: number
}

export interface ResonanceRecord {
  id: string
  bannerId: string
  bannerName: ResonanceLocalizedName
  bannerStartAt: string
  outfitId: string
  outfitName: ResonanceLocalizedName
  rarity: ResonanceRarity
  outfitImageUrl: string
  sets: [ResonanceSet, ResonanceSet]
}

/** 共鸣记录是可导出为 JSON 的数据；旧浏览器也需要在异步写入前固定快照。 */
export function cloneResonanceRecords(records: ResonanceRecord[]): ResonanceRecord[] {
  return typeof structuredClone === 'function'
    ? structuredClone(records)
    : JSON.parse(JSON.stringify(records))
}

export interface ResonanceBanner {
  bannerId: string
  bannerType: number
  name: ResonanceLocalizedName
  startAt: string
  endAt: string
  outfit5StarIds: string[]
  outfit4StarIds: string[]
  version: string
}

/** 单次抽卡结果：部件 ID、所属套装、第几次获得、累计抽数与 pity 抽数。 */
export interface ResonancePull {
  itemId: string
  outfitId: string
  rarity: ResonanceRarity
  /** 同一部件的第几次获得：1 = 第一套，2 = 第二套 */
  setNumber: 1 | 2
  /** 抽到该部件时的累计抽数（从 1 开始） */
  pullNumber: number
  /** 距离上一次同 rarity 的抽数 */
  pullsToObtain: number
  obtainedAt: string
  manual?: boolean
}
