import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import DesktopHome from '../../src/components/DesktopHome.vue'
import type { BackupButtonStatus } from '../../src/utils/directory-backup/buttonStatus'

vi.mock('../../src/composables/useHomeWallpaper', () => ({
  useHomeWallpaper: () => ({ source: null, style: {}, persist: vi.fn(), prepareCustom: vi.fn() })
}))
enableAutoUnmount(afterEach)

function render(backupStatus: BackupButtonStatus) {
  return mount(DesktopHome, {
    props: {
      language: 'zh',
      disabled: false,
      allCount: 0,
      outfitsCount: 100,
      homeSchemesCount: 4,
      favoriteCount: 0,
      backupStatus
    },
    global: { stubs: { HomeWallpaperDialog: true, HomeWaterSurface: true } }
  })
}

describe('home backup reminder', () => {
  it('opens backup settings from the disabled reminder and reacts to status changes', async () => {
    const wrapper = render({ state: 'pending', reason: 'not-enabled' })
    expect(wrapper.get('.home-backup-notice').text()).toContain('当前未开启自动备份')
    await wrapper.get('.home-backup-notice button').trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([['backup']])
    await wrapper.setProps({ backupStatus: { state: 'warning', reason: 'permission' } })
    expect(wrapper.get('.home-backup-notice').classes()).toContain('is-warning')
    expect(wrapper.get('.home-backup-notice').text()).toContain('备份出现异常')
    expect(wrapper.get('.home-backup-notice button').text()).toContain('查看原因')
    await wrapper.setProps({ backupStatus: { state: 'success', reason: 'synced' } })
    expect(wrapper.find('.home-backup-notice').exists()).toBe(false)
  })

  it.each<BackupButtonStatus>([
    { state: 'syncing', reason: 'checking' },
    { state: 'syncing', reason: 'syncing' },
    { state: 'success', reason: 'synced' }
  ])('does not show a warning for $reason', (status) => {
    expect(render(status).find('.home-backup-notice').exists()).toBe(false)
  })

  it('disables navigation during an operation and preserves the card layout in wallpaper preview', async () => {
    const wrapper = render({ state: 'warning', reason: 'module-error' })
    const card = wrapper.get('.home-backup-notice').element
    await wrapper.setProps({ disabled: true })
    await wrapper.get('.home-backup-notice button').trigger('click')
    expect(wrapper.emitted('navigate')).toBeUndefined()
    await wrapper.get('.home-wallpaper-button').trigger('click')
    expect(wrapper.get('.home-backup-notice').element).toBe(card)
    expect(wrapper.get('.home-backup-notice').classes()).toContain('is-hidden')
    expect(wrapper.get('.home-backup-notice').attributes('inert')).toBeDefined()
    expect(wrapper.get('.home-backup-notice').attributes('aria-hidden')).toBe('true')
    await wrapper.get('.home-wallpaper-button').trigger('click')
    expect(wrapper.get('.home-backup-notice').element).toBe(card)
    expect(wrapper.get('.home-backup-notice').classes()).not.toContain('is-hidden')
    expect(wrapper.get('.home-backup-notice').attributes('inert')).toBeUndefined()
    expect(wrapper.get('.home-backup-notice').attributes('aria-hidden')).toBeUndefined()
  })
})
