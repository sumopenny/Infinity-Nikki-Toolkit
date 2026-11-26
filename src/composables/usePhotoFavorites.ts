import { onBeforeUnmount, ref, watch } from 'vue'
import { readLocalStorage, writeLocalStorage } from '../utils/localStorage'
const legacyKey = 'infinity-nikki-favorite-photo-ids'
const prefix = legacyKey + ':item:'
/** 只读相册允许本地覆盖 JSON，显式 false 也需保留。 */
export function localPhotoFavorite(id: string): boolean | undefined {
  const value = readLocalStorage(prefix + id)
  return value === '1' ? true : value === '0' ? false : undefined
}
export function writeLocalPhotoFavorite(id: string, value: boolean) {
  localStorage.setItem(prefix + id, value ? '1' : '0')
}
/** Per-photo writes prevent unrelated changes in other tabs from being overwritten. */
export function usePhotoFavorites(canPersist: () => boolean) {
  function read() {
    let ids = new Set<string>()
    try {
      const legacy: unknown = JSON.parse(readLocalStorage(legacyKey) ?? '[]')
      if (Array.isArray(legacy))
        ids = new Set(legacy.filter((id): id is string => typeof id === 'string'))
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith(prefix)) continue
        const id = key.slice(prefix.length)
        localStorage.getItem(key) === '1' ? ids.add(id) : ids.delete(id)
      }
    } catch {
      /* Storage may be unavailable. */
    }
    return ids
  }
  const favorites = ref(read())
  let baseline = new Set(favorites.value)
  watch(
    favorites,
    (next) => {
      if (canPersist()) {
        for (const id of next) if (!baseline.has(id)) writeLocalStorage(prefix + id, '1')
        for (const id of baseline) if (!next.has(id)) writeLocalStorage(prefix + id, '0')
      }
      baseline = new Set(next)
    },
    { deep: true, flush: 'sync' }
  )
  const sync = (event: StorageEvent) => {
    if (event.key !== null && event.key !== legacyKey && !event.key.startsWith(prefix)) return
    baseline = read()
    favorites.value = new Set(baseline)
  }
  window.addEventListener('storage', sync)
  onBeforeUnmount(() => window.removeEventListener('storage', sync))
  return favorites
}
