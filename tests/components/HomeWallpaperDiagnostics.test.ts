import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useHomeWallpaper } from '../../src/composables/useHomeWallpaper'
import { reportError, trackDiagnostic } from '../../src/utils/errorReporting/errorReporter'
import { readCustomWallpaper } from '../../src/utils/homeWallpaperStorage'

vi.mock('../../src/utils/errorReporting/errorReporter', async (original) => ({
  ...(await original<object>()),
  reportError: vi.fn(),
  trackDiagnostic: vi.fn()
}))
vi.mock('../../src/utils/homeWallpaperStorage', () => ({
  readCustomWallpaper: vi.fn(),
  writeCustomWallpaper: vi.fn()
}))
vi.mock('../../src/data/homeWallpapers', () => ({
  defaultWallpaperId: () => 'default',
  homeWallpapers: [{ id: 'old' }, { id: 'default' }, { id: 'chosen' }],
  wallpaperUrl: (item: { id: string }) => item.id
}))

const failures = new Set<string>()
const held = new Set<string>()
const requested: string[] = []
const notify = vi.fn()
let wallpaper: ReturnType<typeof useHomeWallpaper>
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  failures.clear()
  held.clear()
  requested.length = 0
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 100
      naturalHeight = 100
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      removeAttribute() {}
      set src(value: string) {
        requested.push(value)
        if (!held.has(value))
          queueMicrotask(() => (failures.has(value) ? this.onerror?.() : this.onload?.()))
      }
    }
  )
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})
async function render(id: string) {
  localStorage.setItem('infinity-nikki-home-wallpaper', JSON.stringify({ wallpaperId: id }))
  wrapper = mount(
    defineComponent({
      setup() {
        wallpaper = useHomeWallpaper(notify)
        return () => null
      }
    })
  )
  await flushPromises()
}

it('records only a breadcrumb when the default preset recovers restoration', async () => {
  failures.add('old')
  await render('old')
  expect(requested).toEqual(['old', 'default'])
  expect(wallpaper.selected.value).toBe('default')
  expect(reportError).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
  expect(trackDiagnostic).toHaveBeenCalledWith('home-wallpaper', 'fallback')
})

it('reports once when both restoration candidates fail', async () => {
  failures.add('old')
  failures.add('default')
  await render('old')
  expect(reportError).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledTimes(1)
  expect(wallpaper.pending.value).toBeNull()
})

it('retains a custom storage failure even when the default preset succeeds', async () => {
  const error = new DOMException('Storage unavailable', 'UnknownError')
  vi.mocked(readCustomWallpaper).mockRejectedValue(error)
  await render('custom')
  expect(wallpaper.selected.value).toBe('default')
  expect(reportError).toHaveBeenCalledWith(error, {
    module: 'home-wallpaper',
    action: 'load-custom'
  })
  expect(reportError).toHaveBeenCalledTimes(1)
})

it('does not start a stale fallback after the user selects another wallpaper', async () => {
  held.add('old')
  await render('old')
  await wallpaper.select('chosen')
  await flushPromises()
  expect(requested).toEqual(['old', 'chosen'])
  expect(wallpaper.selected.value).toBe('chosen')
  expect(reportError).not.toHaveBeenCalled()
})

it('still resets settings when the default wallpaper is already selected', async () => {
  await render('default')
  wallpaper.setBlur(12)
  wallpaper.setLightness(25)
  await wallpaper.reset()
  expect(wallpaper.blur.value).toBe(0)
  expect(wallpaper.lightness.value).toBe(100)
})
