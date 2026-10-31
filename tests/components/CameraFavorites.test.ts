import * as diagnosticReporter from '../../src/utils/errorReporting/errorReporter'
vi.mock('../../src/utils/imageSelection', () => ({
  validateSelectedImage: vi.fn().mockResolvedValue(undefined)
}))
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import CameraFavorites from '../../src/components/CameraFavorites.vue'
import MobileEmptyScreenshot from '../../src/components/MobileEmptyScreenshot.vue'
import { zh } from '../../src/i18n'
import type { CameraFavorite } from '../../src/utils/photo-params/favorites'
import type { PhotoParamsResult } from '../../src/utils/photo-params/types'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  readCover: vi.fn(),
  saveTags: vi.fn(),
  save: vi.fn(),
  copy: vi.fn(),
  cover: vi.fn(),
  parse: vi.fn(),
  snapshot: vi.fn(),
  webp: vi.fn()
}))
vi.mock('../../src/utils/photo-params/favorites', async (original) => ({
  ...(await original<object>()),
  readCameraFavorites: mocks.read,
  readCameraFavoriteCover: mocks.readCover,
  saveCameraFavoriteTags: mocks.saveTags,
  saveCameraFavorite: mocks.save,
  coverMetadata: mocks.cover
}))
vi.mock('../../src/utils/image', () => ({
  convertImageToWebp: mocks.webp,
  snapshotImageFile: mocks.snapshot
}))
vi.mock('../../src/utils/storedImage', () => ({ convertImageForStorage: mocks.webp }))
vi.mock('../../src/utils/clipboard', () => ({ copyTextToClipboard: mocks.copy }))
vi.mock('../../src/composables/usePhotoParams', () => ({
  usePhotoParams: () => {
    const result = ref<PhotoParamsResult | null>(null),
      error = ref<string | null>(null)
    return {
      result,
      error,
      close: vi.fn(),
      parseRawCameraParams: async (raw: string) => {
        const parsed = await mocks.parse(raw)
        result.value = parsed
        error.value = parsed ? null : '无效参数码'
      }
    }
  }
}))
const result: PhotoParamsResult = {
  rawCameraParams: 'ABC',
  environmentFields: [{ label: '天气', value: '晴天' }],
  cameraFields: [],
  imageFields: [],
  resourceGroups: [
    { kind: 'pose', id: '12', title: '动作', name: '回眸' },
    { kind: 'light', title: '灯光', name: '--' },
    { kind: 'filter', id: '34', title: '滤镜', name: '暖光' }
  ]
}
const item: CameraFavorite = {
  id: 'one',
  version: 1,
  name: '暖光人像',
  code: 'ABC',
  tag: '人像',
  result,
  source: 'tool',
  cover: null,
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z'
}
let wrapper: ReturnType<typeof mount> | null = null
function create(stubLightbox = false) {
  wrapper = mount(CameraFavorites, {
    props: {
      active: true,
      language: 'zh',
      messages: zh.photoParams,
      searchQuery: '',
      confirmAction: vi.fn().mockResolvedValue(true)
    },
    global: { stubs: stubLightbox ? { Lightbox: true } : {} },
    attachTo: document.body
  })
  return wrapper
}
function button(label: string) {
  return [...document.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') || b.textContent?.trim()) === label
  )!
}
beforeEach(() => {
  // 模拟局域网 HTTP：提供安全随机数，但没有 randomUUID。
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.clearAllMocks()
  mocks.readCover.mockImplementation(async (id: string) => (await mocks.read()).covers.get(id))
  mocks.parse.mockReset()
  mocks.webp.mockReset().mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }))
  mocks.read.mockResolvedValue({ records: [], covers: new Map() })
  mocks.copy.mockResolvedValue(true)
  mocks.save.mockResolvedValue(undefined)
  mocks.saveTags.mockImplementation(async (tags: string[]) => {
    const current = await mocks.read()
    mocks.read.mockResolvedValue({ ...current, tags })
    return tags
  })
  mocks.parse.mockResolvedValue(result)
  mocks.cover.mockImplementation(async (blob: Blob, name: string) => ({
    name,
    type: blob.type,
    size: blob.size,
    sha256: 'a'.repeat(64)
  }))
  vi.stubGlobal('BroadcastChannel', undefined)
  URL.createObjectURL = vi.fn(() => 'blob:cover')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('camera favorite UI', () => {
  it('opens stored covers, skips missing covers, and closes when the preview leaves the filter', async () => {
    const cover = { name: 'cover.webp', type: 'image/webp', size: 12, sha256: 'a'.repeat(64) }
    const first = { ...item, id: 'first', name: 'first', cover }
    const last = { ...item, id: 'last', name: 'last', cover }
    mocks.read.mockResolvedValue({ records: [first, item, last], covers: new Map() })
    const view = create(true)
    await flushPromises()
    const lightbox = view.findComponent({ name: 'Lightbox' })
    expect(lightbox.props('photo')).toBeNull()
    await view.findAll('.camera-favorite-card')[1].trigger('dblclick')
    expect(lightbox.props('photo')).toBeNull()
    await view.findAll('.camera-favorite-card')[0].trigger('dblclick')
    expect(lightbox.props('photo').id).toBe('first')
    expect(lightbox.props('hasPrevious')).toBe(false)
    expect(lightbox.props('hasNext')).toBe(true)
    const blob = new Blob(['cover'], { type: 'image/webp' })
    mocks.readCover.mockResolvedValueOnce(blob)
    expect(await lightbox.props('photo').loadImageBlob()).toBe(blob)
    expect(mocks.readCover).toHaveBeenLastCalledWith('first')
    lightbox.vm.$emit('next')
    await flushPromises()
    expect(lightbox.props('photo').id).toBe('last')
    expect(lightbox.props('hasNext')).toBe(false)
    lightbox.vm.$emit('previous')
    await flushPromises()
    expect(lightbox.props('photo').id).toBe('first')
    await view.setProps({ searchQuery: 'last' })
    expect(lightbox.props('photo')).toBeNull()
  })

  it('shows the screenshot for an empty library but not search or tag misses', async () => {
    const view = create()
    await flushPromises()
    expect(view.findComponent(MobileEmptyScreenshot).exists()).toBe(true)
    expect(view.find('.empty-import-button').exists()).toBe(false)
    mocks.read.mockResolvedValue({ records: [item], covers: new Map() })
    await (view.vm as unknown as { reload: () => Promise<void> }).reload()
    expect(view.findComponent(MobileEmptyScreenshot).exists()).toBe(false)
    await view.setProps({ searchQuery: 'does-not-match' })
    expect(view.find('.camera-empty').exists()).toBe(true)
    expect(view.findComponent(MobileEmptyScreenshot).exists()).toBe(false)
    await view.setProps({ searchQuery: '' })
    view.findComponent({ name: 'CollectionFilterBar' }).vm.$emit('change', 'tag:missing')
    await flushPromises()
    expect(view.find('.camera-empty').exists()).toBe(true)
    expect(view.findComponent(MobileEmptyScreenshot).exists()).toBe(false)
    mocks.read.mockResolvedValue({ records: [], covers: new Map() })
    await (view.vm as unknown as { reload: () => Promise<void> }).reload()
    expect(view.findComponent(MobileEmptyScreenshot).exists()).toBe(true)
  })

  it('provides four footer icons with a working copy action and disabled busy state', async () => {
    mocks.read.mockResolvedValue({ records: [item], covers: new Map() })
    const view = create()
    await flushPromises()
    const actions = view.findAll('.camera-favorite-card .outfit-card-actions button')
    expect(actions.map((action) => action.attributes('aria-label'))).toEqual([
      '复制',
      '编辑',
      '删除',
      '详情'
    ])
    expect(actions.every((action) => action.text() === '')).toBe(true)
    expect(view.find('.card-menu-trigger').exists()).toBe(false)
    await actions[0]!.trigger('click')
    expect(mocks.copy).toHaveBeenCalledWith('ABC')
    expect(view.get('.camera-favorite-card').attributes('aria-checked')).toBe('false')
    await view.setProps({ disabled: true })
    expect(
      view
        .findAll('.camera-favorite-card .outfit-card-actions button')
        .every((action) => action.attributes('disabled') !== undefined)
    ).toBe(true)
  })
  it('offers manual addition without an album and requires successful parsing before saving', async () => {
    const view = create()
    await flushPromises()
    button('添加收藏').click()
    await flushPromises()
    expect(button('保存收藏').disabled).toBe(true)
    const input = document.querySelector<HTMLTextAreaElement>('textarea:not([readonly])')!
    input.value = 'ABC'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(button('保存收藏').disabled).toBe(false)
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual', code: 'ABC', cover: null }),
      null,
      undefined
    )
    expect(view.emitted('status')?.at(-1)?.[1]).toBe('success')
  })
  it('invalidates a parsed result when the input changes and retains the form on failure', async () => {
    const view = create()
    await flushPromises()
    button('添加收藏').click()
    await flushPromises()
    const input = document.querySelector<HTMLTextAreaElement>('textarea:not([readonly])')!
    input.value = 'ABC'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    input.value = 'invalid'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(button('保存收藏').disabled).toBe(true)
    mocks.parse.mockResolvedValue(null)
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(view.emitted('status')?.at(-1)).toEqual(['无效参数码', 'error'])
    expect(document.querySelector('.outfit-editor-error')).toBeNull()
    expect(input.value).toBe('invalid')
  })
  it('saves a local album photo as WebP and a tool photo without a cover', async () => {
    const view = create()
    await flushPromises()
    const file = new File(['original'], 'cover.png', { type: 'image/png' })
    await (view.vm as unknown as { openFromResult: Function }).openFromResult(result, {
      name: 'cover.png',
      fileHandle: { getFile: async () => file }
    })
    await flushPromises()
    expect(document.querySelector('.camera-editor-preview')).not.toBeNull()
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    const converted = await mocks.webp.mock.results[0].value
    expect(mocks.save.mock.calls[0][1]).toBe(converted)
    expect(mocks.cover).toHaveBeenCalledWith(converted, 'cover.webp')
    expect(mocks.save.mock.calls[0][0].cover).toMatchObject({
      name: 'cover.webp',
      type: 'image/webp',
      size: converted.size
    })
    expect(mocks.save.mock.calls[0][0].source).toBe('album')
    expect(mocks.save.mock.calls[0][0].result.resourceGroups[0]).toEqual(result.resourceGroups[0])
    await (view.vm as unknown as { openFromResult: Function }).openFromResult(result, {
      name: 'tool.png'
    })
    await flushPromises()
    expect(document.querySelector('.camera-editor-preview')).toBeNull()
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(mocks.save.mock.calls[1][0].source).toBe('tool')
    expect(mocks.save.mock.calls[1][0].result.resourceGroups[0]).toEqual(result.resourceGroups[0])
    expect(mocks.save.mock.calls[1][1]).toBeNull()
  })
  it('stops duplicate entry before opening the editor', async () => {
    mocks.read.mockResolvedValue({ records: [item], covers: new Map() })
    const view = create()
    await flushPromises()
    await (view.vm as unknown as { openFromResult: Function }).openFromResult(result, null)
    await flushPromises()
    expect(document.querySelector('form')).toBeNull()
    expect(view.emitted('status')?.at(-1)).toEqual(['该参数已收藏', 'error'])
    expect(mocks.save).not.toHaveBeenCalled()
  })
})

describe('camera favorite selection and resources', () => {
  it('uses only light and filter images for mobile small covers and restores full resources elsewhere', async () => {
    const listeners = new Set<() => void>()
    const query = {
      matches: false,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn)
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query)
    )
    const withImages = {
      ...item,
      result: {
        ...result,
        resourceGroups: [
          { kind: 'pose', title: '动作', name: '回眸', imageUrl: '/pose.webp' },
          { kind: 'light', title: '灯光', name: '柔光', imageUrl: '/light.webp' },
          { kind: 'filter', title: '滤镜', name: '暖光', imageUrl: '/filter.webp' }
        ]
      }
    }
    mocks.read.mockResolvedValue({ records: [withImages], covers: new Map() })
    const view = create()
    await view.setProps({ thumbnailSize: 'small' })
    await flushPromises()
    expect(view.findAll('.camera-resources img')).toHaveLength(3)
    expect(view.findAll('.camera-resources strong')).toHaveLength(3)
    query.matches = true
    listeners.forEach((fn) => fn())
    await flushPromises()
    expect(view.findAll('.camera-resources img').map((image) => image.attributes('src'))).toEqual([
      '/light.webp',
      '/filter.webp'
    ])
    expect(view.get('.camera-resources').text()).toBe('')
    expect(view.get('.camera-name-tags h3').text()).toBe(item.name)
    await view.setProps({ thumbnailSize: 'medium' })
    expect(view.findAll('.camera-resources strong')).toHaveLength(3)
    await view.setProps({ thumbnailSize: 'small' })
    mocks.read.mockResolvedValue({ records: [item], covers: new Map() })
    await (view.vm as unknown as { reload: () => Promise<void> }).reload()
    expect(view.find('.camera-resources').exists()).toBe(false)
    expect(view.find('.camera-placeholder').exists()).toBe(true)
  })

  it('displays typed action resources in cards and details and filters empty resources', async () => {
    const typed = {
      ...item,
      result: {
        ...result,
        resourceGroups: [
          { kind: 'pose', title: '动作', name: '回眸', imageUrl: '/pose.webp' },
          { kind: 'light', title: '灯光', name: '--' },
          { kind: 'light', title: '灯光', name: '无' },
          { kind: 'filter', title: '滤镜', name: '暖光' }
        ]
      }
    }
    mocks.read.mockResolvedValue({ records: [typed], covers: new Map() })
    const view = create()
    await flushPromises()
    expect(view.findAll('.camera-resources strong').map((resource) => resource.text())).toEqual([
      '回眸',
      '暖光'
    ])
    button('详情').click()
    await flushPromises()
    await vi.waitFor(() => expect(document.querySelector('.photo-params-dialog')).not.toBeNull())
    expect(document.querySelector('.photo-params-dialog')?.textContent).toContain('回眸')
    expect(document.querySelector('.photo-params-dialog')?.textContent).toContain('晴天')
    expect(button('已收藏').disabled).toBe(true)
    expect(view.get('.camera-favorite-card').attributes('aria-checked')).toBe('false')
  })
  it('selects on single click, keeps button actions separate and does not open a preview on double click', async () => {
    mocks.read.mockResolvedValue({ records: [item], covers: new Map() })
    const view = create()
    await flushPromises()
    const card = view.get('.camera-favorite-card')
    await card.trigger('click')
    expect(card.attributes('aria-checked')).toBe('true')
    expect(view.find('.selection-bar').exists()).toBe(true)
    button('复制').click()
    await flushPromises()
    expect(card.attributes('aria-checked')).toBe('true')
    await card.trigger('dblclick')
    expect(document.querySelector('.lightbox')).toBeNull()
    expect(document.querySelector('.photo-params-dialog')).toBeNull()
    await card.trigger('keydown', { key: ' ' })
    expect(card.attributes('aria-checked')).toBe('false')
  })
  it('clears selection when leaving the parameter tab or filtering out selected records', async () => {
    mocks.read.mockResolvedValue({ records: [item], covers: new Map() })
    const view = create()
    await flushPromises()
    await view.get('.camera-favorite-card').trigger('click')
    await view.setProps({ searchQuery: 'unmatched' })
    expect(view.find('.selection-bar').exists()).toBe(false)
    await view.setProps({ searchQuery: '' })
    expect(view.get('.camera-favorite-card').attributes('aria-checked')).toBe('false')
    await view.get('.camera-favorite-card').trigger('click')
    await view.setProps({ active: false })
    await view.setProps({ active: true })
    expect(view.get('.camera-favorite-card').attributes('aria-checked')).toBe('false')
  })
})

describe('camera favorite tags', () => {
  it.each(['zh', 'en'] as const)(
    'limits new tag input and validation to five characters (%s)',
    async (language) => {
      mocks.read.mockResolvedValue({ records: [item], covers: new Map(), tags: [item.tag] })
      const view = create()
      await view.setProps({ language })
      await flushPromises()
      const sidebar = view.findComponent({ name: 'OutfitSidebar' })
      expect(sidebar.props('maxTagLength')).toBe(5)
      sidebar.vm.$emit('addTag', '123456')
      await flushPromises()
      expect(mocks.saveTags).not.toHaveBeenCalled()
      expect(view.emitted('status')?.at(-1)?.[0]).toContain('1–5')
      sidebar.vm.$emit('addTag', '12345')
      await flushPromises()
      expect(mocks.saveTags).toHaveBeenCalledWith([item.tag, '12345'])
      view
        .get(
          '.camera-favorite-card .outfit-card-actions button[aria-label="' +
            (language === 'zh' ? '编辑' : 'Edit') +
            '"]'
        )
        .element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
      document
        .querySelector<HTMLButtonElement>('.camera-editor-tags .outfit-editor-add-tag')!
        .click()
      await flushPromises()
      const input = document.querySelector<HTMLInputElement>('.camera-tag-popover input')!
      expect(input.maxLength).toBe(5)
      expect(input.placeholder).toContain('5')
    }
  )

  it('counts single-tag records in the shared sidebar and filters uncategorized records', async () => {
    const untagged = { ...item, id: 'two', tag: '', name: '无标签收藏', code: 'XYZ' }
    mocks.read.mockResolvedValue({
      records: [item, { ...item, id: 'warm', code: 'WARM', tag: '暖光' }, untagged],
      covers: new Map()
    })
    const view = create()
    await flushPromises()
    const rows = view.findAll('.outfit-filter-row')
    expect(rows.map((row) => row.get('small').text())).toEqual(['1', '1'])
    await rows[1].get('.outfit-filter-button').trigger('click')
    expect(view.findAll('.camera-favorite-card')).toHaveLength(1)
    expect(view.get('.camera-favorite-card').attributes('aria-label')).toBe(item.name)
    const filters = view.findAll('.outfit-filter-list > button')
    expect(filters).toHaveLength(2)
    await filters[1].trigger('click')
    expect(view.get('.camera-favorite-card').attributes('aria-label')).toBe('无标签收藏')
  })
  it('replaces the selected tag through selection and creation and saves only one tag', async () => {
    mocks.read.mockResolvedValue({ records: [item], covers: new Map(), tags: ['人像', '暖光'] })
    const view = create()
    await flushPromises()
    button('编辑').click()
    await flushPromises()
    const choices = document.querySelector('.camera-editor-tags')!
    expect(choices.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
    const warmTag = [...choices.querySelectorAll('button')].find(
      (button) => button.textContent === '暖光'
    )!
    warmTag.click()
    await flushPromises()
    expect(
      [...choices.querySelectorAll('[aria-pressed="true"]')].map((button) => button.textContent)
    ).toEqual(['暖光'])
    warmTag.click()
    await flushPromises()
    expect(choices.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0)
    ;(choices.querySelector('.outfit-editor-add-tag') as HTMLButtonElement).click()
    await flushPromises()
    const input = choices.querySelector('input')!
    input.value = '夜景'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    ;(choices.querySelector('.camera-tag-popover button') as HTMLButtonElement).click()
    await flushPromises()
    document
      .querySelector('.camera-favorite-editor')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(mocks.save.mock.calls[0][0].tag).toBe('夜景')
    expect(mocks.saveTags).toHaveBeenCalledWith(['人像', '暖光', '夜景'])
    expect(view.get('.camera-favorite-card').attributes('aria-checked')).toBe('false')
  })
  it('retains standalone categories and their order after remounting', async () => {
    const view = create()
    await flushPromises()
    const sidebar = view.findComponent({ name: 'OutfitSidebar' })
    sidebar.vm.$emit('addTag', '夜景')
    await flushPromises()
    sidebar.vm.$emit('addTag', '人像')
    await flushPromises()
    sidebar.vm.$emit('reorderTags', ['人像', '夜景'])
    await flushPromises()
    view.unmount()
    wrapper = null
    const remounted = create()
    await flushPromises()
    expect(
      remounted.findAll('.outfit-filter-row .outfit-filter-button span').map((el) => el.text())
    ).toEqual(['人像', '夜景'])
  })
})

it('places the camera sidebar in the navigation column and removes it when leaving the tab', async () => {
  const target = document.createElement('div')
  target.id = 'camera-test-sidebar'
  document.body.append(target)
  const view = create()
  await view.setProps({ sidebarTarget: '#camera-test-sidebar' })
  await flushPromises()
  expect(target.querySelector('.outfit-sidebar')).not.toBeNull()
  await view.setProps({ active: false })
  expect(target.querySelector('.outfit-sidebar')).toBeNull()
})

describe('camera favorite automatic parsing', () => {
  async function enter(value: string) {
    const input = document.querySelector<HTMLTextAreaElement>('textarea:not([readonly])')!
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
  }
  async function open() {
    const view = create()
    await flushPromises()
    button('添加收藏').click()
    await flushPromises()
    return view
  }
  it('debounces typing and skips whitespace-only changes', async () => {
    const view = await open()
    expect(button('解析参数')).toBeUndefined()
    await enter('A')
    await vi.advanceTimersByTimeAsync(300)
    await enter('ABC')
    await vi.advanceTimersByTimeAsync(499)
    expect(mocks.parse).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(mocks.parse).toHaveBeenCalledTimes(1)
    expect(mocks.parse).toHaveBeenCalledWith('ABC')
    expect(view.emitted('status')?.at(-1)).toEqual(['参数已解析', 'success'])
    await enter(' A B C\n')
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.parse).toHaveBeenCalledTimes(1)
    expect(button('保存收藏').disabled).toBe(false)
  })
  it('cancels pending parsing on clear, close and unmount', async () => {
    const view = await open()
    await enter('ABC')
    await enter('')
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.parse).not.toHaveBeenCalled()
    expect(button('保存收藏').disabled).toBe(true)
    await enter('ABC')
    button('取消').click()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.parse).not.toHaveBeenCalled()
    button('添加收藏').click()
    await flushPromises()
    await enter('ABC')
    view.unmount()
    wrapper = null
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.parse).not.toHaveBeenCalled()
  })
  it('ignores late results after new input or closing the editor', async () => {
    const view = await open()
    let finishOld!: (value: PhotoParamsResult) => void
    mocks.parse.mockImplementationOnce(
      () =>
        new Promise<PhotoParamsResult>((resolve) => {
          finishOld = resolve
        })
    )
    await enter('OLD')
    await vi.advanceTimersByTimeAsync(500)
    expect(document.querySelector('.camera-parse-status')?.textContent).toContain('解析中')
    mocks.parse.mockResolvedValue({ ...result, rawCameraParams: 'NEW' })
    await enter('NEW')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    finishOld({ ...result, rawCameraParams: 'OLD' })
    await flushPromises()
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(mocks.save.mock.calls[0][0].result.rawCameraParams).toBe('NEW')
    button('添加收藏').click()
    await flushPromises()
    mocks.parse.mockImplementationOnce(
      () =>
        new Promise<PhotoParamsResult>((resolve) => {
          finishOld = resolve
        })
    )
    await enter('LATE')
    await vi.advanceTimersByTimeAsync(500)
    const notices = view.emitted('status')?.length
    button('取消').click()
    await flushPromises()
    finishOld({ ...result, rawCameraParams: 'LATE' })
    await flushPromises()
    expect(view.emitted('status')?.length).toBe(notices)
    expect(document.querySelector('form')).toBeNull()
  })
  it('preserves existing photo results and retries automatically after invalid input', async () => {
    const view = create()
    await flushPromises()
    await (view.vm as unknown as { openFromResult: Function }).openFromResult(result, {
      name: 'photo.png'
    })
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.parse).not.toHaveBeenCalled()
    expect(button('保存收藏').disabled).toBe(false)
    mocks.parse.mockResolvedValue(null)
    await enter('bad')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(view.emitted('status')?.at(-1)).toEqual(['无效参数码', 'error'])
    expect(document.querySelector('.outfit-editor-error')).toBeNull()
    await enter('')
    expect(document.querySelector('.outfit-editor-error')).toBeNull()
    mocks.parse.mockResolvedValue({ ...result, rawCameraParams: 'GOOD' })
    await enter('GOOD')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(button('保存收藏').disabled).toBe(false)
  })
})

describe('camera cover conversion', () => {
  async function openAlbum() {
    const view = create()
    await flushPromises()
    const file = new File(['original'], 'album.png', { type: 'image/png' })
    await (view.vm as unknown as { openFromResult: Function }).openFromResult(result, {
      name: file.name,
      fileHandle: { getFile: async () => file }
    })
    return view
  }
  async function submit() {
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
  }
  it('waits for a mobile cover snapshot and saves using the copied bytes', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    )
    await openAlbum()
    let finish!: (file: File) => void
    mocks.snapshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const upload = new File(['source'], 'mobile.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('#camera-favorite-cover')!
    Object.defineProperty(input, 'files', { value: [upload] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await submit()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.snapshot).toHaveBeenCalledWith(upload)
    const copy = new File(['copied'], 'mobile.jpg', { type: 'image/jpeg' })
    finish(copy)
    await flushPromises()
    await submit()
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.webp.mock.calls[0][0].size).toBe(copy.size)
  })
  it('discards a pending mobile snapshot when the editor closes', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    )
    await openAlbum()
    let finish!: (file: File) => void
    mocks.snapshot.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const upload = new File(['image'], 'mobile.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('#camera-favorite-cover')!
    Object.defineProperty(input, 'files', { value: [upload] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    button('取消').click()
    await flushPromises()
    const calls = vi.mocked(URL.createObjectURL).mock.calls.length
    finish(upload)
    await flushPromises()
    expect(vi.mocked(URL.createObjectURL).mock.calls).toHaveLength(calls)
  })
  it.each([true, false])(
    'recovers from failed cover selection with previous cover=%s',
    async (previous) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
      )
      if (previous) await openAlbum()
      else {
        const view = create()
        await flushPromises()
        await (view.vm as unknown as { openFromResult: Function }).openFromResult(result, null)
      }
      mocks.snapshot.mockRejectedValueOnce(new Error('read denied'))
      const upload = new File(['bad'], 'bad.jpg', { type: 'image/jpeg' })
      const input = document.querySelector('#camera-favorite-cover')!
      Object.defineProperty(input, 'files', { value: [upload] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
      expect(
        document.querySelector('.camera-favorite-editor [role="status"]')?.textContent
      ).toContain('读取失败')
      expect(button('保存收藏').disabled).toBe(false)
      await submit()
      expect(mocks.save).toHaveBeenCalledTimes(1)
      if (previous) expect(mocks.save.mock.calls[0][1]).not.toBeNull()
      else expect(mocks.save.mock.calls[0][1]).toBeNull()
    }
  )
  it('keeps the form on conversion failure and retries without writing a partial favorite', async () => {
    const view = await openAlbum()
    mocks.webp.mockRejectedValueOnce(new Error('decode failed'))
    await submit()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(document.querySelector<HTMLTextAreaElement>('textarea:not([readonly])')?.value).toBe(
      'ABC'
    )
    expect(document.querySelector('.camera-editor-preview')).not.toBeNull()
    expect(view.emitted('status')?.at(-1)).toEqual(['封面处理失败：decode failed', 'error'])
    await submit()
    expect(mocks.save).toHaveBeenCalledTimes(1)
  })
  it.each(['image/png', 'image/jpeg'])(
    'saves a validated original cover with MIME %s',
    async (type) => {
      await openAlbum()
      const original = new Blob(['original'], { type })
      mocks.webp.mockResolvedValueOnce(original)
      await submit()
      expect(mocks.save.mock.calls[0][1]).toBe(original)
      expect(mocks.save.mock.calls[0][0].cover).toMatchObject({
        type,
        name: type === 'image/jpeg' ? 'album.jpg' : 'album.png'
      })
    }
  )
  it('does not reconvert on a storage retry or when editing a saved cover', async () => {
    await openAlbum()
    mocks.save.mockRejectedValueOnce(new Error('storage failed'))
    await submit()
    await submit()
    expect(mocks.webp).toHaveBeenCalledTimes(1)
    const [saved, cover] = mocks.save.mock.calls[1]
    mocks.read.mockResolvedValue({ records: [saved], covers: new Map([[saved.id, cover]]) })
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    button('编辑').click()
    await flushPromises()
    await submit()
    expect(mocks.webp).toHaveBeenCalledTimes(1)
    expect(mocks.save.mock.calls[2][1]).toBe(cover)
  })
  it.each(['png', 'webp'])(
    'prepares an uploaded %s replacement and skips conversion when the album cover is removed',
    async (extension) => {
      await openAlbum()
      const upload = new File(['manual'], `manual.${extension}`, { type: `image/${extension}` })
      const input = document.querySelector('#camera-favorite-cover')!
      Object.defineProperty(input, 'files', { value: [upload] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
      await submit()
      expect(mocks.webp).toHaveBeenCalledTimes(1)
      expect(mocks.save.mock.calls[0][1].type).toBe('image/webp')
      expect(mocks.save.mock.calls[0][0].cover.name).toBe('manual.webp')
      wrapper?.unmount()
      wrapper = null
      await openAlbum()
      button('移除封面').click()
      await flushPromises()
      await submit()
      expect(mocks.webp).toHaveBeenCalledTimes(1)
      expect(mocks.save.mock.calls[1][1]).toBeNull()
    }
  )
})

it('converts an existing non-WebP cover when saving an edit', async () => {
  const original = new Blob(['png'], { type: 'image/png' })
  const saved = {
    ...item,
    cover: {
      name: 'existing.png',
      type: original.type,
      size: original.size,
      sha256: 'a'.repeat(64)
    }
  }
  mocks.read.mockResolvedValue({ records: [saved], covers: new Map([[saved.id, original]]) })
  create()
  await flushPromises()
  button('编辑').click()
  await flushPromises()
  document
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
  expect(mocks.webp).toHaveBeenCalledTimes(1)
  expect(mocks.save.mock.calls[0][0].cover).toMatchObject({
    name: 'existing.webp',
    type: 'image/webp'
  })
  expect(mocks.save.mock.calls[0][1].type).toBe('image/webp')
})

it('does not read saved covers while the favorites page is inactive', async () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  const cover = new Blob(['cover'], { type: 'image/webp' })
  mocks.read.mockResolvedValue({
    records: [
      {
        ...item,
        cover: { name: 'cover.webp', type: cover.type, size: cover.size, sha256: 'a'.repeat(64) }
      }
    ],
    covers: new Map([[item.id, cover]])
  })
  const view = create()
  await view.setProps({ active: false })
  await flushPromises()
  expect(view.find('.stored-image').exists()).toBe(true)
  expect(mocks.readCover).not.toHaveBeenCalled()
  await view.setProps({ active: true })
  await flushPromises()
  expect(mocks.readCover).toHaveBeenCalledOnce()
  expect(view.get('.stored-image img').attributes('src')).toBe('blob:cover')
  await view.setProps({ active: false })
  expect(view.find('.stored-image img').exists()).toBe(false)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover')
})

it('skips focus refresh for an inactive module and while its editor is open', async () => {
  const view = create()
  await flushPromises()
  await view.setProps({ active: false })
  mocks.read.mockClear()
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  expect(mocks.read).not.toHaveBeenCalled()
  await view.setProps({ active: true })
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  expect(mocks.read).toHaveBeenCalledOnce()
  button('添加收藏').click()
  await flushPromises()
  mocks.read.mockClear()
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
  expect(mocks.read).not.toHaveBeenCalled()
})

it('reports an editor preview element failure with file metadata but no filename', async () => {
  const capture = vi.spyOn(diagnosticReporter, 'reportError').mockReturnValue('test-event')
  try {
    const view = create()
    await flushPromises()
    const file = new File(['original'], 'private-file.png', { type: 'image/png' })
    await (
      view.vm as unknown as {
        openFromResult: (value: PhotoParamsResult, photo: unknown) => Promise<void>
      }
    ).openFromResult(result, {
      name: file.name,
      fileHandle: { getFile: async () => file }
    })
    await flushPromises()
    const image = document.querySelector<HTMLImageElement>('.camera-editor-preview')!
    expect(image).not.toBeNull()
    image.dispatchEvent(new Event('error'))
    await flushPromises()
    expect(capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        module: 'camera-favorites',
        code: 'IMAGE_PREVIEW_FAILED',
        stage: 'preview-element',
        context: { mimeType: 'image/png', sizeBytes: file.size }
      })
    )
    expect(JSON.stringify(capture.mock.calls)).not.toContain(file.name)
    expect(view.emitted('status')?.at(-1)?.[1]).toBe('error')
  } finally {
    capture.mockRestore()
  }
})
