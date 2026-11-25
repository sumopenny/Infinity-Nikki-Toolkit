import { afterEach, expect, it, vi } from 'vitest'
import { useGameAlbumProfiles } from '../../src/composables/useGameAlbumProfiles'

afterEach(() => vi.unstubAllGlobals())

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
  expect(fetchProfile).toHaveBeenCalledTimes(2)
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
