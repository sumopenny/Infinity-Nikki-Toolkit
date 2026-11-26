import { afterEach, expect, it, vi } from 'vitest'
import { useGameAlbumProfiles } from '../../src/composables/useGameAlbumProfiles'

afterEach(() => vi.unstubAllGlobals())

it('falls back to the shared global endpoint once and caches the successful result', async () => {
  const fetchProfile = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ code: 1 }))
    .mockResolvedValueOnce(
      Response.json({ code: 0, data: { role: { uid: 123, nickname: 'Global', zone_id: 6 } } })
    )
  vi.stubGlobal('fetch', fetchProfile)
  const { loadProfile } = useGameAlbumProfiles()
  const request = loadProfile('123')
  expect(loadProfile('123')).toBe(request)
  expect(await request).toMatchObject({ nickname: 'Global' })
  expect(fetchProfile.mock.calls.map(([url]) => url)).toEqual([
    'https://myl-api.nuanpaper.com/v1/strategy/user/info/get',
    'https://pearpal-api.infoldgames.com/v1/strategy/user/info/get'
  ])
  expect(JSON.parse(fetchProfile.mock.calls[1][1].body)).toEqual({
    client_id: 1116,
    query_uid: 123
  })
  await loadProfile('123')
  expect(fetchProfile).toHaveBeenCalledTimes(2)
})

it('retries failed lookups and shares the result of concurrent requests', async () => {
  const fetchProfile = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(
      Response.json({ code: 0, data: { role: { uid: 123, nickname: '角色' } } })
    )
  vi.stubGlobal('fetch', fetchProfile)
  const { loadProfile } = useGameAlbumProfiles()
  expect(await loadProfile('123')).toBeNull()
  const retry = loadProfile('123')
  expect(loadProfile('123')).toBe(retry)
  expect(await retry).toMatchObject({ nickname: '角色' })
  expect(fetchProfile).toHaveBeenCalledTimes(3)
})

it('queries the official profile anonymously and caches only album display fields by UID', async () => {
  const fetchProfile = vi.fn().mockResolvedValue(
    Response.json({
      code: 0,
      data: {
        role: {
          uid: 101602347,
          nickname: ' 素茉 ',
          avatar: 'https://images.example.test/avatar.png',
          level: 99,
          created_at: '2024-12-05T10:46:05+08:00',
          updated_at: '2026-11-24T22:00:31+08:00',
          openid: 'unused',
          ip: '192.0.2.1'
        }
      }
    })
  )
  vi.stubGlobal('fetch', fetchProfile)
  const { profiles, loadProfile } = useGameAlbumProfiles()
  loadProfile('101602347')
  loadProfile('101602347')
  expect(profiles.get('101602347')).toBeUndefined()
  await vi.waitFor(() =>
    expect(profiles.get('101602347')).toEqual({
      nickname: '素茉',
      avatarUrl: 'https://images.example.test/avatar.png',
      level: 99,
      createdAt: '2024-12-05T10:46:05+08:00',
      updatedAt: '2026-11-24T22:00:31+08:00'
    })
  )
  loadProfile('101602347')
  expect(fetchProfile).toHaveBeenCalledTimes(1)
  expect(fetchProfile).toHaveBeenCalledWith(
    'https://myl-api.nuanpaper.com/v1/strategy/user/info/get',
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: '{"client_id":1106,"query_uid":101602347}'
    })
  )
})

it('leaves UID-only labels when the profile is unavailable or belongs to a different account', async () => {
  const fetchProfile = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ code: 0, data: { role: { uid: 2, nickname: '其他账号' } } })
    )
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
  vi.stubGlobal('fetch', fetchProfile)
  const { profiles, loadProfile } = useGameAlbumProfiles()
  loadProfile('1')
  loadProfile('2')
  loadProfile('not-a-uid')
  await vi.waitFor(() => {
    expect(profiles.get('1')).toBeNull()
    expect(profiles.get('2')).toBeNull()
    expect(profiles.get('not-a-uid')).toBeNull()
  })
  expect(fetchProfile).toHaveBeenCalledTimes(4)
})

it('keeps valid profile fields when the nickname or other display data is missing', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          role: {
            uid: '123',
            nickname: ' ',
            avatar: 'javascript:void(0)',
            level: 1,
            updated_at: '-'
          }
        }
      })
    )
  )
  const { profiles, loadProfile } = useGameAlbumProfiles()
  loadProfile('123')
  await vi.waitFor(() =>
    expect(profiles.get('123')).toEqual({
      nickname: null,
      avatarUrl: null,
      level: 1,
      createdAt: null,
      updatedAt: null
    })
  )
})
