import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AutoBackupMenu from '../../src/components/AutoBackupMenu.vue'
import { directoryBackup, refreshDirectoryBackup } from '../../src/composables/useDirectoryBackup'
import { defaultStates, type BackupConfig } from '../../src/utils/directory-backup/repository'

vi.mock('../../src/composables/useDirectoryBackup', async () => {
  const { computed, reactive, shallowRef } = await import('vue')
  const { defaultStates } = await import('../../src/utils/directory-backup/repository')
  const config = shallowRef<BackupConfig | null>(null)
  return {
    directoryBackup: {
      config,
      statuses: reactive(defaultStates()),
      running: shallowRef(false),
      scheduled: shallowRef(false),
      initialStatusLoading: shallowRef(false),
      supported: computed(() => true),
      hasEnabled: computed(() =>
        Boolean(config.value && Object.values(config.value.enabled).some(Boolean))
      ),
      serviceError: shallowRef('')
    },
    refreshDirectoryBackup: vi.fn().mockResolvedValue(undefined),
    runDirectoryBackup: vi.fn().mockResolvedValue(undefined),
    scheduleDirectoryBackup: vi.fn()
  }
})

let wrapper: VueWrapper | undefined
function mountMenu() {
  wrapper = mount(AutoBackupMenu, {
    props: { open: false, language: 'zh' },
    global: { stubs: { Teleport: true } }
  })
  return wrapper
}
function enableOutfits() {
  directoryBackup.config.value = {
    key: 'config',
    sourceId: 'test',
    binding: 'test',
    paused: false,
    handle: {} as FileSystemDirectoryHandle,
    enabled: { outfits: true, home: false, camera: false },
    initialized: { outfits: true, home: false, camera: false },
    generations: { outfits: 'test', home: 'test', camera: 'test' }
  }
  Object.assign(directoryBackup.statuses.outfits, {
    enabled: true,
    state: 'synced',
    lastSuccess: '2026-11-04T01:00:00Z',
    count: 3
  })
}

beforeEach(() => {
  directoryBackup.config.value = null
  directoryBackup.running.value = false
  directoryBackup.scheduled.value = false
  directoryBackup.initialStatusLoading.value = false
  directoryBackup.serviceError.value = ''
  Object.assign(directoryBackup.statuses, defaultStates())
  vi.clearAllMocks()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('automatic backup button status badge', () => {
  it('renders the loading spinner while initial status is unknown, then the unconfigured dot', async () => {
    directoryBackup.initialStatusLoading.value = true
    const view = mountMenu()
    const button = view.get('.auto-backup-button')
    expect(button.text()).toBe('自动备份')
    expect(button.find('.lucide-database-backup').exists()).toBe(true)
    expect(button.find('.header-menu-chevron').exists()).toBe(true)
    expect(button.get('.auto-backup-status').attributes('data-state')).toBe('syncing')
    expect(button.get('.auto-backup-status').attributes('aria-hidden')).toBe('true')
    expect(button.attributes('title')).toBe('正在读取备份状态…')
    expect(button.attributes('aria-label')).toContain('正在读取备份状态…')
    expect(button.attributes('aria-expanded')).toBe('false')
    directoryBackup.initialStatusLoading.value = false
    await nextTick()
    expect(button.get('.auto-backup-status').attributes('data-state')).toBe('pending')
  })

  it('updates from startup checking to synced, preparation spinner, and pending without opening the menu', async () => {
    enableOutfits()
    directoryBackup.initialStatusLoading.value = true
    const view = mountMenu()
    const state = () => view.get('.auto-backup-status').attributes('data-state')
    expect(state()).toBe('syncing')
    directoryBackup.initialStatusLoading.value = false
    await nextTick()
    expect(state()).toBe('success')
    expect(view.find('.lucide-circle-check').exists()).toBe(true)
    directoryBackup.statuses.outfits.state = 'waiting'
    await nextTick()
    expect(state()).toBe('pending')
    directoryBackup.scheduled.value = true
    await nextTick()
    expect(state()).toBe('syncing')
    directoryBackup.scheduled.value = false
    directoryBackup.running.value = true
    await nextTick()
    expect(state()).toBe('syncing')
    directoryBackup.statuses.outfits.state = 'syncing'
    await nextTick()
    expect(state()).toBe('syncing')
    expect(view.find('.auto-backup-status .auto-backup-spinning').exists()).toBe(true)
    directoryBackup.statuses.outfits.state = 'synced'
    directoryBackup.running.value = false
    await nextTick()
    expect(state()).toBe('success')
    directoryBackup.statuses.outfits.state = 'waiting'
    await nextTick()
    expect(state()).toBe('pending')
    expect(view.find('.auto-backup-panel').exists()).toBe(false)
    expect(refreshDirectoryBackup).not.toHaveBeenCalled()
  })

  it('prioritizes errors and permissions over the spinner and ignores disabled modules', async () => {
    enableOutfits()
    const view = mountMenu()
    directoryBackup.statuses.home.state = 'error'
    await nextTick()
    expect(view.get('.auto-backup-status').attributes('data-state')).toBe('success')
    directoryBackup.statuses.outfits.state = 'permission'
    directoryBackup.running.value = true
    await nextTick()
    expect(view.get('.auto-backup-status').attributes('data-state')).toBe('warning')
    expect(view.find('.lucide-circle-alert').exists()).toBe(true)
    expect(view.get('.auto-backup-button').attributes('title')).toBe('备份目录需要重新授权')
  })

  it('shows pause and service failures instead of an old check mark', async () => {
    enableOutfits()
    const view = mountMenu()
    directoryBackup.config.value = { ...directoryBackup.config.value!, paused: true }
    await nextTick()
    expect(view.get('.auto-backup-status').attributes('data-state')).toBe('warning')
    expect(view.get('.auto-backup-button').attributes('title')).toContain('已暂停')
    directoryBackup.serviceError.value = 'Database unavailable'
    await nextTick()
    expect(view.get('.auto-backup-button').attributes('title')).toContain('服务异常')
  })

  it('updates the accessible label and tooltip when the language changes', async () => {
    enableOutfits()
    const view = mountMenu()
    await view.setProps({ language: 'en' })
    const button = view.get('.auto-backup-button')
    expect(button.text()).toBe('Auto backup')
    expect(button.attributes('title')).toBe('Backup is healthy: all enabled modules are synced')
    expect(button.attributes('aria-label')).toContain('all enabled modules are synced')
  })

  it('retains click-only opening, explicit close, and a noninteractive badge', async () => {
    const view = mountMenu()
    const button = view.get('.auto-backup-button')
    await button.trigger('pointerenter', { pointerType: 'mouse' })
    await button.trigger('pointerleave', { pointerType: 'mouse' })
    expect(view.emitted('trigger-click')).toBeUndefined()
    expect(view.emitted('update:open')).toBeUndefined()
    expect(view.get('.auto-backup-status').attributes('tabindex')).toBeUndefined()
    await button.trigger('click')
    expect(view.emitted('trigger-click')).toHaveLength(1)
    await view.setProps({ open: true })
    await flushPromises()
    expect(button.attributes('aria-expanded')).toBe('true')
    await view.get('.auto-backup-panel').trigger('pointerleave', { pointerType: 'mouse' })
    expect(view.emitted('update:open')).toBeUndefined()
    await view.get('.auto-backup-close').trigger('click')
    expect(view.emitted('update:open')).toEqual([[false]])
  })
})
