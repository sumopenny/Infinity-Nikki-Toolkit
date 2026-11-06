import type { ResonanceRecord } from './resonanceTypes'

export const MAX_CLOUD_BYTES = 8 * 1024 * 1024
export const MAX_CLOUD_RECORDS = 2000
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length <= max
const name = (v: unknown) => object(v) && text(v.zh) && text(v.en)
const number = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const url = (v: unknown) => text(v, 2048) && (v === '' || /^https?:\/\//i.test(v))

/** 前后端共用备份边界校验，不加载资源目录；拒绝重复主键及超大单条记录。 */
export function validateCloudRecords(value: unknown): asserts value is ResonanceRecord[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_CLOUD_RECORDS)
    throw new Error('INVALID_DATA')
  const ids = new Set<string>()
  for (const r of value) {
    if (
      !object(r) ||
      !text(r.bannerId, 100) ||
      !r.bannerId ||
      !text(r.outfitId, 100) ||
      !r.outfitId ||
      r.id !== `${r.bannerId}:${r.outfitId}` ||
      ids.has(r.id as string) ||
      !name(r.bannerName) ||
      !name(r.outfitName) ||
      !text(r.bannerStartAt, 100) ||
      !url(r.outfitImageUrl) ||
      ![4, 5].includes(r.rarity as number) ||
      !Array.isArray(r.sets) ||
      r.sets.length !== 2
    )
      throw new Error('INVALID_DATA')
    for (const [index, set] of r.sets.entries()) {
      if (
        !object(set) ||
        set.setNumber !== index + 1 ||
        !number(set.totalPulls) ||
        !Array.isArray(set.parts) ||
        set.parts.length > 100
      )
        throw new Error('INVALID_DATA')
      const parts = new Set<string>()
      for (const p of set.parts) {
        if (
          !object(p) ||
          !text(p.id, 100) ||
          !p.id ||
          parts.has(p.id) ||
          !name(p.name) ||
          !url(p.imageUrl) ||
          !number(p.pullNumber) ||
          (p.manual !== undefined && typeof p.manual !== 'boolean') ||
          (p.acquisitionOrder !== undefined &&
            (!number(p.acquisitionOrder) || p.acquisitionOrder === 0))
        )
          throw new Error('INVALID_DATA')
        parts.add(p.id)
      }
    }
    if (new TextEncoder().encode(JSON.stringify(r)).length > 64 * 1024) throw new Error('TOO_LARGE')
    ids.add(r.id as string)
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_CLOUD_BYTES)
    throw new Error('TOO_LARGE')
}
