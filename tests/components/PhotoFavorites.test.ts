import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { usePhotoFavorites } from '../../src/composables/usePhotoFavorites'
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  localStorage.clear()
  vi.restoreAllMocks()
})
function page() {
  let state!: ReturnType<typeof usePhotoFavorites>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          state = usePhotoFavorites(() => true)
          return () => null
        }
      })
    )
  )
  return state
}
it('merges independent stale pages without losing additions or resurrecting removals', () => {
  localStorage.setItem('infinity-nikki-favorite-photo-ids:item:old', '1')
  const a = page(),
    b = page()
  a.value = new Set(['a'])
  b.value = new Set([...b.value, 'b'])
  expect([...page().value].sort()).toEqual(['a', 'b'])
  window.dispatchEvent(
    new StorageEvent('storage', { key: 'infinity-nikki-favorite-photo-ids:item:old' })
  )
  window.dispatchEvent(
    new StorageEvent('storage', { key: 'infinity-nikki-favorite-photo-ids:item:a' })
  )
  expect([...b.value].sort()).toEqual(['a', 'b'])
})

it('updates only the changed key, removes cancelled favorites and handles clear without echo writes', () => {
  const prefix = 'infinity-nikki-favorite-photo-ids:item:'
  localStorage.setItem(prefix + 'a', '1')
  const state = page()
  state.value.delete('a')
  expect(localStorage.getItem(prefix + 'a')).toBeNull()
  localStorage.setItem(prefix + 'b', '1')
  const keys = vi.spyOn(Storage.prototype, 'key')
  const writes = vi.spyOn(Storage.prototype, 'setItem')
  window.dispatchEvent(new StorageEvent('storage', { key: prefix + 'b', newValue: '0' }))
  expect([...state.value]).toEqual(['b'])
  expect(keys).not.toHaveBeenCalled()
  expect(writes).not.toHaveBeenCalled()
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage', { key: null }))
  expect(state.value.size).toBe(0)
  expect(writes).not.toHaveBeenCalled()
})
it('keeps the current favorites when storage is unavailable', () => {
  const state = page()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable')
  })
  state.value.add('local')
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('unavailable')
  })
  window.dispatchEvent(
    new StorageEvent('storage', { key: 'infinity-nikki-favorite-photo-ids:item:local' })
  )
  expect([...state.value]).toEqual(['local'])
})
