// 部件图鉴查询:懒加载本地图鉴数据(部件与妆容的中英文名称),按语言返回名称与图标地址。
import { getCatalogImageSource } from '../gongeo/catalogImage'
import { loadCatalogNames } from '../gongeo/catalogResources'

export interface ItemCatalogEntry {
  id: number
  zh: string
  en: string
  makeup: boolean
}

/** 保留原图鉴的双语兜底及有效 ID 规则，仅在内存中建立查询索引。 */
function collectNames(raw: Record<string, string>, kind: 'item' | 'makeup') {
  const names = new Map<number, string>()
  const pattern = new RegExp(`^${kind}\\.(\\d+)\\.name$`)
  for (const [key, value] of Object.entries(raw)) {
    const match = key.match(pattern)
    if (match && value.trim()) names.set(Number(match[1]), value.trim())
  }
  return names
}

let catalogPromise: Promise<Map<number, ItemCatalogEntry>> | null = null

/** 懒加载图鉴,首次调用后常驻内存;加载失败允许下次重试。 */
export function loadItemCatalog(): Promise<Map<number, ItemCatalogEntry>> {
  catalogPromise ??= Promise.all([
    loadCatalogNames('item', 'zh'),
    loadCatalogNames('item', 'en'),
    loadCatalogNames('makeup', 'zh'),
    loadCatalogNames('makeup', 'en')
  ])
    .then(([itemZh, itemEn, makeupZh, makeupEn]) => {
      const map = new Map<number, ItemCatalogEntry>()
      for (const [kind, zhRaw, enRaw] of [
        ['item', itemZh, itemEn],
        ['makeup', makeupZh, makeupEn]
      ] as const) {
        const zhNames = collectNames(zhRaw, kind)
        const enNames = collectNames(enRaw, kind)
        for (const id of new Set([...zhNames.keys(), ...enNames.keys()])) {
          const zh = zhNames.get(id) ?? enNames.get(id)!
          const en = enNames.get(id) ?? zh
          map.set(id, { id, zh, en, makeup: kind === 'makeup' })
        }
      }
      return map
    })
    .catch((error) => {
      catalogPromise = null
      throw error
    })
  return catalogPromise
}

/** 部件与妆容图标分别位于不同 CDN 路径。 */
export function getCatalogImageUrl(entry: ItemCatalogEntry): string {
  return getCatalogImageSource(entry.makeup ? 'makeup' : 'icon', entry.id)
}

export function getCatalogEntryName(entry: ItemCatalogEntry, language: 'zh' | 'en'): string {
  return language === 'en' ? entry.en : entry.zh
}
