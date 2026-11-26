// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { useProfileAvatar } from '../../src/composables/useProfileAvatar'

const avatar = { image: 'data:image/png;base64,AAAA', frameId: 'frame', zoom: 1, x: 0, y: 0 }
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  useProfileAvatar().avatars.clear()
})

it('persists by UID and restores the selection after memory is cleared', () => {
  const state = useProfileAvatar()
  state.save('101', avatar)
  state.avatars.clear()
  state.load('101')
  state.load('202')
  expect(state.avatars.get('101')).toEqual(avatar)
  expect(state.avatars.get('202')).toBeNull()
})

it('keeps the previous avatar when storage fails so the editor can retry', () => {
  const state = useProfileAvatar()
  state.save('101', avatar)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('Quota exceeded')
  })
  const next = { ...avatar, frameId: 'next' }
  expect(() => state.save('101', next)).toThrow('Quota exceeded')
  expect(state.avatars.get('101')).toEqual(avatar)
  state.save('101', next)
  expect(state.avatars.get('101')).toEqual(next)
})

it.each(['{broken', JSON.stringify({ ...avatar, zoom: 99 })])(
  'ignores invalid stored preferences: %s',
  (value) => {
    localStorage.setItem('nikki-profile-avatar:101', value)
    const state = useProfileAvatar()
    state.load('101')
    expect(state.avatars.get('101')).toBeNull()
  }
)
