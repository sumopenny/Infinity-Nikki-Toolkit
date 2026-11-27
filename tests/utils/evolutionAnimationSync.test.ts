import { afterEach, expect, it, vi } from 'vitest'
import type { WardrobeEntry } from '../../src/utils/wardrobe/wardrobeCatalog'
const part = {
  version: '3.12',
  name: '新套装',
  source: '限定共鸣',
  page: 50,
  cid: '999999999',
  duration: 40,
  thumbnail: ''
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})
it('starts empty, coalesces reads and caches only successfully fetched content', async () => {
  const fetcher = vi.fn(async () => Response.json([part]))
  vi.stubGlobal('fetch', fetcher)
  const m = await import('../../src/utils/evolutionAnimations')
  expect(m.animations).toHaveLength(0)
  await Promise.all([m.loadEvolutionAnimations(), m.loadEvolutionAnimations()])
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(m.animations).toEqual([part])
  await m.loadEvolutionAnimations()
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('preserves Bilibili content on refresh failure and recovers on retry', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json([part]))
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json([{ ...part, page: 51 }]))
  vi.stubGlobal('fetch', fetcher)
  const m = await import('../../src/utils/evolutionAnimations')
  await m.loadEvolutionAnimations()
  await m.loadEvolutionAnimations(true)
  expect(m.animationSyncStatus.value).toBe('error')
  expect(m.animations[0].page).toBe(50)
  await m.loadEvolutionAnimations(true)
  expect(m.animationSyncStatus.value).toBe('ready')
  expect(m.animations[0]).toMatchObject({ cid: part.cid, page: 51 })
})
it('does not populate any fallback on initial network failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('offline')
    })
  )
  const m = await import('../../src/utils/evolutionAnimations')
  await m.loadEvolutionAnimations()
  expect(m.animations).toHaveLength(0)
  expect(m.animationSyncStatus.value).toBe('error')
})
it('links outfit names and builds URLs entirely from live Bilibili metadata', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([part]))
  )
  const m = await import('../../src/utils/evolutionAnimations')
  await m.loadEvolutionAnimations()
  expect(m.animationForOutfit({ name: { zh: '新套装·进化' } } as WardrobeEntry)).toEqual(part)
  expect(m.animationForOutfit({ name: { zh: '其他套装' } } as WardrobeEntry)).toBeUndefined()
  expect(m.animationWatchUrl(part)).toContain('?p=50')
  expect(m.animationPlayerUrl(part)).toContain('cid=999999999&p=50')
})
