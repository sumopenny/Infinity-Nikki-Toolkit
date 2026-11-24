import { onBeforeUnmount, ref, watch } from 'vue'
import { removeLocalStorage, writeLocalStorage } from '../utils/localStorage'
const prefix = 'infinity-nikki-favorite-photo-ids:item:'
/** Per-photo writes prevent unrelated changes in other tabs from being overwritten. */
export function usePhotoFavorites(canPersist: () => boolean) {
  function read() {
    const ids = new Set<string>()
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(prefix) && localStorage.getItem(key) === '1')
          ids.add(key.slice(prefix.length))
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
        for (const id of baseline) if (!next.has(id)) removeLocalStorage(prefix + id)
      }
      baseline = new Set(next)
    },
    { deep: true, flush: 'sync' }
  )
  const sync = (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== localStorage) return
    if (event.key !== null && !event.key.startsWith(prefix)) return
    let next: Set<string>
    if (event.key === null) next = read()
    else {
      next = new Set(favorites.value)
      // Read the latest value: queued events may already have been superseded.
      try {
        const id = event.key.slice(prefix.length)
        localStorage.getItem(event.key) === '1' ? next.add(id) : next.delete(id)
      } catch {
        return
      }
    }
    baseline = new Set(next)
    favorites.value = next
  }
  window.addEventListener('storage', sync)
  onBeforeUnmount(() => window.removeEventListener('storage', sync))
  return favorites
}
