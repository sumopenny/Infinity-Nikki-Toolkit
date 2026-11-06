import type { Language } from '../../i18n/types'

/** 共享原始资源的进行中请求和结果；下载失败不缓存，下一次操作可以重试。 */
function resource<T>(load: () => Promise<{ default: T }>) {
  let pending: Promise<T> | undefined
  return () => {
    pending ??= load()
      .then((module) => module.default)
      .catch((error) => {
        pending = undefined
        throw error
      })
    return pending
  }
}

export const catalogResources = {
  items: resource(() => import('../../data/gongeo/items.json')),
  outfits: resource(() => import('../../data/gongeo/outfits.json')),
  outfitItems: resource(() => import('../../data/gongeo/outfitItems.json')),
  makeupItems: resource(() => import('../../data/gongeo/makeupItems.json')),
  makeupOutfits: resource(() => import('../../data/gongeo/makeupOutfits.json')),
  palettes: resource(() => import('../../data/gongeo/palettes.json'))
}
const names = {
  makeup: {
    zh: resource(() => import('../../data/gongeo/locales/zh/makeup.json')),
    en: resource(() => import('../../data/gongeo/locales/en/makeup.json'))
  },
  item: {
    zh: resource(() => import('../../data/gongeo/locales/zh/item.json')),
    en: resource(() => import('../../data/gongeo/locales/en/item.json'))
  },
  outfit: {
    zh: resource(() => import('../../data/gongeo/locales/zh/outfit.json')),
    en: resource(() => import('../../data/gongeo/locales/en/outfit.json'))
  }
}

export function loadCatalogNames(
  kind: 'item' | 'outfit' | 'makeup',
  language: Language
): Promise<Record<string, string>> {
  return names[kind][language]()
}
