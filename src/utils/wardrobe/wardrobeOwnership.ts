import type { WardrobeEntry } from './wardrobeCatalog'
import type { WardrobeSnapshot } from './wardrobeStorage'
import { isWardrobeItemUnknown } from './wardrobeFilters'
import { hasWardrobeSnapshot } from './wardrobeSchema'

export { hasWardrobeSnapshot }
export function getOwnershipSummary(entry: WardrobeEntry, snapshot: WardrobeSnapshot) {
  const owned = entry.parts.reduce((count, id) => count + (snapshot.entries[id]?.owned ? 1 : 0), 0)
  return {
    owned,
    total: entry.parts.length,
    complete: entry.parts.length > 0 && owned === entry.parts.length,
    unknown: !hasWardrobeSnapshot(snapshot) || isWardrobeItemUnknown(entry, owned > 0)
  }
}
