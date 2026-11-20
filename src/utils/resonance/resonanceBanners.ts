import banners from '../../data/gongeo/banners.json'
import bannerNamesZh from '../../data/gongeo/locales/zh/banner.json'
import bannerNamesEn from '../../data/gongeo/locales/en/banner.json'
import type { ResonanceBanner, ResonanceLocalizedName } from './resonanceTypes'
const bannerEntries = banners as unknown as Array<Record<string, unknown>>
const bannerNames = {
  zh: bannerNamesZh as Record<string, string>,
  en: bannerNamesEn as Record<string, string>
}

export function localizedName(
  zh: string | undefined,
  en: string | undefined,
  fallback: string
): ResonanceLocalizedName {
  const chinese = zh || en || fallback
  return { zh: chinese, en: en || zh || fallback }
}

/** 静态卡池只规范化一次，按稳定卡池 ID 从大到小排序。 */
const bannerCatalog: ResonanceBanner[] = bannerEntries
  .map((entry) => {
    const id = String(entry.bannerId)
    const runs = (Array.isArray(entry.runs) ? entry.runs : []) as Array<Record<string, unknown>>
    const run = [...runs].sort((a, b) =>
      String(b.start ?? '').localeCompare(String(a.start ?? ''))
    )[0]
    const fallback = typeof entry.name === 'string' ? entry.name : id
    return {
      bannerId: id,
      bannerType: Number(entry.bannerType ?? 1),
      name: localizedName(
        bannerNames.zh[`banner.${id}.name`],
        bannerNames.en[`banner.${id}.name`],
        fallback
      ),
      startAt: String(run?.start ?? ''),
      endAt: String(run?.end ?? ''),
      outfit5StarIds: Array.isArray(entry.outfit5StarId) ? entry.outfit5StarId.map(String) : [],
      outfit4StarIds: Array.isArray(entry.outfit4StarId) ? entry.outfit4StarId.map(String) : [],
      version: String(run?.version ?? '')
    }
  })
  .sort((a, b) => Number(b.bannerId) - Number(a.bannerId))
const bannersById = new Map(bannerCatalog.map((banner) => [banner.bannerId, banner]))

export function loadResonanceBanners(): ResonanceBanner[] {
  return [...bannerCatalog]
}

export function getBannerMeta(id: string): ResonanceBanner | undefined {
  return bannersById.get(id)
}
