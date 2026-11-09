import * as diagnosticReporter from '../../src/utils/errorReporting/errorReporter'
vi.mock('../../src/utils/imageSelection', () => ({
  validateSelectedImage: vi.fn().mockResolvedValue(undefined)
}))
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OutfitEditor from '../../src/components/OutfitEditor.vue'
import { outfitMessages } from '../../src/i18n/messages/outfit'
import { snapshotImageFile } from '../../src/utils/image'

vi.mock('../../src/utils/image', () => ({
  snapshotImageFile: vi.fn()
}))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('blocks saving until copying completes and discards results after close', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  const create = vi.fn(() => 'blob:snapshot')
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
  let finish!: (file: File) => void
  vi.mocked(snapshotImageFile).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const wrapper = mount(OutfitEditor, {
    props: { visible: false, outfit: null, tags: [], busy: false, messages: outfitMessages.zh },
    global: { stubs: { teleport: true } }
  })
  await wrapper.setProps({ visible: true })
  const input = wrapper.get('input[type="file"]')
  const original = new File(['original'], 'photo.jpg', { type: 'image/jpeg' })
  Object.defineProperty(input.element, 'files', { value: [original], configurable: true })
  await input.trigger('change')
  expect(wrapper.get('button.primary').attributes('disabled')).toBeDefined()
  expect(create).not.toHaveBeenCalled()
  const copied = new File(['original'], 'photo.jpg', { type: 'image/jpeg' })
  finish(copied)
  await flushPromises()
  expect(create).toHaveBeenCalledWith(copied)
  await wrapper.get('button.primary').trigger('click')
  expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ imageFile: copied })
  await input.trigger('change')
  await wrapper.setProps({ visible: false })
  finish(copied)
  await flushPromises()
  expect(create).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('uses the original file directly on desktop without snapshot reading', async () => {
  vi.mocked(snapshotImageFile).mockClear()
  const create = vi.fn(() => 'blob:desktop')
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
  const wrapper = mount(OutfitEditor, {
    props: { visible: false, outfit: null, tags: [], busy: false, messages: outfitMessages.zh },
    global: { stubs: { teleport: true } }
  })
  await wrapper.setProps({ visible: true })
  const original = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [original] })
  await input.trigger('change')
  expect(snapshotImageFile).not.toHaveBeenCalled()
  expect(create).toHaveBeenCalledWith(original)
  expect(wrapper.get('button.primary').attributes('disabled')).toBeUndefined()
  await wrapper.get('button.primary').trigger('click')
  expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ imageFile: original })
  wrapper.unmount()
})

it('allows retry after failure and retains the last good image on failed replacement', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:good'), revokeObjectURL: vi.fn() })
  const wrapper = mount(OutfitEditor, {
    props: { visible: false, outfit: null, tags: [], busy: false, messages: outfitMessages.zh },
    global: { stubs: { teleport: true } }
  })
  await wrapper.setProps({ visible: true })
  const file = new File(['image'], 'same.jpg', { type: 'image/jpeg' })
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file] })
  vi.mocked(snapshotImageFile).mockRejectedValueOnce(new Error('read failed'))
  await input.trigger('change')
  await flushPromises()
  expect(wrapper.get('button.primary').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[role="status"]').text()).toContain(outfitMessages.zh.imageLoadFailed)
  vi.mocked(snapshotImageFile).mockResolvedValueOnce(file)
  await input.trigger('change')
  await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('blob:good')
  vi.mocked(snapshotImageFile).mockRejectedValueOnce(new Error('replacement failed'))
  await input.trigger('change')
  await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('blob:good')
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  expect(wrapper.get('button.primary').attributes('disabled')).toBeUndefined()
  await wrapper.get('button.primary').trigger('click')
  expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ imageFile: file })
  wrapper.unmount()
})

it('ignores an older read that fails after a newer selection succeeds', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  const create = vi.fn(() => 'blob:new')
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
  let failOld!: (reason: Error) => void
  vi.mocked(snapshotImageFile).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        failOld = reject
      })
  )
  const newer = new File(['new'], 'new.jpg', { type: 'image/jpeg' })
  vi.mocked(snapshotImageFile).mockResolvedValueOnce(newer)
  const wrapper = mount(OutfitEditor, {
    props: { visible: false, outfit: null, tags: [], busy: false, messages: outfitMessages.zh },
    global: { stubs: { teleport: true } }
  })
  await wrapper.setProps({ visible: true })
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [newer], configurable: true })
  await input.trigger('change')
  await input.trigger('change')
  await flushPromises()
  failOld(new Error('old failure'))
  await flushPromises()
  expect(create).toHaveBeenCalledTimes(1)
  expect(wrapper.find('[role="status"]').exists()).toBe(false)
  expect(wrapper.get('button.primary').attributes('disabled')).toBeUndefined()
  wrapper.unmount()
})

it('accepts additional formats, retains a good preview after failure, and allows retry', async () => {
  const { validateSelectedImage } = await import('../../src/utils/imageSelection')
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((file: File) => 'blob:' + file.name),
    revokeObjectURL: vi.fn()
  })
  const wrapper = mount(OutfitEditor, {
    props: { visible: false, outfit: null, tags: [], busy: false, messages: outfitMessages.zh },
    global: { stubs: { teleport: true } }
  })
  await wrapper.setProps({ visible: true })
  const input = wrapper.get('input[type="file"]')
  expect(input.attributes('accept')).toBe('image/*')
  const good = new File(['image'], 'good.gif', { type: '' })
  Object.defineProperty(input.element, 'files', { value: [good], configurable: true })
  await input.trigger('change')
  await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('blob:good.gif')
  vi.mocked(validateSelectedImage).mockRejectedValueOnce(new Error('unsupported HEIC'))
  Object.defineProperty(input.element, 'files', {
    value: [new File(['image'], 'bad.heic')],
    configurable: true
  })
  await input.trigger('change')
  await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('blob:good.gif')
  expect(wrapper.get('.outfit-editor-error').text()).toContain(outfitMessages.zh.imageLoadFailed)
  await input.trigger('change')
  await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('blob:bad.heic')
  wrapper.unmount()
})

it('accepts picker results during unrelated background work but blocks selection while saving', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  const create = vi.fn(() => 'blob:accepted')
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() })
  const file = new File(['image'], 'phone.png', { type: 'image/png' })
  vi.mocked(snapshotImageFile).mockResolvedValue(file)
  const wrapper = mount(OutfitEditor, {
    props: {
      visible: false,
      outfit: null,
      tags: [],
      busy: false,
      selectionBusy: false,
      messages: outfitMessages.zh
    },
    global: { stubs: { teleport: true } }
  })
  await wrapper.setProps({ visible: true })
  // 模拟打开相册后，页面 focus 先触发后台任务，再收到文件 change。
  await wrapper.setProps({ busy: true })
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file] })
  await input.trigger('change')
  await flushPromises()
  expect(create).toHaveBeenCalledWith(file)
  expect(wrapper.get('.outfit-image-dropzone').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('button.primary').attributes('disabled')).toBeDefined()
  await wrapper.get('button.primary').trigger('click')
  expect(wrapper.emitted('save')).toBeUndefined()
  await wrapper.setProps({ busy: false })
  await wrapper.get('button.primary').trigger('click')
  expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ imageFile: file })
  await wrapper.setProps({ busy: true, selectionBusy: true })
  create.mockClear()
  await input.trigger('change')
  await flushPromises()
  expect(create).not.toHaveBeenCalled()
  expect(wrapper.get('.outfit-image-dropzone').attributes('disabled')).toBeDefined()
  wrapper.unmount()
})

it('reports a displayed outfit preview failure without changing the draft', async () => {
  const capture = vi.spyOn(diagnosticReporter, 'reportError').mockReturnValue('test-event')
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fixture'), revokeObjectURL: vi.fn() })
  const wrapper = mount(OutfitEditor, {
    props: { visible: false, outfit: null, tags: [], busy: false, messages: outfitMessages.zh },
    global: { stubs: { teleport: true } }
  })
  try {
    await wrapper.setProps({ visible: true })
    const file = new File(['fixture'], 'private-fixture.png', { type: 'image/png' })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()
    await wrapper.get('img').trigger('error')
    expect(capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        module: 'outfits',
        code: 'IMAGE_PREVIEW_FAILED',
        stage: 'preview-element'
      })
    )
    expect(wrapper.get('img').attributes('src')).toBe('blob:fixture')
    expect(wrapper.emitted('save')).toBeUndefined()
  } finally {
    wrapper.unmount()
    capture.mockRestore()
  }
})

it('extracts pasted source text, blocks multiple links and recovers after clearing', async () => {
  const wrapper = mount(OutfitEditor, {
    props: { visible: false, outfit: null, tags: [], busy: false, messages: outfitMessages.zh },
    global: { stubs: { teleport: true } }
  })
  await wrapper.setProps({ visible: true })
  await wrapper.get('#outfit-code').setValue('SOURCE')
  const field = wrapper.get('#outfit-source-url')
  const url = 'https://example.com/a?x=%2f&x=2#part'
  await field.trigger('paste', { clipboardData: { getData: () => `原帖 ${url} 快来看看` } })
  expect((field.element as HTMLInputElement).value).toBe(url)
  await field.trigger('paste', { clipboardData: { getData: () => `${url} https://example.org` } })
  await wrapper.get('button.primary').trigger('click')
  expect(wrapper.emitted('save')).toBeUndefined()
  expect(wrapper.text()).toContain(outfitMessages.zh.sourceMultiple)
  await field.setValue('')
  await wrapper.get('button.primary').trigger('click')
  expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ sourceUrl: '' })
  wrapper.unmount()
})
