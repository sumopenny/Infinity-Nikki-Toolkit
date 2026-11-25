import { describe, expect, it } from 'vitest'
import {
  getBackupButtonStatus,
  backupButtonStatusMessages,
  type BackupButtonStatusInput,
  type BackupButtonState
} from '../../src/utils/directory-backup/buttonStatus'
import type { ModuleProgress } from '../../src/utils/directory-backup/repository'

function input(): BackupButtonStatusInput & {
  config: NonNullable<BackupButtonStatusInput['config']>
} {
  return {
    config: {
      enabled: { outfits: true, home: false, camera: false },
      initialized: { outfits: true, home: false, camera: false },
      handle: {} as FileSystemDirectoryHandle,
      paused: false
    },
    statuses: {
      outfits: { enabled: true, state: 'synced', count: 2, lastSuccess: '2026-11-04T01:00:00Z' },
      home: { enabled: false, state: 'disabled', count: 0, lastSuccess: null },
      camera: { enabled: false, state: 'disabled', count: 0, lastSuccess: null }
    },
    running: false,
    scheduled: false,
    initialStatusLoading: false,
    supported: true,
    serviceError: ''
  }
}

describe('backup button status', () => {
  it('spins while reading the initial backup configuration, then uses the actual state', () => {
    expect(getBackupButtonStatus({ ...input(), config: null, initialStatusLoading: true })).toEqual(
      {
        state: 'syncing',
        reason: 'checking'
      }
    )
    expect(getBackupButtonStatus({ ...input(), initialStatusLoading: true })).toEqual({
      state: 'syncing',
      reason: 'checking'
    })
    expect(getBackupButtonStatus(input())).toEqual({ state: 'success', reason: 'synced' })
  })

  it('shows a red dot when all modules are disabled, even with old success receipts', () => {
    const value = input()
    value.config.enabled.outfits = false
    expect(getBackupButtonStatus(value)).toEqual({ state: 'pending', reason: 'not-enabled' })
  })

  it('requires a selected directory even if old module status says synced', () => {
    const value = input()
    delete value.config.handle
    expect(getBackupButtonStatus(value)).toEqual({ state: 'pending', reason: 'directory-missing' })
  })

  it('accepts success for enabled modules only', () => {
    expect(getBackupButtonStatus(input())).toEqual({ state: 'success', reason: 'synced' })
  })

  it.each<ModuleProgress['state']>([
    'error',
    'permission',
    'paused',
    'waiting',
    'initializing',
    'syncing'
  ])('ignores the old %s state of a disabled module', (state) => {
    const value = input()
    value.statuses.camera.state = state
    value.statuses.camera.error = 'old error'
    expect(getBackupButtonStatus(value).state).toBe('success')
  })

  it('does not report success if only some enabled modules have finished', () => {
    const value = input()
    value.config.enabled.home = true
    expect(getBackupButtonStatus(value).state).toBe('pending')
  })

  it('accepts a successfully backed-up empty module', () => {
    const value = input()
    value.statuses.outfits.count = 0
    expect(getBackupButtonStatus(value).state).toBe('success')
  })

  it('requires a success receipt for the current state', () => {
    const value = input()
    value.statuses.outfits.lastSuccess = null
    expect(getBackupButtonStatus(value).state).toBe('pending')
  })

  it('does not reuse old success after a directory switch or reinitialization', () => {
    const value = input()
    value.config.initialized.outfits = false
    expect(getBackupButtonStatus(value).state).toBe('pending')
  })

  it('does not claim success while module configuration and status are being refreshed', () => {
    const value = input()
    value.statuses.outfits.enabled = false
    expect(getBackupButtonStatus(value).state).toBe('pending')
  })

  it.each<[ModuleProgress['state'], boolean, BackupButtonState]>([
    ['waiting', false, 'pending'],
    ['waiting', true, 'syncing'],
    ['initializing', false, 'pending'],
    ['initializing', true, 'syncing'],
    ['syncing', true, 'syncing'],
    ['syncing', false, 'pending'],
    ['synced', true, 'syncing'],
    ['not-set', false, 'pending'],
    ['error', false, 'warning'],
    ['permission', false, 'warning'],
    ['paused', false, 'warning']
  ])('maps state %s with running=%s to %s', (state, running, expected) => {
    const value = input()
    value.statuses.outfits.state = state
    value.running = running
    expect(getBackupButtonStatus(value).state).toBe(expected)
  })

  it('shows queued waiting work as spinning and keeps errors higher priority', () => {
    const value = input()
    value.statuses.outfits.state = 'waiting'
    value.scheduled = true
    expect(getBackupButtonStatus(value)).toEqual({ state: 'syncing', reason: 'syncing' })
    value.statuses.outfits.state = 'error'
    expect(getBackupButtonStatus(value)).toEqual({ state: 'warning', reason: 'module-error' })
    value.statuses.outfits.state = 'waiting'
    value.config.paused = true
    expect(getBackupButtonStatus(value)).toEqual({ state: 'warning', reason: 'paused' })
  })

  it('shows preparation as spinning before a module has entered syncing', () => {
    const value = input()
    value.statuses.outfits.state = 'waiting'
    value.running = true
    expect(getBackupButtonStatus(value)).toEqual({ state: 'syncing', reason: 'syncing' })
  })

  it('prioritizes a failed module over another module that is still running', () => {
    const value = input()
    value.config.enabled.home = true
    value.statuses.outfits.state = 'syncing'
    value.statuses.home.state = 'error'
    value.running = true
    expect(getBackupButtonStatus(value)).toEqual({ state: 'warning', reason: 'module-error' })
  })

  it.each([false, true])('shows empty-data protection as a warning with running=%s', (running) => {
    const value = input()
    value.running = running
    value.statuses.outfits.state = 'protected'
    expect(getBackupButtonStatus(value)).toEqual({ state: 'warning', reason: 'module-error' })
    value.config.enabled.outfits = false
    expect(getBackupButtonStatus(value)).toEqual({ state: 'pending', reason: 'not-enabled' })
  })

  it('shows directory and write conflicts as errors without parsing error strings', () => {
    const value = input()
    value.statuses.outfits.state = 'error'
    value.statuses.outfits.error = '目录身份与绑定不符'
    expect(getBackupButtonStatus(value)).toEqual({ state: 'warning', reason: 'module-error' })
  })

  it('shows pause and missing permissions instead of the old successful state', () => {
    const value = input()
    value.config.paused = true
    expect(getBackupButtonStatus(value)).toEqual({ state: 'warning', reason: 'paused' })
    value.statuses.outfits.state = 'permission'
    expect(getBackupButtonStatus(value)).toEqual({ state: 'warning', reason: 'permission' })
  })

  it('shows service errors even when configuration could not load', () => {
    expect(
      getBackupButtonStatus({ ...input(), config: null, serviceError: 'Database unavailable' })
    ).toEqual({ state: 'warning', reason: 'service-error' })
  })

  it('shows unsupported browser status when backup is enabled', () => {
    expect(getBackupButtonStatus({ ...input(), supported: false })).toEqual({
      state: 'warning',
      reason: 'unsupported'
    })
  })

  it('has a nonempty Chinese and English explanation for every reason', () => {
    expect(Object.keys(backupButtonStatusMessages.en).sort()).toEqual(
      Object.keys(backupButtonStatusMessages.zh).sort()
    )
    for (const messages of Object.values(backupButtonStatusMessages))
      for (const message of Object.values(messages)) expect(message.length).toBeGreaterThan(0)
  })
})
