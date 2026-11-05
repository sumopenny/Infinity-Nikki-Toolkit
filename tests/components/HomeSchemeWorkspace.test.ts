vi.mock('../../src/utils/imageSelection', () => ({
  validateSelectedImage: vi.fn().mockResolvedValue(undefined)
}))
import {
  createOperationCoordinator,
  operationCoordinatorKey
} from '../../src/composables/useOperationCoordinator'
import 'fake-indexeddb/auto'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { messages } from '../../src/i18n'
import HomeSchemeWorkspace from '../../src/components/HomeSchemeWorkspace.vue'
import MobileEmptyScreenshot from '../../src/components/MobileEmptyScreenshot.vue'
import SelectionBar from '../../src/components/SelectionBar.vue'
import * as homeStorage from '../../src/utils/homeBuild/homeSchemeStorage'
import { parseHomeScheme } from '../../src/utils/homeBuild/homeSchemeParser'
import { homeSchemeMessages } from '../../src/i18n/messages/homeScheme'
import { DB_NAME } from '../../src/utils/file-system/database'
import { readHomeSchemeSnapshot, saveHomeScheme } from '../../src/utils/homeBuild/homeSchemeStorage'
import { createEmptyHomeSchemeMetadata } from '../helpers/homeSchemeMetadata'

vi.mock('../../src/utils/homeBuild/homeSchemeParser', () => ({ parseHomeScheme: vi.fn() }))
const props = {
  libraryRevision: 0,
  messages: homeSchemeMessages.zh,
  disabled: false,
  confirmAction: async () => true,
  searchQuery: '',
  selectionMessages: messages.zh.selectionBar,
  lightboxMessages: messages.zh.lightbox,
  dateMessages: messages.zh.date,
  thumbnailMode: 'wide' as const
}
it('only shows the screenshot when the whole home library is empty', async () => {
  const wrapper = mount(HomeSchemeWorkspace, { props, attachTo: document.body })
  try {
    await flushPromises()
    expect(wrapper.findComponent(MobileEmptyScreenshot).exists()).toBe(true)
    expect(wrapper.find('.empty-import-button').exists()).toBe(false)
    await saveHomeScheme({
      code: 'HOME',
      name: 'Home',
      schemeType: 'home',
      tags: [],
      note: '',
      metadata: createEmptyHomeSchemeMetadata()
    })
    await wrapper.setProps({ libraryRevision: 1 })
    await vi.waitFor(() => expect(wrapper.findAll('.home-scheme-card')).toHaveLength(1))
    expect(wrapper.findComponent(MobileEmptyScreenshot).exists()).toBe(false)
    await wrapper.setProps({ searchQuery: 'does-not-match' })
    expect(wrapper.find('.home-scheme-empty').exists()).toBe(true)
    expect(wrapper.findComponent(MobileEmptyScreenshot).exists()).toBe(false)
    await wrapper.setProps({ searchQuery: '' })
    wrapper.findComponent({ name: 'CollectionFilterBar' }).vm.$emit('change', 'combo')
    await flushPromises()
    expect(wrapper.find('.home-scheme-empty').exists()).toBe(true)
    expect(wrapper.findComponent(MobileEmptyScreenshot).exists()).toBe(false)
    const snapshot = await readHomeSchemeSnapshot()
    await homeStorage.deleteHomeScheme(snapshot.records[0])
    await wrapper.setProps({ libraryRevision: 2 })
    await vi.waitFor(() => expect(wrapper.findComponent(MobileEmptyScreenshot).exists()).toBe(true))
  } finally {
    wrapper.unmount()
  }
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.clearAllMocks()
  document.body.innerHTML = '<div id="album-sidebar-column"></div>'
})

it('confirms and deletes only visible selected schemes, keeping the confirmed target when filters change', async () => {
  for (const name of ['Alpha', 'Beta']) {
    await saveHomeScheme({
      code: name.toUpperCase(),
      name,
      schemeType: 'home',
      tags: [],
      note: '',
      metadata: createEmptyHomeSchemeMetadata()
    })
  }
  let confirm!: (answer: boolean) => void
  const confirmAction = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        confirm = resolve
      })
  )
  const wrapper = mount(HomeSchemeWorkspace, {
    props: { ...props, confirmAction },
    attachTo: document.body
  })
  try {
    await vi.waitFor(() => expect(wrapper.findAll('.home-scheme-card')).toHaveLength(2))
    for (const card of wrapper.findAll('.home-scheme-card')) await card.trigger('click')
    await wrapper.setProps({ searchQuery: 'Alpha' })
    expect(wrapper.findComponent(SelectionBar).props('selectedCount')).toBe(1)
    wrapper.findComponent(SelectionBar).vm.$emit('delete')
    await flushPromises()
    await vi.waitFor(() =>
      expect(confirmAction).toHaveBeenCalledWith(homeSchemeMessages.zh.deleteSelectedConfirm(1))
    )
    await wrapper.setProps({ searchQuery: 'Beta' })
    confirm(true)
    await vi.waitFor(async () =>
      expect((await readHomeSchemeSnapshot()).records.map((record) => record.name)).toEqual([
        'Beta'
      ])
    )
    expect(wrapper.findComponent(SelectionBar).props('selectedCount')).toBe(1)
  } finally {
    wrapper.unmount()
  }
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
})

it.each([false, true])(
  'keeps the library consistent after cancellation or partial deletion failure (%s)',
  async (partialFailure) => {
    for (const name of ['Alpha', 'Beta']) {
      await saveHomeScheme({
        code: name.toUpperCase(),
        name,
        schemeType: 'home',
        tags: [],
        note: '',
        metadata: createEmptyHomeSchemeMetadata()
      })
    }
    const originalDelete = homeStorage.deleteHomeScheme
    const deletion = vi.spyOn(homeStorage, 'deleteHomeScheme')
    if (partialFailure)
      deletion
        .mockImplementationOnce(originalDelete)
        .mockRejectedValueOnce(new Error('delete failed'))
    const wrapper = mount(HomeSchemeWorkspace, {
      props: { ...props, confirmAction: async () => partialFailure },
      attachTo: document.body
    })
    try {
      await vi.waitFor(() => expect(wrapper.findAll('.home-scheme-card')).toHaveLength(2))
      for (const card of wrapper.findAll('.home-scheme-card')) await card.trigger('click')
      wrapper.findComponent(SelectionBar).vm.$emit('delete')
      await flushPromises()
      const count = partialFailure ? 1 : 2
      await vi.waitFor(() => expect(wrapper.findAll('.home-scheme-card')).toHaveLength(count))
      expect((await readHomeSchemeSnapshot()).records).toHaveLength(count)
      expect(wrapper.findComponent(SelectionBar).props('selectedCount')).toBe(count)
      expect(deletion).toHaveBeenCalledTimes(partialFailure ? 2 : 0)
    } finally {
      wrapper.unmount()
    }
  }
)

it('keeps stale editor input and reloads the latest record when the editor closes', async () => {
  const base = {
    code: 'ALPHA',
    name: 'Alpha',
    schemeType: 'home' as const,
    tags: [],
    note: '',
    metadata: createEmptyHomeSchemeMetadata()
  }
  const saved = await saveHomeScheme(base)
  const wrapper = mount(HomeSchemeWorkspace, { props, attachTo: document.body })
  try {
    await vi.waitFor(() => expect(wrapper.findAll('.home-scheme-card')).toHaveLength(1))
    await wrapper
      .get(`.home-scheme-card button[aria-label="${homeSchemeMessages.zh.edit}"]`)
      .trigger('click')
    const name = document.querySelector<HTMLInputElement>('#home-scheme-name')!
    name.value = '未保存输入'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    await saveHomeScheme({ ...base, item: saved, name: '另一窗口保存' })
    document
      .querySelector<HTMLButtonElement>('.home-scheme-editor .confirm-dialog-button.primary')!
      .click()
    await vi.waitFor(() =>
      expect(wrapper.emitted('status')?.at(-1)).toEqual([
        homeSchemeMessages.zh.recordChanged,
        'warning'
      ])
    )
    expect(name.value).toBe('未保存输入')
    expect((await readHomeSchemeSnapshot()).records[0]?.name).toBe('另一窗口保存')
    document
      .querySelector<HTMLButtonElement>('.home-scheme-editor .confirm-dialog-button.ghost')!
      .click()
    await vi.waitFor(() =>
      expect(wrapper.get('.home-scheme-card').text()).toContain('另一窗口保存')
    )
  } finally {
    wrapper.unmount()
  }
})

it('adds and persists a parsed scheme without any album directory', async () => {
  vi.mocked(parseHomeScheme).mockResolvedValue({
    code: 'CODE1',
    name: '新方案',
    templateType: 0,
    coverImage: null,
    lastModifyTime: 0,
    version: '2.10',
    furnitureCount: 7,
    server: 49
  })
  const coordinator = createOperationCoordinator()
  const parent = defineComponent({
    setup: () => () => h(HomeSchemeWorkspace, { ...props, disabled: coordinator.hasPending.value })
  })
  const wrapper = mount(parent, {
    attachTo: document.body,
    global: { provide: { [operationCoordinatorKey as symbol]: coordinator } }
  })
  try {
    await vi.waitFor(() =>
      expect(
        wrapper
          .findAll('.home-scheme-header-actions button')
          .map((button) => (button.element as HTMLButtonElement).disabled)
      ).toEqual([false, true, false])
    )
    await wrapper.get('.home-scheme-header-actions .primary-button').trigger('click')
    const code = document.querySelector<HTMLInputElement>('#home-scheme-code')!
    code.value = 'CODE1'
    code.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    await vi.advanceTimersByTimeAsync(450)
    expect(vi.mocked(parseHomeScheme)).toHaveBeenCalledWith('CODE1', expect.anything())
    await flushPromises()
    const save = [
      ...document.querySelectorAll<HTMLButtonElement>('.home-scheme-editor button')
    ].find((button) => button.textContent?.trim() === '确定')!
    expect(save).toBeTruthy()
    const originalSave = homeStorage.saveHomeScheme
    let finishSave!: () => void
    const gate = new Promise<void>((resolve) => {
      finishSave = resolve
    })
    vi.spyOn(homeStorage, 'saveHomeScheme').mockImplementationOnce(async (input) => {
      await gate
      return originalSave(input)
    })
    save.click()
    await flushPromises()
    expect(coordinator.hasPending.value).toBe(true)
    const cancel = document.querySelector<HTMLButtonElement>(
      '.home-scheme-editor .confirm-dialog-button.ghost'
    )!
    expect(cancel.disabled).toBe(true)
    cancel.click()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('.home-scheme-editor')).not.toBeNull()
    finishSave()
    await vi.waitFor(() => expect(document.querySelector('.home-scheme-editor')).toBeNull())
    expect((await readHomeSchemeSnapshot()).records[0]).toMatchObject({
      code: 'CODE1',
      name: '新方案'
    })
    expect(wrapper.findComponent(HomeSchemeWorkspace).emitted('countChange')?.at(-1)).toEqual([1])
    expect(
      (wrapper.findAll('.home-scheme-header-actions button')[1].element as HTMLButtonElement)
        .disabled
    ).toBe(false)
  } finally {
    wrapper.unmount()
  }
})

it('reloads global data after migration revision changes and preserves it when thumbnail settings change', async () => {
  const wrapper = mount(HomeSchemeWorkspace, { props, attachTo: document.body })
  try {
    await vi.waitFor(() => expect(wrapper.emitted('countChange')?.at(-1)).toEqual([0]))
    await wrapper.get('.home-scheme-header-actions .primary-button').trigger('click')
    await saveHomeScheme({
      code: 'CODE2',
      name: '迁入方案',
      schemeType: 'combo',
      tags: [],
      note: '',
      metadata: createEmptyHomeSchemeMetadata()
    })
    await wrapper.setProps({ libraryRevision: 1 })
    expect(document.querySelector('.home-scheme-editor')).not.toBeNull()
    expect(wrapper.text()).not.toContain('迁入方案')
    const cancel = [
      ...document.querySelectorAll<HTMLButtonElement>('.home-scheme-editor button')
    ].find((button) => button.textContent?.trim() === '取消')!
    cancel.click()
    await vi.waitFor(() => expect(wrapper.text()).toContain('迁入方案'))
    await wrapper.setProps({ thumbnailMode: 'default' })
    expect(wrapper.text()).toContain('迁入方案')
    expect((await readHomeSchemeSnapshot()).records).toHaveLength(1)
  } finally {
    wrapper.unmount()
  }
})

it('releases the application operation after an unmounted home load settles', async () => {
  let finish!: (value: { schemes: never[]; tags: never[] }) => void
  vi.spyOn(homeStorage, 'readHomeSchemeLibrary').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const coordinator = createOperationCoordinator()
  const wrapper = mount(HomeSchemeWorkspace, {
    props,
    global: { provide: { [operationCoordinatorKey as symbol]: coordinator } }
  })
  expect(coordinator.isBusy.value).toBe(true)
  wrapper.unmount()
  expect(coordinator.isBusy.value).toBe(true)
  finish({ schemes: [], tags: [] })
  await flushPromises()
  expect(coordinator.isBusy.value).toBe(false)
})

it('does not release an in-flight deletion merely because the component unmounts', async () => {
  await saveHomeScheme({
    code: 'KEEP',
    name: 'Keep',
    schemeType: 'home',
    tags: [],
    note: '',
    metadata: createEmptyHomeSchemeMetadata()
  })
  let finish!: () => void
  const deletion = vi.spyOn(homeStorage, 'deleteHomeScheme').mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const coordinator = createOperationCoordinator()
  const wrapper = mount(HomeSchemeWorkspace, {
    props,
    global: { provide: { [operationCoordinatorKey as symbol]: coordinator } }
  })
  await vi.waitFor(() => expect(wrapper.findAll('.home-scheme-card')).toHaveLength(1))
  await wrapper.get('.home-scheme-card').trigger('click')
  wrapper.findComponent(SelectionBar).vm.$emit('delete')
  await vi.waitFor(() => expect(deletion).toHaveBeenCalled())
  wrapper.unmount()
  expect(coordinator.isBusy.value).toBe(true)
  finish()
  await flushPromises()
  expect(coordinator.isBusy.value).toBe(false)
})

it.each([
  ['https://x6cn-home-design-photo.nuanpaper.com/fixture.png', true],
  ['https://x6cn-home-design-photo.nuanpaper.com.example.invalid/fixture.png', false],
  ['https://example.invalid/fixture.png', false]
])('accepts only official home covers while resources are paused: %s', async (url, allowed) => {
  vi.mocked(parseHomeScheme).mockResolvedValue({
    code: 'CODE1',
    name: 'fixture',
    templateType: 0,
    coverImage: String(url),
    lastModifyTime: 0,
    version: '2.10',
    furnitureCount: 7,
    server: 49
  })
  const wrapper = mount(HomeSchemeWorkspace, { props, attachTo: document.body })
  try {
    await vi.waitFor(() => expect(wrapper.emitted('countChange')?.at(-1)).toEqual([0]))
    await wrapper.get('.home-scheme-header-actions .primary-button').trigger('click')
    const code = document.querySelector<HTMLInputElement>('#home-scheme-code')!
    code.value = 'CODE1'
    code.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    await vi.advanceTimersByTimeAsync(450)
    await flushPromises()
    expect(parseHomeScheme).toHaveBeenCalled()
    const image = document.querySelector<HTMLImageElement>('.home-scheme-editor img')
    if (allowed) expect(image?.src).toBe(url)
    else expect(image).toBeNull()
    expect(document.querySelector('.home-scheme-editor')).not.toBeNull()
    expect(wrapper.emitted('status')?.at(-1)?.[1]).toBe('success')
  } finally {
    wrapper.unmount()
  }
})

it('exposes an awaitable reload and reports storage failures to its caller', async () => {
  const wrapper = mount(HomeSchemeWorkspace, { props, attachTo: document.body })
  try {
    await flushPromises()
    const read = vi.spyOn(homeStorage, 'readHomeSchemeLibrary')
    expect(await wrapper.vm.reload()).toBe(true)
    expect(read).toHaveBeenCalledTimes(1)
    read.mockRejectedValueOnce(new Error('read failed'))
    expect(await wrapper.vm.reload()).toBe(false)
    expect(wrapper.emitted('status')?.at(-1)?.[1]).toBe('error')
    read.mockRestore()
  } finally {
    wrapper.unmount()
  }
})
