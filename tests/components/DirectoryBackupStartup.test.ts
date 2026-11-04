import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  directoryBackup,
  useDirectoryBackupLifecycle
} from '../../src/composables/useDirectoryBackup'

const mocks = vi.hoisted(() => ({
  syncModule: vi.fn(),
  loadConfig: vi.fn(),
  readModuleStatus: vi.fn()
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
  syncModule: mocks.syncModule,
  pendingEnabledBackups: vi.fn().mockResolvedValue(false),
  supportsBackup: () => true
}))

beforeEach(() => {
  directoryBackup.config.value = null
  directoryBackup.running.value = false
  directoryBackup.scheduled.value = false
  directoryBackup.initialStatusLoading.value = true
  directoryBackup.serviceError.value = ''
  for (const module of ['outfits', 'home', 'camera'] as const)
    Object.assign(directoryBackup.statuses[module], {
      enabled: false,
      count: 0,
      lastSuccess: null,
      state: 'disabled'
    })
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('loads an already synced backup without briefly scheduling an empty backup or marking it waiting', async () => {
  vi.useFakeTimers()
  const lastSuccess = '2026-11-04T01:00:00Z'
  mocks.loadConfig.mockResolvedValue({
    key: 'config',
    sourceId: 'test',
    binding: 'test',
    paused: false,
    handle: { name: 'test-folder' },
    enabled: { outfits: true, home: false, camera: false },
    initialized: { outfits: true, home: false, camera: false },
    generations: { outfits: 'a', home: 'b', camera: 'c' }
  })
  mocks.readModuleStatus.mockImplementation(async (_config, module) =>
    module === 'outfits'
      ? { enabled: true, state: 'synced', count: 2, lastSuccess }
      : { enabled: false, state: 'disabled', count: 0, lastSuccess: null }
  )
  const Host = defineComponent({
    setup() {
      useDirectoryBackupLifecycle()
      return () => h('div')
    }
  })
  const wrapper = mount(Host)
  try {
    expect(directoryBackup.initialStatusLoading.value).toBe(true)
    for (let i = 0; i < 6; i++) await Promise.resolve()
    await nextTick()
    expect(directoryBackup.initialStatusLoading.value).toBe(false)
    expect(directoryBackup.statuses.outfits.state).toBe('synced')
    expect(directoryBackup.scheduled.value).toBe(false)
    window.dispatchEvent(new Event('nuan-backup-change'))
    for (let i = 0; i < 6; i++) await Promise.resolve()
    await nextTick()
    expect(directoryBackup.statuses.outfits.state).toBe('synced')
    expect(directoryBackup.scheduled.value).toBe(false)
    await vi.advanceTimersByTimeAsync(2500)
    expect(directoryBackup.statuses.outfits.state).toBe('synced')
    expect(directoryBackup.running.value).toBe(false)
    expect(mocks.syncModule).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})

it('spins through startup checking and queued sync without showing a red dot', async () => {
  vi.useFakeTimers()
  const { getBackupButtonStatus } = await import('../../src/utils/directory-backup/buttonStatus')
  mocks.loadConfig.mockResolvedValue({
    key: 'config',
    sourceId: 'test',
    binding: 'test',
    paused: false,
    handle: { name: 'test-folder' },
    enabled: { outfits: true, home: false, camera: false },
    initialized: { outfits: true, home: false, camera: false },
    generations: { outfits: 'a', home: 'b', camera: 'c' }
  })
  mocks.readModuleStatus.mockImplementation(async (_config, module) =>
    module === 'outfits'
      ? { enabled: true, state: 'waiting', count: 2, lastSuccess: '2026-11-04T01:00:00Z' }
      : { enabled: false, state: 'disabled', count: 0, lastSuccess: null }
  )
  const Host = defineComponent({
    setup() {
      useDirectoryBackupLifecycle()
      return () =>
        h(
          'span',
          { class: 'badge-state' },
          getBackupButtonStatus({
            config: directoryBackup.config.value,
            statuses: directoryBackup.statuses,
            running: directoryBackup.running.value,
            scheduled: directoryBackup.scheduled.value,
            initialStatusLoading: directoryBackup.initialStatusLoading.value,
            supported: true,
            serviceError: directoryBackup.serviceError.value
          }).state
        )
    }
  })
  const wrapper = mount(Host)
  try {
    expect(wrapper.get('.badge-state').text()).toBe('syncing')
    for (let i = 0; i < 8; i++) await Promise.resolve()
    await nextTick()
    expect(directoryBackup.initialStatusLoading.value).toBe(false)
    expect(directoryBackup.statuses.outfits.state).toBe('waiting')
    expect(directoryBackup.scheduled.value).toBe(true)
    expect(wrapper.get('.badge-state').text()).toBe('syncing')
    await vi.advanceTimersByTimeAsync(1500)
    expect(wrapper.get('.badge-state').text()).toBe('syncing')
    expect(mocks.syncModule).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})

it('keeps the spinner through final status readback until the success receipt is reflected', async () => {
  const { runDirectoryBackup } = await import('../../src/composables/useDirectoryBackup')
  const { getBackupButtonStatus } = await import('../../src/utils/directory-backup/buttonStatus')
  const config = {
    key: 'config' as const,
    sourceId: 'test',
    binding: 'test',
    paused: false,
    handle: { name: 'test-folder' } as FileSystemDirectoryHandle,
    enabled: { outfits: true, home: false, camera: false },
    initialized: { outfits: true, home: false, camera: false },
    generations: { outfits: 'a', home: 'b', camera: 'c' }
  }
  mocks.loadConfig.mockResolvedValue(config)
  directoryBackup.config.value = config
  directoryBackup.initialStatusLoading.value = false
  Object.assign(directoryBackup.statuses.outfits, { enabled: true, state: 'waiting' })
  let finalRead = false
  let releaseRead: (() => void) | undefined
  mocks.syncModule.mockImplementation(async (_config, module, progress) => {
    if (module === 'outfits') {
      progress.state = 'waiting'
      finalRead = true
    }
  })
  mocks.readModuleStatus.mockImplementation(async (_config, module) => {
    if (module === 'outfits') {
      if (finalRead)
        await new Promise<void>((resolve) => {
          releaseRead = resolve
        })
      return { enabled: true, state: 'synced', count: 2, lastSuccess: '2026-11-04T01:00:00Z' }
    }
    return { enabled: false, state: 'disabled', count: 0, lastSuccess: null }
  })
  const badge = () =>
    getBackupButtonStatus({
      config: directoryBackup.config.value,
      statuses: directoryBackup.statuses,
      running: directoryBackup.running.value,
      scheduled: directoryBackup.scheduled.value,
      initialStatusLoading: directoryBackup.initialStatusLoading.value,
      supported: true,
      serviceError: directoryBackup.serviceError.value
    }).state
  const operation = runDirectoryBackup(false)
  for (let i = 0; i < 8; i++) await Promise.resolve()
  expect(finalRead).toBe(true)
  expect(directoryBackup.running.value).toBe(true)
  expect(badge()).toBe('syncing')
  expect(releaseRead).toBeTypeOf('function')
  releaseRead?.()
  await operation
  expect(directoryBackup.running.value).toBe(false)
  expect(badge()).toBe('success')
})
