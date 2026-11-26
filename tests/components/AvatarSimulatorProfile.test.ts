import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AvatarSimulatorDialog from '../../src/components/AvatarSimulatorDialog.vue'
import { requestBlobDownload } from '../../src/utils/backup/downloadFallback'

vi.mock('../../src/utils/backup/downloadFallback', () => ({ requestBlobDownload: vi.fn() }))
vi.mock('../../src/utils/avatarSimulator', async (original) => ({
  ...(await original<typeof import('../../src/utils/avatarSimulator')>()),
  drawAvatar: vi.fn()
}))
vi.mock('../../src/composables/useAnimatedHeadFrame', () => ({
  useAnimatedHeadFrame: () => ({
    canvas: ref(null),
    failed: ref(false),
    paused: ref(false),
    togglePause: vi.fn()
  })
}))

beforeEach(() => {
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined)
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
})

function create(save = vi.fn()) {
  return mount(AvatarSimulatorDialog, {
    props: {
      photos: [],
      language: 'zh',
      profileEditor: { url: 'https://example.com/avatar.png', save }
    },
    global: { stubs: { Teleport: true, Transition: true } }
  })
}

it('preserves upload and album controls in the normal simulator', async () => {
  const wrapper = mount(AvatarSimulatorDialog, {
    props: { photos: [], language: 'zh' },
    global: { stubs: { Teleport: true, Transition: true } }
  })
  try {
    await flushPromises()
    expect(wrapper.find('.album-toggle').exists()).toBe(true)
    expect(wrapper.find('.upload-photo').exists()).toBe(true)
    expect(wrapper.get('.save-avatar').text()).toBe('保存')
  } finally {
    wrapper.unmount()
  }
})

it('loads the current avatar, hides photo selection, and applies without downloading', async () => {
  const save = vi.fn()
  const wrapper = create(save)
  try {
    await flushPromises()
    expect(wrapper.find('.album-toggle').exists()).toBe(false)
    expect(wrapper.find('.upload-photo').exists()).toBe(false)
    expect(wrapper.find('input[type="file"]').exists()).toBe(false)
    await wrapper.get('.save-avatar').trigger('click')
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ image: 'data:image/png;base64,AAAA' })
    )
    expect(requestBlobDownload).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})

it('keeps the editor open on save failure and allows retry', async () => {
  const save = vi.fn().mockImplementationOnce(() => {
    throw new Error('Full')
  })
  const wrapper = create(save)
  try {
    await flushPromises()
    await wrapper.get('.save-avatar').trigger('click')
    expect(wrapper.text()).toContain('保存失败')
    await wrapper.get('.save-avatar').trigger('click')
    expect(save).toHaveBeenCalledTimes(2)
  } finally {
    wrapper.unmount()
  }
})

it('does not apply changes when cancelled', async () => {
  const save = vi.fn()
  const wrapper = create(save)
  try {
    await flushPromises()
    await wrapper.get('header button').trigger('click')
    expect(save).not.toHaveBeenCalled()
    expect(requestBlobDownload).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})
