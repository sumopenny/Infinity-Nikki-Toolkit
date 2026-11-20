import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import UpdateLogDialog from '../../src/components/UpdateLogDialog.vue'
import { updateLogZh } from '../../src/i18n/messages/updateLog'

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('focuses the panel, traps Tab, and returns the dismissal choice and opener focus', async () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const wrapper = mount(UpdateLogDialog, {
    attachTo: document.body,
    props: { visible: true, dismissed: true, messages: updateLogZh }
  })
  await flushPromises()
  const panel = document.querySelector<HTMLElement>('.update-log-panel')!
  const first = panel.querySelector<HTMLButtonElement>('button')!
  const last = panel.querySelector<HTMLButtonElement>('footer button')!
  for (const control of panel.querySelectorAll<HTMLElement>('button, input, a'))
    vi.spyOn(control, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  expect(document.activeElement).toBe(panel)
  panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(first)
  first.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
  )
  expect(document.activeElement).toBe(last)
  last.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  )
  expect(wrapper.emitted('close')).toEqual([[true]])
  await wrapper.setProps({ visible: false })
  expect(document.activeElement).toBe(opener)
})

it('preserves the leave event and does not take focus from the next dialog', async () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const wrapper = mount(UpdateLogDialog, {
    attachTo: document.body,
    props: { visible: true, dismissed: false, messages: updateLogZh },
    global: { stubs: { transition: false } }
  })
  await flushPromises()
  document.querySelector<HTMLButtonElement>('.update-log-help-button')!.click()
  expect(wrapper.emitted('openHelp')).toHaveLength(1)
  const nextDialogButton = document.createElement('button')
  document.body.append(nextDialogButton)
  nextDialogButton.focus()
  await wrapper.setProps({ visible: false })
  await vi.waitFor(() => expect(wrapper.emitted('afterClose')).toHaveLength(1))
  expect(document.activeElement).toBe(nextDialogButton)
})
