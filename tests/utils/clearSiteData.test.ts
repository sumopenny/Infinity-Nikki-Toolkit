// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearSiteData } from '../../src/utils/clearSiteData'
import { clearAllBrowserData } from '../../src/utils/file-system/database'

vi.mock('../../src/utils/file-system/database', () => ({ clearAllBrowserData: vi.fn() }))
beforeEach(() => {
  vi.mocked(clearAllBrowserData).mockReset().mockResolvedValue()
  localStorage.setItem('saved', 'yes')
  sessionStorage.setItem('saved', 'yes')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

it('clears local data, caches and registrations without network access', async () => {
  const request = vi.fn().mockRejectedValue(new TypeError('offline'))
  const remove = vi.fn().mockResolvedValue(true)
  const unregister = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('fetch', request)
  vi.stubGlobal('caches', { keys: async () => ['old-shell'], delete: remove })
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister }] } })
  await clearSiteData()
  expect(request).not.toHaveBeenCalled()
  expect(clearAllBrowserData).toHaveBeenCalledOnce()
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
  expect(remove).toHaveBeenCalledWith('old-shell')
  expect(unregister).toHaveBeenCalledOnce()
})

it('propagates database failures so callers cannot report a complete reset', async () => {
  vi.mocked(clearAllBrowserData).mockRejectedValue(new Error('storage failure'))
  await expect(clearSiteData()).rejects.toThrow('storage failure')
  expect(localStorage.getItem('saved')).toBe('yes')
})

it('reports incomplete cache clearing even when business data has already been cleared', async () => {
  vi.stubGlobal('caches', { keys: vi.fn().mockRejectedValue(new Error('cache unavailable')) })
  await expect(clearSiteData()).rejects.toThrow('cache unavailable')
  expect(clearAllBrowserData).toHaveBeenCalledOnce()
  expect(localStorage.length).toBe(0)
})
