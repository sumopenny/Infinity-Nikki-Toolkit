import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import AllDataBackup from '../../src/components/AllDataBackup.vue'

const state = vi.hoisted(() => ({ conflict: 'camera' }))
vi.mock('../../src/utils/errorReporting/errorReporter', () => ({ reportError: vi.fn() }))
vi.mock('../../src/utils/backup/backupAvailability', () => ({
  hasAllBackupData: async () => false
}))
vi.mock('../../src/utils/backup/allDataBackup', () => ({
  prepareAllDataBackup: async () => ({}),
  applyAllDataBackup: async (
    _plan: unknown,
    camera: (value: unknown) => Promise<unknown>,
    _start: unknown,
    region: (value: unknown) => Promise<unknown>
  ) => {
    await (state.conflict === 'camera'
      ? camera({ base: [], conflicts: [{ id: 'photo', name: 'Imported' }] })
      : region({ local: 'cn', incoming: 'global' }))
    return null
  }
}))

it.each(['camera', 'wardrobe'])(
  'releases import busy state when cancelling a %s conflict',
  async (conflict) => {
    state.conflict = conflict
    const wrapper = mount(AllDataBackup, { props: { language: 'en', disabled: false } })
    try {
      const input = wrapper.get('input')
      Object.defineProperty(input.element, 'files', { value: [new File(['zip'], 'backup.zip')] })
      await input.trigger('change')
      await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
      expect(wrapper.emitted('busy')?.at(-1)).toEqual([true])
      const cancel = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.trim() === 'Cancel'
      )!
      cancel.click()
      await flushPromises()
      expect(wrapper.emitted('busy')?.at(-1)).toEqual([false])
      expect(wrapper.emitted('changed')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  }
)
