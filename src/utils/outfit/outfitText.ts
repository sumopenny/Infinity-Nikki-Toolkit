import type { Language } from '../../i18n/types'
import { loadCatalogNames } from '../gongeo/catalogResources'

export interface OutfitText {
  id: number
  name?: string
  description: string
}

/** Load GitHub names and extracted descriptions from local snapshots only. */
export async function loadOutfitText(
  outfitId: string | number,
  language: Language,
  signal?: AbortSignal
): Promise<OutfitText> {
  const id = String(outfitId)
  if (!/^[1-9]\d*$/.test(id) || !['zh', 'en'].includes(language)) throw new Error('Invalid catalog request')
  signal?.throwIfAborted()
  const [names, descriptions] = await Promise.all([
    loadCatalogNames('outfit', language),
    language === 'zh'
      ? import('../../data/outfits/locales/zh/outfitDescriptions.json').then((m) => m.default)
      : import('../../data/outfits/locales/en/outfitDescriptions.json').then((m) => m.default)
  ])
  signal?.throwIfAborted()
  const rows = descriptions as Record<string, { id: number; description: string }>
  return {
    id: Number(id),
    name: names[`outfit.${id}.name`],
    description: rows[id]?.description ?? ''
  }
}

