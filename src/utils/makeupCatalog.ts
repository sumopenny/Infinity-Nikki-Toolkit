import type { Language } from '../i18n/types'
import { wardrobeSourceOptions, matchesWardrobeSource } from './wardrobe/wardrobeFilters'

/** 全妆与妆容部件共用来源命名，排除服装专用奖励分类。 */
export function makeupSourceLabel(
  entry: Pick<MakeupEntry, 'obtainType' | 'sourceDetails'> | null,
  language: Language
): string {
  return entry
    ? wardrobeSourceOptions('item', language)
        .filter(
          (option) =>
            option.value !== 'limited-reward' && matchesWardrobeSource(entry, option.value)
        )
        .map((option) => option.label)
        .join(' · ')
    : ''
}

export interface MakeupEntry {
  id: string
  category: number
  name: Record<Language, string>
  image: string
  quality: number | undefined
  variant: number | null
  version: string | null
  obtainType: number | null
  sourceDetails: string[]
}

export interface MakeupRelations {
  partIds: string[]
  formIds: string[]
  outfitIds: string[]
}

export interface MakeupRelatedOutfit {
  id: string
  name: Record<Language, string>
  image: string
  variant: number
}
