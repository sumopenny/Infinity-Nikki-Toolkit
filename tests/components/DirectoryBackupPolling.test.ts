import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  directoryBackup,
  useDirectoryBackupLifecycle
} from '../../src/composables/useDirectoryBackup'

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  readModuleStatus: vi.fn(),
  countBrowserRecords: vi.fn()
}))
vi.mock('../../src/utils/directory-backup/engine', () => ({
  defaultStates: () =>
    Object.fromEntries(
      ['outfits', 'home', 'camera'].map((module) => [
        module,
        { enabled: false, state: 'disabled', count: 0, lastSuccess: null }
      ])
    ),
  loadConfig: mocks.loadConfig,
  readModuleStatus: mocks.readModuleStatus,
  countBrowserRecords: mocks.countBrowserRecords,
  pendingEnabledBackups: vi.fn().mockResolvedValue(false),
  supportsBackup: () => true,
  syncModule: vi.fn()
}))

beforeEach(() => {
  vi.useFakeTimers()
  directoryBackup.config.value = null
  directoryBackup.initialStatusLoading.value = true
  directoryBackup.running.value = false
  directoryBackup.scheduled.value = false
  directoryBackup.serviceError.value = ''
  for (const module of ['outfits', 'home', 'camera'] as const)
    Object.assign(directoryBackup.statuses[module], {
      enabled: false,
      state: 'disabled',
      count: 0,
      lastSuccess: null,
      error: undefined
    })
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('detects a silent external clear during an open page and updates backup warning without a write attempt', async () => {
  const config = {
    key: 'config',
    sourceId: 'source',
    binding: 'binding',
    paused: false,
    handle: { name: 'directory' },
    enabled: { outfits: true, home: false, camera: false },
    initialized: { outfits: true, home: false, camera: false },
    generations: { outfits: 'a', home: 'b', camera: 'c' }
  }
  let unexpectedlyEmpty = false
  mocks.loadConfig.mockResolvedValue(config)
  mocks.countBrowserRecords.mockImplementation(async () => (unexpectedlyEmpty ? 0 : 3))
  mocks.readModuleStatus.mockImplementation(async (_config, module) => {
    if (module === 'outfits')
      return {
        enabled: true,
        count: 3,
        lastSuccess: '2026-11-04T01:00:00Z',
        state: unexpectedlyEmpty ? 'protected' : 'synced',
        ...(unexpectedlyEmpty ? { error: '检测到搭配码数据异常归零' } : {})
      }
    return { enabled: false, count: 0, lastSuccess: null, state: 'disabled' }
  })
  const Host = defineComponent({
    setup() {
      useDirectoryBackupLifecycle()
      return () => h('span', { class: 'status' }, directoryBackup.statuses.outfits.state)
    }
  })
  const view = mount(Host)
  try {
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await nextTick()
    expect(view.get('.status').text()).toBe('synced')
    unexpectedlyEmpty = true
    await vi.advanceTimersByTimeAsync(4000)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await nextTick()
    expect(view.get('.status').text()).toBe('protected')
    expect(directoryBackup.statuses.outfits.error).toContain('数据异常归零')
    expect(directoryBackup.scheduled.value).toBe(false)
  } finally {
    view.unmount()
  }
})
