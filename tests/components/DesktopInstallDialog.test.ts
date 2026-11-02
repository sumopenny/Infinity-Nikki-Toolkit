import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import DesktopInstallDialog from '../../src/components/DesktopInstallDialog.vue'

it('shows manual steps immediately, respects dismissal, and disables reopening after installation', async () => {
  const wrapper = mount(DesktopInstallDialog, {
    props: { language: 'zh' },
    attachTo: document.body
  })
  try {
    const dialog = document.body.querySelector('dialog')!
    const contents = new DOMWrapper(dialog)
    dialog.showModal = () => { dialog.open = true }
    dialog.close = () => { dialog.open = false }
    await wrapper.vm.open()
    expect(contents.get('details[open]').text()).toContain('Windows · 其他浏览器')
    expect(contents.get('.desktop-install-guide').text()).toContain('安卓 · 其他浏览器')
    expect(contents.find('.confirm-dialog-actions .primary').exists()).toBe(false)

    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome: 'dismissed' })
    })
    window.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(false)
    await contents.get('.confirm-dialog-actions .primary').trigger('click')
    await flushPromises()
    expect(prompt).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(false)
    window.dispatchEvent(new Event('appinstalled'))
    expect(wrapper.vm.installed).toBe(true)
    await wrapper.vm.open()
    expect(dialog.open).toBe(false)
  } finally {
    wrapper.unmount()
    vi.restoreAllMocks()
  }
})


