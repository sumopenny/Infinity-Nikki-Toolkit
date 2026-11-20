import { normalizeLookbookCode, type LookbookDecodeResult } from './outfitCodeParser'
import type { OutfitRecord } from './outfitTypes'

export type OutfitSummaryPeriod = { start: number; end: number; count: number }

export function indexOutfitSummary(outfits: readonly Pick<OutfitRecord, 'code' | 'tags'>[]) {
  const tags = new Map<string, number>()
  const codes = new Map<string, number>()
  let missing = 0
  let invalid = 0
  for (const outfit of outfits) {
    const tag = outfit.tags[0] ?? ''
    tags.set(tag, (tags.get(tag) ?? 0) + 1)
    const code = normalizeLookbookCode(outfit.code)
    if (code) codes.set(code, (codes.get(code) ?? 0) + 1)
    else if (outfit.code.trim()) invalid++
    else missing++
  }
  return { tags, codes, missing, invalid }
}

export function summarizeOutfitResults(
  codes: ReadonlyMap<string, number>,
  results: ReadonlyMap<string, LookbookDecodeResult>,
  failures: ReadonlySet<string>
) {
  const counts = new Map<number, number>()
  const unresolved: string[] = []
  let parsed = 0
  let pending = 0
  let failed = 0
  for (const [code, weight] of codes) {
    const result = results.get(code)
    if (!result) {
      unresolved.push(code)
      if (failures.has(code)) failed += weight
      else pending += weight
      continue
    }
    parsed += weight
    for (const id of new Set(result.wearingClothes.map((item) => item.itemId))) {
      counts.set(id, (counts.get(id) ?? 0) + weight)
    }
  }
  return { counts, parsed, pending, failed, unresolved }
}

export function outfitSummaryTrend(
  outfits: readonly Pick<OutfitRecord, 'createdAt'>[],
  now: Date
): OutfitSummaryPeriod[] {
  const dates = outfits
    .map((outfit) => new Date(outfit.createdAt))
    .filter((date) => Number.isFinite(+date))
  if (!dates.length) return []

  const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth()
  const months = new Map<number, number>()
  let first = Infinity
  let last = monthIndex(now)
  for (const date of dates) {
    const month = monthIndex(date)
    months.set(month, (months.get(month) ?? 0) + 1)
    first = Math.min(first, month)
    last = Math.max(last, month)
  }

  // 极早或极晚的导入日期合并到较宽的时段，限制空柱数量。
  const step = Math.ceil((last - first + 1) / 120)
  const monthStart = (month: number) => {
    const date = new Date(0)
    date.setFullYear(Math.floor(month / 12), month % 12, 1)
    date.setHours(0, 0, 0, 0)
    return +date
  }
  const periods = Array.from({ length: Math.ceil((last - first + 1) / step) }, (_, index) => {
    const month = first + index * step
    const start = monthStart(month)
    return {
      start: Number.isFinite(start) ? start : -8.64e15,
      end: monthStart(month + step),
      count: 0
    }
  })
  for (const [month, count] of months) periods[Math.floor((month - first) / step)].count += count
  return periods
}
