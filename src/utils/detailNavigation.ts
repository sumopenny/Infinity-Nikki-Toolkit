import type { MakeupEntry } from './makeupCatalog'
import type { MakeupCatalogData } from './loadMakeupCatalog'
import type { WardrobeCatalog, WardrobeEntry } from './wardrobe/wardrobeCatalog'
import type { WardrobeSnapshot } from './wardrobe/wardrobeStorage'
export type DetailPage =
  | { kind: 'makeup'; detail: MakeupEntry; data: MakeupCatalogData }
  | {
      kind: 'outfit'
      detail: WardrobeEntry
      catalog: WardrobeCatalog | null
      snapshot: WardrobeSnapshot
    }
