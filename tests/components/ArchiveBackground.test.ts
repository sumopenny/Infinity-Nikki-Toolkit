import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  document.documentElement.removeAttribute('style')
})
afterEach(() => vi.restoreAllMocks())

it('restores the saved background and persists a new selection using the original image', async () => {
  localStorage.setItem('archive-background', 'sakura')
  const { useArchiveBackground, archiveBackgrounds } = await import('../../src/composables/useArchiveBackground')
  let state!: ReturnType<typeof useArchiveBackground>
  const wrapper = mount(defineComponent({ setup() { state = useArchiveBackground(); return () => null } }))
  expect(state.selectedBackground.value).toBe('sakura')
  expect(document.documentElement.style.getPropertyValue('--archive-background-source')).toContain(archiveBackgrounds.find((item) => item.id === 'sakura')!.url)
  state.selectBackground('gold')
  expect(localStorage.getItem('archive-background')).toBe('gold')
  expect(document.documentElement.style.getPropertyValue('--archive-background-source')).toContain(archiveBackgrounds.find((item) => item.id === 'gold')!.url)
  wrapper.unmount()
})

it('keeps selection usable when browser storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
  const { useArchiveBackground, archiveBackgrounds } = await import('../../src/composables/useArchiveBackground')
  let state!: ReturnType<typeof useArchiveBackground>
  const wrapper = mount(defineComponent({ setup() { state = useArchiveBackground(); return () => null } }))
  expect(state.selectedBackground.value).toBe('silk')
  expect(() => state.selectBackground('dream')).not.toThrow()
  expect(state.selectedBackground.value).toBe('dream')
  expect(document.documentElement.style.getPropertyValue('--archive-background-source')).toContain(archiveBackgrounds.find((item) => item.id === 'dream')!.url)
  wrapper.unmount()
})
