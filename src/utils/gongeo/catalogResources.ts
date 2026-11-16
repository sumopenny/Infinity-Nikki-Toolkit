import type { Language } from '../../i18n/types'
import { jsonResource } from '../resourceRecovery'
import itemsUrl from '../../data/gongeo/items.json?url'
import outfitsUrl from '../../data/gongeo/outfits.json?url'
import outfitItemsUrl from '../../data/gongeo/outfitItems.json?url'
import makeupsUrl from '../../data/gongeo/makeups.json?url'
import makeupItemsUrl from '../../data/gongeo/makeupItems.json?url'
import makeupOutfitsUrl from '../../data/gongeo/makeupOutfits.json?url'
import palettesUrl from '../../data/gongeo/palettes.json?url'
import makeupNamesZhUrl from '../../data/gongeo/locales/zh/makeup.json?url'
import makeupNamesEnUrl from '../../data/gongeo/locales/en/makeup.json?url'
import itemNamesZhUrl from '../../data/gongeo/locales/zh/item.json?url'
import itemNamesEnUrl from '../../data/gongeo/locales/en/item.json?url'
import outfitNamesZhUrl from '../../data/gongeo/locales/zh/outfit.json?url'
import outfitNamesEnUrl from '../../data/gongeo/locales/en/outfit.json?url'

export const catalogResources = {
  items: jsonResource<typeof import('../../data/gongeo/items.json')>(itemsUrl),
  outfits: jsonResource<typeof import('../../data/gongeo/outfits.json')>(outfitsUrl),
  outfitItems: jsonResource<typeof import('../../data/gongeo/outfitItems.json')>(outfitItemsUrl),
  makeups: jsonResource<typeof import('../../data/gongeo/makeups.json')>(makeupsUrl),
  makeupItems: jsonResource<typeof import('../../data/gongeo/makeupItems.json')>(makeupItemsUrl),
  makeupOutfits:
    jsonResource<typeof import('../../data/gongeo/makeupOutfits.json')>(makeupOutfitsUrl),
  palettes: jsonResource<typeof import('../../data/gongeo/palettes.json')>(palettesUrl)
}
const names = {
  makeup: {
    zh: jsonResource<typeof import('../../data/gongeo/locales/zh/makeup.json')>(makeupNamesZhUrl),
    en: jsonResource<typeof import('../../data/gongeo/locales/en/makeup.json')>(makeupNamesEnUrl)
  },
  item: {
    zh: jsonResource<typeof import('../../data/gongeo/locales/zh/item.json')>(itemNamesZhUrl),
    en: jsonResource<typeof import('../../data/gongeo/locales/en/item.json')>(itemNamesEnUrl)
  },
  outfit: {
    zh: jsonResource<typeof import('../../data/gongeo/locales/zh/outfit.json')>(outfitNamesZhUrl),
    en: jsonResource<typeof import('../../data/gongeo/locales/en/outfit.json')>(outfitNamesEnUrl)
  }
}

export function loadCatalogNames(
  kind: 'item' | 'outfit' | 'makeup',
  language: Language
): Promise<Record<string, string>> {
  return names[kind][language]()
}
