import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import AllDataBackup from '../../src/components/AllDataBackup.vue'
import type { ResolveWardrobeRegion } from '../../src/utils/backup/allDataBackup'

const { apply, selected } = vi.hoisted(() => ({ apply: vi.fn(), selected: vi.fn() }))
// The region dialog tests supply a stub file; actual ZIP recognition is tested separately.
vi.mock('../../src/utils/backup/backupDetector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/backup/backupDetector')>()),
  assertBackupKind: vi.fn(async () => undefined)
}))
vi.mock('../../src/utils/backup/backupAvailability', () => ({
  hasAllBackupData: async () => false
}))
vi.mock('../../src/utils/backup/allDataBackup', () => ({
  prepareAllDataBackup: async () => ({}),
  applyAllDataBackup: apply
}))
beforeEach(() => {
  vi.clearAllMocks()
  apply.mockImplementation(async (_plan, _camera, onModule, resolve: ResolveWardrobeRegion) => {
    const value = await resolve({ local: 'cn', incoming: 'global' })
    selected(value)
    if (value === null) return null
    onModule('wardrobe')
    return [{ module: 'wardrobe', saved: 1, skipped: 0, failed: 0 }]
  })
})
async function open(language: 'zh' | 'en' = 'zh') {
  const wrapper = mount(AllDataBackup, {
    props: { language, disabled: false },
    attachTo: document.body
  })
  const input = wrapper.get('input')
  Object.defineProperty(input.element, 'files', { value: [{ name: 'backup.zip' }] })
  await input.trigger('change')
  await flushPromises()
  await vi.waitFor(() => expect(document.querySelector('.wardrobe-restore-region')).not.toBeNull())
  return wrapper
}
it.each(['国服', '国际服'])(
  'requires an explicit %s selection before allowing restore',
  async (name) => {
    const wrapper = await open()
    try {
      const dialog = document.querySelector<HTMLElement>('.wardrobe-restore-region')!
      const confirm = dialog.querySelector<HTMLButtonElement>('.primary-button')!
      expect(confirm.disabled).toBe(true)
      expect(dialog.textContent).toContain('本地：国服')
      expect(dialog.textContent).toContain('备份：国际服')
      expect(selected).not.toHaveBeenCalled()
      const button = [...dialog.querySelectorAll<HTMLButtonElement>('.resonance-choice')].find(
        (b) => b.textContent === name
      )!
      button.click()
      await flushPromises()
      expect(confirm.disabled).toBe(false)
      confirm.click()
      await flushPromises()
      expect(selected).toHaveBeenCalledWith(name === '国服' ? 'cn' : 'global')
      expect(wrapper.emitted('changed')).toHaveLength(1)
      expect(document.querySelector('.wardrobe-restore-region')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  }
)
it('cancels the entire restore on Escape without emitting a data change', async () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const wrapper = await open()
  try {
    const panel = document.querySelector<HTMLElement>('.wardrobe-restore-region-panel')!
    panel.focus()
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    await flushPromises()
    expect(selected).toHaveBeenCalledWith(null)
    expect(document.activeElement).toBe(trigger)
    expect(wrapper.emitted('changed')).toBeUndefined()
    expect(
      wrapper.emitted('status')?.some(([message]) => message === '已取消导入，数据未修改')
    ).toBe(true)
  } finally {
    wrapper.unmount()
    trigger.remove()
  }
})
it('settles a pending English region prompt when unmounted', async () => {
  const wrapper = await open('en')
  expect(document.querySelector('.wardrobe-restore-region')?.textContent).toContain(
    'Choose wardrobe display region'
  )
  wrapper.unmount()
  await flushPromises()
  expect(selected).toHaveBeenCalledWith(null)
  expect(wrapper.emitted('changed')).toBeUndefined()
})
