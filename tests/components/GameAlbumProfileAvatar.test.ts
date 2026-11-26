import { mount, flushPromises } from '@vue/test-utils'
import { shallowRef, nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import GameAlbumProfileCard from '../../src/components/GameAlbumProfileCard.vue'
import { useProfileAvatar } from '../../src/composables/useProfileAvatar'
import { headFrames } from '../../src/utils/animatedHeadFrames'
import { drawAvatar } from '../../src/utils/avatarSimulator'

const playback = vi.hoisted(() => ({ frame: null as any }))
vi.mock('../../src/composables/useAnimatedHeadFrame', () => ({
  useAnimatedHeadFrame: () => ({ canvas: playback.frame })
}))
vi.mock('../../src/utils/avatarSimulator', async (original) => ({
  ...(await original<typeof import('../../src/utils/avatarSimulator')>()),
  drawAvatar: vi.fn()
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  useProfileAvatar().avatars.clear()
  localStorage.clear()
})

it('shows the saved preview until animation is ready and restores it if playback fails', async () => {
  playback.frame = shallowRef(null)
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined)
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn()
  } as any)
  const frameId = Object.keys(headFrames).find((id) => headFrames[id].animation)!
  useProfileAvatar().save('test', {
    frameId,
    image: 'data:image/png;base64,AAAA',
    zoom: 1.5,
    x: 0.1,
    y: 0.2
  })
  const wrapper = mount(GameAlbumProfileCard, {
    props: {
      uid: 'test',
      language: 'zh',
      profile: { avatarUrl: 'https://example.com/avatar.png' } as any
    }
  })
  try {
    await flushPromises()
    expect((wrapper.get('img').element as HTMLImageElement).style.display).toBe('')
    expect((wrapper.get('canvas').element as HTMLCanvasElement).style.display).toBe('none')
    const frame = document.createElement('canvas')
    playback.frame.value = frame
    await nextTick()
    expect((wrapper.get('canvas').element as HTMLCanvasElement).style.display).toBe('')
    expect((wrapper.get('img').element as HTMLImageElement).style.display).toBe('none')
    expect(drawAvatar).toHaveBeenCalledWith(
      wrapper.get('canvas').element,
      expect.any(HTMLImageElement),
      frame,
      1.5,
      0.1,
      0.2,
      true,
      headFrames[frameId].animation?.photoCrop
    )
    playback.frame.value = null
    await nextTick()
    expect((wrapper.get('img').element as HTMLImageElement).style.display).toBe('')
    expect((wrapper.get('canvas').element as HTMLCanvasElement).style.display).toBe('none')
  } finally {
    wrapper.unmount()
  }
})
