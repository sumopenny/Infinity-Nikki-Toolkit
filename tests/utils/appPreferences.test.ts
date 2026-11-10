// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { useAppPreferences } from '../../src/composables/useAppPreferences'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

function setup() {
  const compact = ref(false)
  let persist = true
  const onStatus = vi.fn()
  let preferences!: ReturnType<typeof useAppPreferences>
  const wrapper = mount(
    defineComponent({
      setup() {
        preferences = useAppPreferences({
          compactLayout: compact,
          canPersist: () => persist,
          onStatus
        })
        return () => null
      }
    })
  )
  return {
    preferences,
    compact,
    onStatus,
    wrapper,
    pause: () => {
      persist = false
    }
  }
}

it('migrates legacy half to square and desktop small without changing mobile size', () => {
  for (const key of [
    'infinity-nikki-thumbnail-mode',
    'infinity-nikki-outfit-thumbnail-mode',
    'infinity-nikki-home-thumbnail-mode'
  ])
    localStorage.setItem(key, 'half')
  const { preferences, compact, wrapper } = setup()
  expect(preferences.thumbnailMode.value).toBe('default')
  expect(preferences.outfitThumbnailMode.value).toBe('default')
  expect(preferences.homeThumbnailMode.value).toBe('default')
  expect(preferences.thumbnailSizes.value).toEqual({
    photo: 'small',
    outfit: 'small',
    camera: 'medium',
    home: 'small'
  })
  compact.value = true
  expect(preferences.thumbnailSizes.value.photo).toBe('medium')
  compact.value = false
  expect(preferences.thumbnailSizes.value.photo).toBe('small')
  wrapper.unmount()
  const reloaded = setup()
  expect(reloaded.preferences.thumbnailSizes.value.photo).toBe('small')
  reloaded.wrapper.unmount()
})

it('saves ratios independently of sizes and separates modules and devices', () => {
  const { preferences, compact, wrapper } = setup()
  preferences.saveThumbnailMode('photo', 'wide')
  preferences.saveThumbnailSize('photo', 'large')
  preferences.saveThumbnailSize('outfit', 'small')
  expect(preferences.thumbnailSizes.value).toEqual({
    photo: 'large',
    outfit: 'small',
    camera: 'medium',
    home: 'medium'
  })
  compact.value = true
  expect(preferences.thumbnailSizes.value).toEqual({
    photo: 'medium',
    outfit: 'medium',
    camera: 'medium',
    home: 'medium'
  })
  preferences.saveThumbnailSize('photo', 'small')
  preferences.saveThumbnailSize('home', 'large')
  expect(preferences.thumbnailMode.value).toBe('wide')
  preferences.saveThumbnailMode('photo', 'portrait-standard')
  expect(preferences.thumbnailSizes.value.photo).toBe('small')
  compact.value = false
  expect(preferences.thumbnailSizes.value.photo).toBe('large')
  expect(preferences.thumbnailMode.value).toBe('portrait-standard')
  wrapper.unmount()
  const reloaded = setup()
  expect(reloaded.preferences.thumbnailSizes.value.photo).toBe('large')
  reloaded.compact.value = true
  expect(reloaded.preferences.thumbnailSizes.value).toEqual({
    photo: 'small',
    outfit: 'medium',
    camera: 'medium',
    home: 'large'
  })
  reloaded.wrapper.unmount()
})

it('falls back for invalid values and preserves explicit sizes during migration', () => {
  localStorage.setItem('infinity-nikki-photo-thumbnail-size-mobile', 'invalid')
  localStorage.setItem('infinity-nikki-photo-thumbnail-size-desktop', 'large')
  localStorage.setItem('infinity-nikki-thumbnail-mode', 'half')
  localStorage.setItem('infinity-nikki-outfit-thumbnail-mode', 'invalid')
  const { preferences, compact, wrapper } = setup()
  expect(preferences.thumbnailSizes.value.photo).toBe('large')
  expect(preferences.outfitThumbnailMode.value).toBe('portrait-standard')
  compact.value = true
  expect(preferences.thumbnailSizes.value.photo).toBe('medium')
  // 外部事件传入旧值或非法值时，不能污染已经迁移的设置。
  preferences.saveThumbnailMode('photo', 'half' as never)
  preferences.saveThumbnailSize('photo', 'invalid' as never)
  expect(preferences.thumbnailMode.value).toBe('default')
  expect(preferences.thumbnailSizes.value.photo).toBe('medium')
  wrapper.unmount()
})

it('does not repopulate storage while website reset suppresses persistence', async () => {
  const { preferences, pause, wrapper } = setup()
  pause()
  localStorage.clear()
  preferences.language.value = 'en'
  preferences.autoParseActionsEnabled.value = true
  preferences.saveThumbnailMode('home', 'default')
  preferences.saveThumbnailSize('home', 'large')
  const switching = preferences.toggleTheme()
  await switching
  await nextTick()
  expect(localStorage.length).toBe(0)
  expect(document.documentElement.lang).toBe('en')
  expect(preferences.homeThumbnailMode.value).toBe('default')
  wrapper.unmount()
})

it('applies preferences immediately and stops persistence watchers on unmount', async () => {
  const { preferences, onStatus, wrapper } = setup()
  const initial = preferences.language.value
  const switching = preferences.toggleLanguage()
  expect(preferences.language.value).not.toBe(initial)
  await switching
  expect(preferences.language.value).not.toBe(initial)
  expect(onStatus).toHaveBeenCalledTimes(1)
  const stored = localStorage.getItem('infinity-nikki-language')
  wrapper.unmount()
  preferences.language.value = initial
  await nextTick()
  expect(localStorage.getItem('infinity-nikki-language')).toBe(stored)
  expect(document.documentElement.classList.contains('is-theme-switching')).toBe(false)
})

it('remembers camera sizes independently across devices and reloads', () => {
  const { preferences, compact, wrapper } = setup()
  preferences.saveThumbnailSize('camera', 'small')
  expect(preferences.thumbnailSizes.value.photo).toBe('medium')
  compact.value = true
  expect(preferences.thumbnailSizes.value.camera).toBe('medium')
  preferences.saveThumbnailSize('camera', 'large')
  compact.value = false
  expect(preferences.thumbnailSizes.value.camera).toBe('small')
  wrapper.unmount()
  const reloaded = setup()
  expect(reloaded.preferences.thumbnailSizes.value.camera).toBe('small')
  reloaded.compact.value = true
  expect(reloaded.preferences.thumbnailSizes.value.camera).toBe('large')
  reloaded.wrapper.unmount()
})

it.each(['docked', 'capsule'] as const)(
  'applies and restores mobile navigation style %s',
  async (style) => {
    const { preferences, compact, wrapper } = setup()
    preferences.setMobileNavStyle(style)
    await nextTick()
    expect(document.documentElement.dataset.mobileNavStyle).toBe(style)
    expect(localStorage.getItem('infinity-nikki-mobile-nav-style')).toBe(style)
    compact.value = true
    expect(preferences.mobileNavStyle.value).toBe(style)
    wrapper.unmount()
    const restored = setup()
    expect(restored.preferences.mobileNavStyle.value).toBe(style)
    restored.wrapper.unmount()
  }
)

it('rejects invalid navigation styles and respects suspended persistence', async () => {
  localStorage.setItem('infinity-nikki-mobile-nav-style', 'invalid')
  const { preferences, wrapper, pause } = setup()
  expect(preferences.mobileNavStyle.value).toBe('docked')
  pause()
  preferences.setMobileNavStyle('capsule')
  await nextTick()
  expect(document.documentElement.dataset.mobileNavStyle).toBe('capsule')
  expect(localStorage.getItem('infinity-nikki-mobile-nav-style')).toBe('docked')
  wrapper.unmount()
})

it.each(['opaque', 'frosted', 'glass'] as const)(
  'saves material %s independently from navigation layout',
  async (material) => {
    const { preferences, wrapper } = setup()
    preferences.setMobileNavStyle('capsule')
    preferences.setSurfaceStyle(material)
    await nextTick()
    expect(document.documentElement.dataset.surfaceStyle).toBe(material)
    expect(preferences.mobileNavStyle.value).toBe('capsule')
    expect(localStorage.getItem('infinity-nikki-surface-style')).toBe(material)
    preferences.setMobileNavStyle('docked')
    await nextTick()
    expect(preferences.surfaceStyle.value).toBe(material)
    wrapper.unmount()
    const restored = setup()
    expect(restored.preferences.surfaceStyle.value).toBe(material)
    expect(restored.preferences.mobileNavStyle.value).toBe('docked')
    restored.wrapper.unmount()
  }
)
