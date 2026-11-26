// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { withCatalogResources } from '../helpers/catalogFetch'

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

it('uses browser storage and accepts browser abort signals for JSON resources', async () => {
  for (const storage of [localStorage, sessionStorage]) {
    storage.setItem('environment-check', 'saved')
    expect(storage.getItem('environment-check')).toBe('saved')
  }
  const controller = new AbortController()
  const url = 'data:application/json;base64,eyJvayI6dHJ1ZX0='
  const response = await fetch(url, { signal: controller.signal })
  expect(await response.json()).toEqual({ ok: true })
  controller.abort()
  await expect(fetch(url, { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError'
  })
})

it('keeps catalog fetches out of service mocks while preserving cancellation', async () => {
  const service = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ service: true }))
  const request = withCatalogResources(service)
  const url = 'data:application/json;base64,eyJvayI6dHJ1ZX0='
  expect(await (await request(url)).json()).toEqual({ ok: true })
  expect(service).not.toHaveBeenCalled()
  const controller = new AbortController()
  controller.abort()
  await expect(request(url, { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError'
  })
  expect(await (await request('https://service.test/example')).json()).toEqual({ service: true })
  expect(service).toHaveBeenCalledTimes(1)
  expect(service).toHaveBeenCalledWith('https://service.test/example', undefined)
})
