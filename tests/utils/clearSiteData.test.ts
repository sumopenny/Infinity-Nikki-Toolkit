// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearSiteData } from '../../src/utils/clearSiteData'
import { clearAllBrowserData } from '../../src/utils/file-system/database'

vi.mock('../../src/utils/file-system/database', () => ({ clearAllBrowserData: vi.fn() }))
// 真实 Chromium 的 fetch 响应不暴露 Clear-Site-Data。
const success = () => new Response(null, { status: 204 })
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

it('accepts a 204 without an exposed header and clears local data, caches and registrations', async () => {
  const request = vi.fn(async () => {
    expect(clearAllBrowserData).not.toHaveBeenCalled()
    expect(localStorage.getItem('saved')).toBe('yes')
    return success()
  })
  const remove = vi.fn().mockResolvedValue(true)
  const unregister = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('fetch', request)
  vi.stubGlobal('caches', { keys: async () => ['old-shell'], delete: remove })
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister }] } })
  await clearSiteData()
  expect(request).toHaveBeenCalledOnce()
  expect(request).toHaveBeenCalledWith(
    '/api/clear-site-data',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error'
    })
  )
  expect(clearAllBrowserData).toHaveBeenCalledOnce()
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
  expect(remove).toHaveBeenCalledWith('old-shell')
  expect(unregister).toHaveBeenCalledOnce()
})

it.each([
  new Response('app shell'),
  new Response(null, { status: 503 }),
  new Response(null, { status: 202 })
])('does not erase local data when the reset endpoint is unavailable', async (response) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  await expect(clearSiteData()).rejects.toThrow('Site reset unavailable')
  expect(clearAllBrowserData).not.toHaveBeenCalled()
  expect(localStorage.getItem('saved')).toBe('yes')
  expect(sessionStorage.getItem('saved')).toBe('yes')
})

it('allows retry after a network failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(success())
  )
  await expect(clearSiteData()).rejects.toThrow('offline')
  expect(clearAllBrowserData).not.toHaveBeenCalled()
  await clearSiteData()
  expect(localStorage.length).toBe(0)
})

it('propagates fallback failures so callers cannot report a complete reset', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()))
  vi.mocked(clearAllBrowserData).mockRejectedValue(new Error('storage failure'))
  await expect(clearSiteData()).rejects.toThrow('storage failure')
  expect(localStorage.getItem('saved')).toBe('yes')
})

it('reports incomplete cache clearing even when business data has already been cleared', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success()))
  vi.stubGlobal('caches', { keys: vi.fn().mockRejectedValue(new Error('cache unavailable')) })
  await expect(clearSiteData()).rejects.toThrow('cache unavailable')
  expect(clearAllBrowserData).toHaveBeenCalledOnce()
  expect(localStorage.length).toBe(0)
})
