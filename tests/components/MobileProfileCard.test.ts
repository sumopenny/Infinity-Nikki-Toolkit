import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import MobileProfileCard from '../../src/components/MobileProfileCard.vue'

const key = 'nikki-manual-profile-uid'
const profile = {
  nickname: '测试角色',
  avatarUrl: null,
  level: 99,
  createdAt: null,
  updatedAt: null
}
const mounted: ReturnType<typeof mount>[] = []
function create(loadProfile = vi.fn().mockResolvedValue(profile)) {
  const wrapper = mount(MobileProfileCard, {
    props: { language: 'zh', loadProfile },
    global: {
      stubs: {
        GameAlbumProfileCard: {
          props: ['uid'],
          emits: ['editUid'],
          template:
            '<div><button class="edit" @click="$emit(\'editUid\')">{{ uid }}</button><slot name="uid" /></div>'
        }
      }
    }
  })
  mounted.push(wrapper)
  return wrapper
}
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  localStorage.clear()
  vi.restoreAllMocks()
})

it('validates before requesting and only saves a trimmed UID after successful lookup', async () => {
  const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(profile)
  const wrapper = create(load)
  await wrapper.get('input').setValue('invalid')
  await wrapper.get('form').trigger('submit')
  expect(load).not.toHaveBeenCalled()
  await wrapper.get('input').setValue(' 123 ')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(localStorage.getItem(key)).toBeNull()
  expect(wrapper.get('[role="alert"]').text()).toContain('暂未获取')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(load).toHaveBeenLastCalledWith('123')
  expect(localStorage.getItem(key)).toBe('123')
  expect(wrapper.find('form').exists()).toBe(false)
})

it('restores the saved UID and ignores an outstanding replacement after cancellation', async () => {
  localStorage.setItem(key, '123')
  let resolve!: (value: typeof profile) => void
  const load = vi
    .fn()
    .mockResolvedValueOnce(profile)
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        })
    )
  const wrapper = create(load)
  await flushPromises()
  expect(load).toHaveBeenCalledWith('123')
  await wrapper.get('.edit').trigger('click')
  await wrapper.get('input').setValue('456')
  await wrapper.get('form').trigger('submit')
  await wrapper.get('button[type="button"]').trigger('click')
  resolve(profile)
  await flushPromises()
  expect(localStorage.getItem(key)).toBe('123')
  expect(wrapper.get('.edit').text()).toBe('123')
})

it('does not replace the UID when local storage cannot be written', async () => {
  const wrapper = create()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  await wrapper.get('input').setValue('123')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('无法保存')
  expect(wrapper.find('.edit').exists()).toBe(false)
})
