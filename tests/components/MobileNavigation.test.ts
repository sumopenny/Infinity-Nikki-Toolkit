import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import MobileNavigation from '../../src/components/MobileNavigation.vue'
import { messages } from '../../src/i18n'

afterEach(() => vi.useRealTimers())
const props = {
  activeView: 'outfits' as const,
  disabled: false,
  messages: messages.zh.viewNav,
  outfitLabel: '搭配码',
  cameraLabel: '相机参数'
}

it('responds on pointerdown and keeps a quick tap visible for 120ms without delaying navigation', async () => {
  vi.useFakeTimers()
  const wrapper = mount(MobileNavigation, { props })
  const button = wrapper.findAll('button')[1]!
  await button.trigger('pointerdown', { button: 0 })
  expect(button.classes()).toContain('is-pressed')
  await vi.advanceTimersByTimeAsync(20)
  await button.trigger('pointerup')
  await button.trigger('click')
  expect(wrapper.emitted('changeView')).toEqual([['home']])
  await vi.advanceTimersByTimeAsync(99)
  expect(button.classes()).toContain('is-pressed')
  await vi.advanceTimersByTimeAsync(1)
  expect(button.classes()).not.toContain('is-pressed')
  wrapper.unmount()
})

it('holds long presses until release and cancels when a touch leaves or is interrupted', async () => {
  vi.useFakeTimers()
  const wrapper = mount(MobileNavigation, { props })
  const button = wrapper.findAll('button')[0]!
  await button.trigger('pointerdown', { button: 0 })
  await vi.advanceTimersByTimeAsync(300)
  expect(button.classes()).toContain('is-pressed')
  await button.trigger('pointerup')
  expect(button.classes()).not.toContain('is-pressed')
  for (const event of ['pointerleave', 'pointercancel', 'blur']) {
    await button.trigger('pointerdown', { button: 0 })
    await button.trigger(event)
    expect(button.classes()).not.toContain('is-pressed')
  }
  expect(wrapper.emitted('changeView')).toBeUndefined()
  wrapper.unmount()
})

it('replaces the previous feedback timer on rapid taps and cleans up on disable or unmount', async () => {
  vi.useFakeTimers()
  const wrapper = mount(MobileNavigation, { props })
  const buttons = wrapper.findAll('button')
  await buttons[0]!.trigger('click')
  await vi.advanceTimersByTimeAsync(60)
  await buttons[1]!.trigger('click')
  await vi.advanceTimersByTimeAsync(60)
  expect(buttons[0]!.classes()).not.toContain('is-pressed')
  expect(buttons[1]!.classes()).toContain('is-pressed')
  await wrapper.setProps({ disabled: true })
  expect(buttons[1]!.classes()).not.toContain('is-pressed')
  expect(vi.getTimerCount()).toBe(0)
  await wrapper.setProps({ disabled: false })
  await buttons[2]!.trigger('click')
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('follows archive subpages and parent selection and respects disabled navigation', async () => {
  const wrapper = mount(MobileNavigation, {
    props: {
      activeView: 'makeup',
      disabled: false,
      messages: messages.zh.viewNav,
      outfitLabel: '搭配码',
      cameraLabel: '相机参数'
    }
  })
  expect(wrapper.classes()).not.toContain('segmented-control')
  expect(wrapper.get('[aria-current="page"]').text()).toBe('暖暖档案')
  await wrapper.setProps({ activeView: 'wardrobe' })
  expect(wrapper.get('[aria-current="page"]').text()).toBe('暖暖档案')
  await wrapper.findAll('button')[1]!.trigger('click')
  expect(wrapper.emitted('changeView')).toEqual([['home']])
  await wrapper.setProps({ activeView: 'home' })
  expect(wrapper.get('[aria-current="page"]').text()).toBe('家园方案')
  await wrapper.setProps({ activeView: 'outfits' })
  expect(wrapper.get('[aria-current="page"]').text()).toBe('搭配码')
  await wrapper.setProps({ disabled: true })
  await wrapper.findAll('button')[2]!.trigger('click')
  expect(wrapper.emitted('changeView')).toHaveLength(1)
  wrapper.unmount()
})
