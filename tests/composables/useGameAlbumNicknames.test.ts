import { afterEach, expect, it, vi } from 'vitest'
import { useGameAlbumNicknames } from '../../src/composables/useGameAlbumNicknames'

afterEach(() => vi.unstubAllGlobals())

it('queries the official profile anonymously and reuses the nickname for the same UID', async () => {
  const fetchProfile = vi
    .fn()
    .mockResolvedValue(
      Response.json({ code: 0, data: { role: { uid: 101602347, nickname: ' 素茉 ' } } })
    )
  vi.stubGlobal('fetch', fetchProfile)
  const { nicknames, loadNickname } = useGameAlbumNicknames()
  loadNickname('101602347')
  loadNickname('101602347')
  expect(nicknames.get('101602347')).toBeUndefined()
  await vi.waitFor(() => expect(nicknames.get('101602347')).toBe('素茉'))
  loadNickname('101602347')
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
  const { nicknames, loadNickname } = useGameAlbumNicknames()
  loadNickname('1')
  loadNickname('2')
  loadNickname('not-a-uid')
  await vi.waitFor(() => {
    expect(nicknames.get('1')).toBeNull()
    expect(nicknames.get('2')).toBeNull()
    expect(nicknames.get('not-a-uid')).toBeNull()
  })
  expect(fetchProfile).toHaveBeenCalledTimes(2)
})
