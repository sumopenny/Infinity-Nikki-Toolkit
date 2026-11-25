// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DataBackup from '../../src/components/DataBackup.vue'
import { directoryBackup } from '../../src/composables/useDirectoryBackup'
import * as backupService from '../../src/composables/useDirectoryBackup'
import * as backupDiff from '../../src/utils/directory-backup/diff'
import * as backupEngine from '../../src/utils/directory-backup/engine'
import * as backupRestore from '../../src/utils/directory-backup/restore'
afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  directoryBackup.initialStatusLoading.value = false
  directoryBackup.config.value = null
  directoryBackup.serviceError.value = ''
  for (const status of Object.values(directoryBackup.statuses))
    Object.assign(status, {
      enabled: false,
      count: 0,
      lastSuccess: null,
      state: 'disabled',
      error: undefined
    })
})
const render = () =>
  mount(DataBackup, {
    props: { language: 'zh' },
    global: {
      stubs: {
        CollectionActions: { template: '<div><slot/><slot name="secondary"/></div>' },
        Teleport: true
      }
    }
  })
it('shows three real module states and prevents running a backup without a folder', () => {
  const wrapper = render()
  expect(wrapper.findAll('[role="switch"]')).toHaveLength(3)
  expect(
    wrapper
      .findAll('[role="switch"]')
      .every((button) => button.attributes('aria-checked') === 'false')
  ).toBe(true)
  const run = wrapper.findAll('button').find((button) => button.text() === '立即备份')!
  expect(run.attributes('disabled')).toBeDefined()
  expect(wrapper.text()).not.toContain('尚未接入')
  wrapper.unmount()
})
it('keeps the last successful count visible after stopping a module', () => {
  Object.assign(directoryBackup.statuses.outfits, {
    state: 'disabled',
    count: 23,
    lastSuccess: '2026-11-25T01:00:00Z'
  })
  const wrapper = render()
  expect(wrapper.find('.backup-module').text()).toContain('已停止更新')
  expect(wrapper.find('.backup-count').text()).toContain('23')
  wrapper.unmount()
})

it('shows a shared failure once beside the directory and preserves each module state', () => {
  const error = '原备份目录已移动或被删除，请重新选择目录。'
  for (const status of Object.values(directoryBackup.statuses))
    Object.assign(status, { state: 'error', error })
  directoryBackup.serviceError.value = error
  const wrapper = render()
  expect(wrapper.find('.backup-directory .backup-directory-error').text()).toBe(error)
  expect(wrapper.text().split(error)).toHaveLength(2)
  expect(wrapper.findAll('.backup-module .backup-error')).toHaveLength(0)
  expect(wrapper.findAll('.backup-state').every((state) => state.text() === '备份失败')).toBe(true)
  wrapper.unmount()
})
it('keeps distinct module errors in their own cards', () => {
  Object.assign(directoryBackup.statuses.outfits, { state: 'error', error: '记录图片缺失' })
  Object.assign(directoryBackup.statuses.home, { state: 'error', error: '家园标签无效' })
  const wrapper = render()
  expect(wrapper.find('.backup-directory-error').exists()).toBe(false)
  expect(wrapper.findAll('.backup-module .backup-error').map((error) => error.text())).toEqual([
    '记录图片缺失',
    '家园标签无效'
  ])
  wrapper.unmount()
})

function enableSwitchInteraction(enabled: boolean) {
  vi.spyOn(directoryBackup.supported, 'value', 'get').mockReturnValue(true)
  vi.spyOn(backupService, 'refreshDirectoryBackup').mockResolvedValue()
  directoryBackup.config.value = {
    key: 'config',
    sourceId: 'source',
    binding: 'binding',
    paused: false,
    enabled: { outfits: enabled, home: false, camera: false },
    initialized: { outfits: true, home: false, camera: false },
    generations: { outfits: 'one', home: 'two', camera: 'three' }
  }
}
it('enables an unchanged backup without a confirmation dialog or success notice', async () => {
  enableSwitchInteraction(false)
  vi.spyOn(backupDiff, 'estimateBackupDiff').mockResolvedValue({
    added: 0,
    updated: 0,
    removed: 0,
    backupCount: 23,
    browserCount: 23,
    revision: 'revision',
    fingerprint: 'fingerprint',
    changes: [],
    binding: 'binding'
  })
  const enable = vi
    .spyOn(backupDiff, 'confirmEnable')
    .mockResolvedValue(directoryBackup.config.value!)
  const show = vi.fn()
  const dispatch = vi.spyOn(window, 'dispatchEvent')
  const wrapper = render()
  for (const dialog of wrapper.findAll('dialog'))
    Object.defineProperty(dialog.element, 'showModal', { value: show })
  await wrapper.find('[role="switch"]').trigger('click')
  await flushPromises()
  expect(enable).toHaveBeenCalledWith(
    'outfits',
    expect.objectContaining({ added: 0, updated: 0, removed: 0 })
  )
  expect(show).not.toHaveBeenCalled()
  expect(
    dispatch.mock.calls.some(
      ([event]) =>
        event.type === 'nuan-backup-notice' &&
        (event as CustomEvent).detail.message &&
        !(event as CustomEvent).detail.loading
    )
  ).toBe(false)
  wrapper.unmount()
})
it('stops a module without a success notice', async () => {
  enableSwitchInteraction(true)
  const stop = vi
    .spyOn(backupEngine, 'setModuleEnabled')
    .mockResolvedValue(directoryBackup.config.value!)
  const dispatch = vi.spyOn(window, 'dispatchEvent')
  const wrapper = render()
  await wrapper.find('[role="switch"]').trigger('click')
  await flushPromises()
  expect(stop).toHaveBeenCalledWith('outfits', false)
  expect(
    dispatch.mock.calls.some(
      ([event]) =>
        event.type === 'nuan-backup-notice' &&
        (event as CustomEvent).detail.message &&
        !(event as CustomEvent).detail.loading
    )
  ).toBe(false)
  wrapper.unmount()
})

function previewFixture() {
  return {
    backupId: 'backup',
    sourceId: 'source',
    rootFingerprint: 'root',
    modules: (['outfits', 'home', 'camera'] as const).map((module) => ({
      module,
      title: module,
      browserCount: 2,
      backupCount: 3,
      lastSuccess: '2026-11-25T01:00:00Z',
      ready: true,
      message: '校验通过',
      fingerprint: module,
      browserFingerprint: module,
      imageBytes: 2048,
      staged: 0,
      canResume: false
    }))
  }
}

it('expands the current directory preview below the directory bar without opening a dialog', async () => {
  enableSwitchInteraction(false)
  const handle = { name: '5756' } as FileSystemDirectoryHandle
  directoryBackup.config.value!.handle = handle
  directoryBackup.config.value!.directoryName = handle.name
  vi.spyOn(backupRestore, 'previewRestore').mockResolvedValue(previewFixture())
  const wrapper = render()
  const trigger = wrapper.findAll('button').find((button) => button.text() === '目录预览')!
  expect(trigger.attributes('aria-expanded')).toBe('false')
  await trigger.trigger('click')
  await flushPromises()
  const preview = wrapper.get('.backup-page .backup-preview')
  expect(preview.get('h2').text()).toBe('目录预览 · 5756')
  expect(preview.findAll('.backup-preview-row')).toHaveLength(3)
  expect(preview.findAll('input[type="checkbox"]')).toHaveLength(3)
  expect(wrapper.findAll('dialog')).toHaveLength(1)
  expect(wrapper.find('.tree-collapse').classes()).toContain('is-open')
  expect(
    wrapper.get('.backup-directory').element.compareDocumentPosition(preview.element) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(
    preview.element.compareDocumentPosition(wrapper.get('.backup-modules').element) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  await preview.get('[aria-label="收起预览"]').trigger('click')
  expect(trigger.attributes('aria-expanded')).toBe('false')
  expect(wrapper.get('.tree-collapse').attributes('aria-hidden')).toBe('true')
  wrapper.unmount()
})

it('shows restoration selection inline and keeps the destructive confirmation in a dialog', async () => {
  enableSwitchInteraction(false)
  vi.spyOn(backupEngine, 'pickDirectory').mockResolvedValue({
    name: '恢复来源'
  } as FileSystemDirectoryHandle)
  vi.spyOn(backupRestore, 'previewRestore').mockResolvedValue(previewFixture())
  const restore = vi.spyOn(backupRestore, 'restoreSelected')
  const wrapper = render()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '从目录恢复')!
    .trigger('click')
  await flushPromises()
  const preview = wrapper.get('.backup-preview')
  expect(preview.findAll('input[type="checkbox"]')).toHaveLength(3)
  const showModal = vi.fn()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: showModal
  })
  await preview
    .findAll('button')
    .find((button) => button.text() === '恢复所选模块')!
    .trigger('click')
  await flushPromises()
  expect(showModal).toHaveBeenCalledOnce()
  expect(restore).not.toHaveBeenCalled()
  wrapper.unmount()
  await flushPromises()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
})
