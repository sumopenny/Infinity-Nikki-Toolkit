import type { BackupModule, ChangeKind } from './changeJournal'
export const monitored: Record<string, [BackupModule, ChangeKind]> = {
  ['outfits']: ['outfits', 'record'],
  ['outfit-images']: ['outfits', 'image'],
  ['outfit-tags']: ['outfits', 'tags'],
  ['outfit-ignored-sharecodes']: ['outfits', 'ignored'],
  ['home-schemes']: ['home', 'record'],
  ['home-scheme-images']: ['home', 'image'],
  ['home-scheme-tags']: ['home', 'tags'],
  ['camera-favorites']: ['camera', 'record'],
  ['camera-favorite-covers']: ['camera', 'image'],
  ['camera-favorite-tags']: ['camera', 'tags']
}
