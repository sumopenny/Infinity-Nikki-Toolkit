import type { Language } from '../../i18n'
import { getCatalogEntryName, getCatalogImageUrl, type ItemCatalogEntry } from './itemCatalog'
import { getClothTypeLabel, inferClothTypeFromItemId } from './clothType'
import type { LookbookDecodeResult } from './outfitCodeParser'
export interface ParseItemView {
  id: number
  name: string
  imageUrl: string | null
  resolved: boolean
  outfitId: number | null
  clothType: number | null
  dyes: LookbookDecodeResult['dyeItems'][number]['dyes']
  hasSpecialEffect: boolean
  dyeColors: string[]
}

export function buildParseItems(
  result: LookbookDecodeResult,
  catalogIndex: Map<number, ItemCatalogEntry> | null,
  language: Language
): ParseItemView[] {
  const dyeByItemId = new Map(result.dyeItems.map((entry) => [entry.itemId, entry]))

  return result.wearingClothes.map(({ itemId, clothType, outfitId }) => {
    const entry = catalogIndex?.get(itemId)
    const baseName = entry ? getCatalogEntryName(entry, language) : String(itemId)
    const resolvedClothType = clothType ?? inferClothTypeFromItemId(itemId)
    const typeLabel = getClothTypeLabel(resolvedClothType, language)
    const dyeEntry = dyeByItemId.get(itemId)
    const dyes = dyeEntry?.dyes ?? []
    return {
      id: itemId,
      name: typeLabel ? `${baseName}(${typeLabel})` : baseName,
      imageUrl: entry ? getCatalogImageUrl(entry) : null,
      resolved: Boolean(entry),
      outfitId,
      clothType: resolvedClothType,
      dyes,
      hasSpecialEffect: dyeEntry?.hasSpecialEffect ?? false,
      dyeColors: [...new Set(dyes.map((dye) => dye.color))]
    }
  })
}
