import type { DBSchema } from 'idb'
import type { OutfitRecord } from '../outfit/outfitTypes'
import type { OutfitImage } from '../outfit/outfitStorage'
import type { GameSourceState } from '../outfit/outfitFileSystem'
import type { HomeSchemeRecord } from '../homeBuild/homeSchemeTypes'
import type { HomeSchemeImage } from '../homeBuild/homeSchemeStorage'
import type { CameraFavorite } from '../photo-params/favorites'
import type { ResonanceRecord } from '../resonance/resonanceTypes'
import type { WardrobeSnapshot } from '../wardrobe/wardrobeSchema'
import type { DirtyChange } from '../directory-backup/changeJournal'
import type { StagingItem } from '../directory-backup/restore'

/** 持久化结构不变；混合键值表仍由对应业务入口校验，不能假定旧数据有效。 */
export interface NikkiSchema extends DBSchema {
  outfits: { key: string; value: OutfitRecord; indexes: { code: string } }
  'outfit-images': { key: string; value: OutfitImage }
  'outfit-tags': { key: string; value: string[] }
  'outfit-ignored-codes': { key: string; value: { code: string } }
  'outfit-game-sources': { key: string; value: GameSourceState }
  'home-schemes': { key: string; value: HomeSchemeRecord; indexes: { code: string } }
  'home-scheme-images': { key: string; value: HomeSchemeImage }
  'home-scheme-tags': { key: string; value: string[] }
  'camera-params': { key: string; value: CameraFavorite; indexes: { code: string } }
  'camera-param-covers': { key: string; value: Blob }
  'camera-param-tags': { key: string; value: string[] }
  'local-state': { key: string; value: unknown }
  'resonance-records': { key: string; value: ResonanceRecord[] }
  wardrobe: { key: string; value: WardrobeSnapshot }
  'directory-backup-changes': { key: DirtyChange['key']; value: DirtyChange }
  'directory-backup-state': { key: string; value: { key: string; [field: string]: unknown } }
  'directory-backup-staging': {
    key: [StagingItem['module'], StagingItem['kind'], string]
    value: StagingItem
  }
}
