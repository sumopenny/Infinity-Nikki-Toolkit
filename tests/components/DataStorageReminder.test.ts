import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import DataStorageReminder from '../../src/components/DataStorageReminder.vue'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

it.each(['zh', 'en'] as const)(
  'requires ten seconds and explicit confirmation (%s)',
  async (language) => {
    vi.useFakeTimers()
    const wrapper = mount(DataStorageReminder, {
      props: { visible: true, dismissed: false, language },
      attachTo: document.body,
      global: { stubs: { Teleport: true, Transition: true } }
    })
    try {
      await flushPromises()
      const button = wrapper.get('button')
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
      await wrapper.get('.dialog-overlay').trigger('click')
      await wrapper.get('section').trigger('keydown', { key: 'Escape' })
      ;(wrapper.vm as any).confirm()
      expect(wrapper.emitted('confirm')).toBeUndefined()
      await wrapper.get('input').setValue(true)
      await vi.advanceTimersByTimeAsync(9999)
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
      await vi.advanceTimersByTimeAsync(1)
      expect((button.element as HTMLButtonElement).disabled).toBe(false)
      await button.trigger('click')
      expect(wrapper.emitted('confirm')).toEqual([[true]])
      await wrapper.setProps({ visible: false })
      await wrapper.setProps({ visible: true, dismissed: true })
      expect(wrapper.get('input').element.checked).toBe(true)
      expect((wrapper.get('button').element as HTMLButtonElement).disabled).toBe(true)
      await vi.advanceTimersByTimeAsync(10000)
      await wrapper.get('input').setValue(false)
      await wrapper.get('button').trigger('click')
      expect(wrapper.emitted('confirm')?.at(-1)).toEqual([false])
    } finally {
      wrapper.unmount()
    }
    expect(vi.getTimerCount()).toBe(0)
  }
)

it('stops the countdown on hide and unmount', async () => {
  vi.useFakeTimers()
  const wrapper = mount(DataStorageReminder, {
    props: { visible: true, dismissed: false, language: 'zh' },
    global: { stubs: { Teleport: true, Transition: true } }
  })
  await wrapper.setProps({ visible: false })
  expect(vi.getTimerCount()).toBe(0)
  await wrapper.setProps({ visible: true })
  expect(vi.getTimerCount()).toBe(1)
  wrapper.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
