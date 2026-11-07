import type { Language } from '../i18n/types'

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
