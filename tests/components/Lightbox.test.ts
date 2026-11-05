import '../helpers/enableCommunityResources'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { messages } from '../../src/i18n'
import type { PhotoItem } from '../../src/utils/photoGrouping'
import { outfitMessages } from '../../src/i18n/messages/outfit'
import type { OutfitItem } from '../../src/utils/outfit/outfitFileSystem'
import { homeSchemeMessages } from '../../src/i18n/messages/homeScheme'
import type { HomeSchemeItem } from '../../src/utils/homeBuild/homeSchemeTypes'
import Lightbox from '../../src/components/Lightbox.vue'

const loadPhotoMock = vi.fn<(photo: PhotoItem) => Promise<string>>()

vi.mock('../../src/utils/photoLoader', () => ({
  loadPhotoWithRetry: (photo: PhotoItem) => loadPhotoMock(photo),
  loadPhotoWithRetryAndSize: async (photo: PhotoItem) => ({
    url: await loadPhotoMock(photo),
    width: 1600,
    height: 900
  })
}))

/** 创建大图测试所需的最小照片状态。参数：name 为照片文件名。 */
function createPhoto(name: string): PhotoItem {
  return {
    id: name,
    name,
    url: null,
    fileSizeText: '1 MB',
    fileHandle: {} as FileSystemFileHandle,
    directoryHandle: {} as FileSystemDirectoryHandle,
    dateKey: '2026-07-21',
    year: '2026',
    monthDay: '07月21日',
    displayDate: '2026年07月21日',
    timeText: '11:20',
    timestamp: 1
  }
}

describe('Lightbox preview navigation', () => {
  beforeEach(() => {
    loadPhotoMock.mockReset()
  })

  it('loads File photos and blocks destructive clicks and Delete while allowing favorites and parsing', async () => {
    const photo = {
      ...createPhoto('photo.jpg'),
      source: 'file' as const,
      file: new File(['photo'], 'photo.jpg')
    }
    loadPhotoMock.mockResolvedValue('blob:photo')
    const wrapper = mount(Lightbox, {
      props: {
        photo,
        readOnly: true,
        readOnlyHint: '只读',
        hasPrevious: false,
        hasNext: false,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: true,
        mode: 'album',
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    try {
      await flushPromises()
      expect(loadPhotoMock).toHaveBeenCalled()
      expect(wrapper.get('.lightbox-delete').attributes('disabled')).toBeDefined()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
      await wrapper.get('.lightbox-delete').trigger('click')
      expect(wrapper.emitted('deleteCurrent')).toBeUndefined()
      await wrapper.get(`[aria-label="${messages.zh.lightbox.parsePhoto}"]`).trigger('click')
      expect(wrapper.emitted('parsePhoto')).toHaveLength(1)
      await wrapper.get(`[aria-label="${messages.zh.lightbox.favorite}"]`).trigger('click')
      expect(wrapper.emitted('toggleFavorite')).toHaveLength(1)
      expect(
        wrapper.get(`[aria-label="${messages.zh.lightbox.editNote}"]`).attributes('disabled')
      ).toBeDefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('does not restart the controls timer if decoding completes after unmount', async () => {
    let finish!: (url: string) => void
    loadPhotoMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const wrapper = mount(Lightbox, {
      props: {
        photo: createPhoto('late.jpeg'), hasPrevious: false, hasNext: false,
        isDeleting: false, isFavorite: false, keyboardEnabled: true, mode: 'album',
        messages: messages.zh.lightbox, dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    wrapper.unmount()
    const timer = vi.spyOn(globalThis, 'setTimeout')
    try {
      finish('blob:late')
      await flushPromises()
      expect(timer.mock.calls.some(([, delay]) => delay === 680)).toBe(false)
    } finally {
      timer.mockRestore()
    }
  })

  it('keeps the delete button visually enabled while the next image is loading', async () => {
    const firstPhoto = createPhoto('2026_07_21_11_20_00.jpeg')
    const nextPhoto = createPhoto('2026_07_21_11_21_00.jpeg')
    let finishNextLoad: ((url: string) => void) | undefined
    loadPhotoMock.mockResolvedValueOnce('blob:first').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNextLoad = resolve
        })
    )

    const wrapper = mount(Lightbox, {
      props: {
        photo: firstPhoto,
        hasPrevious: false,
        hasNext: true,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: true,
        mode: 'album',
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.setProps({ photo: nextPhoto })
    const deleteButton = wrapper.get('.lightbox-delete')

    expect(deleteButton.attributes('disabled')).toBeUndefined()
    expect(deleteButton.attributes('aria-disabled')).toBe('true')
    expect(deleteButton.classes()).toContain('is-preview-loading')
    await deleteButton.trigger('click')
    expect(wrapper.emitted('deleteCurrent')).toBeUndefined()

    finishNextLoad?.('blob:next')
    await vi.waitFor(() => {
      expect(wrapper.get('.lightbox-delete').attributes('aria-disabled')).toBeUndefined()
    })
    wrapper.unmount()
  })

  it('clamps zoom and resets it whenever the photo changes', async () => {
    const firstPhoto = createPhoto('2026_07_21_11_20_00.jpeg')
    const nextPhoto = createPhoto('2026_07_21_11_21_00.jpeg')
    loadPhotoMock.mockResolvedValue('blob:photo')
    const wrapper = mount(Lightbox, {
      props: {
        photo: firstPhoto,
        hasPrevious: false,
        hasNext: true,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: true,
        mode: 'album',
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    await wrapper.get('.lightbox-stage').trigger('wheel', { deltaY: -1 })
    expect(wrapper.findAll('.lightbox-zoom-controls button')[1].text()).toBe('125%')
    await wrapper
      .findAll('.lightbox-zoom-controls button')[2]
      .trigger('pointerdown', { pointerId: 1 })
    await wrapper.findAll('.lightbox-zoom-controls button')[2].trigger('click')
    expect(wrapper.findAll('.lightbox-zoom-controls button')[1].text()).toBe('150%')
    for (let index = 0; index < 10; index += 1)
      await wrapper.findAll('.lightbox-zoom-controls button')[2].trigger('click')
    expect(wrapper.findAll('.lightbox-zoom-controls button')[1].text()).toBe('400%')
    expect(
      wrapper.findAll('.lightbox-zoom-controls button')[2].attributes('disabled')
    ).toBeDefined()

    await wrapper.setProps({ photo: nextPhoto })
    expect(wrapper.findAll('.lightbox-zoom-controls button')[1].text()).toBe('100%')
    wrapper.unmount()
  })

  it('matches the preview stage aspect ratio to the loaded image', async () => {
    loadPhotoMock.mockResolvedValue('blob:photo')
    const wrapper = mount(Lightbox, {
      props: {
        photo: createPhoto('2026_07_21_11_20_00.jpeg'),
        hasPrevious: false,
        hasNext: false,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: true,
        mode: 'album',
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    expect(wrapper.get('.lightbox-panel').attributes('style')).toContain(
      '--lightbox-image-aspect-ratio: 1.7777777777777777'
    )
    wrapper.unmount()
  })

  it('ignores preview shortcuts while an upper dialog disables the keyboard', async () => {
    loadPhotoMock.mockResolvedValue('blob:photo')
    const wrapper = mount(Lightbox, {
      props: {
        photo: createPhoto('2026_07_21_11_20_00.jpeg'),
        hasPrevious: true,
        hasNext: true,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: false,
        mode: 'album',
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.emitted('previous')).toBeUndefined()
    expect(wrapper.emitted('next')).toBeUndefined()

    await wrapper.setProps({ keyboardEnabled: true })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('locks background scroll while the preview is open and restores it on close', async () => {
    loadPhotoMock.mockResolvedValue('blob:photo')
    const wrapper = mount(Lightbox, {
      props: {
        photo: createPhoto('2026_07_21_11_20_00.jpeg'),
        hasPrevious: false,
        hasNext: false,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: true,
        mode: 'album',
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    expect(document.body.style.overflow).toBe('clip')
    await wrapper.setProps({ photo: null })
    expect(document.body.style.overflow).toBe('')

    await wrapper.setProps({ photo: createPhoto('2026_07_21_11_21_00.jpeg') })
    expect(document.body.style.overflow).toBe('clip')
    wrapper.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('shows outfit metadata and emits copy and edit actions without closing the preview', async () => {
    loadPhotoMock.mockResolvedValue('blob:outfit')
    const outfit = {
      ...createPhoto('look.webp'),
      code: 'ABC-123',
      tags: ['甜美'],
      version: 1,
      image: 'look.webp',
      note: '',
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z'
    } as OutfitItem
    const wrapper = mount(Lightbox, {
      props: {
        photo: outfit,
        outfit,
        outfitMessages: outfitMessages.zh,
        hasPrevious: false,
        hasNext: false,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: true,
        mode: 'outfit',
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    expect(wrapper.get('.lightbox-outfit-meta').text()).toContain('标签：甜美')
    expect(wrapper.get('.lightbox-outfit-meta').text()).toContain('搭配码：ABC-123')
    await wrapper.get('[aria-label="复制搭配码"]').trigger('click')
    await wrapper.get('[aria-label="编辑方案"]').trigger('click')
    expect(wrapper.emitted('copyOutfit')).toHaveLength(1)
    expect(wrapper.emitted('editOutfit')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})

// 通过完整指针序列验证手势互斥，避免双指缩放结束后误触翻页。
describe('Lightbox touch gestures', () => {
  async function createTouchPreview() {
    loadPhotoMock.mockResolvedValue('blob:touch')
    const wrapper = mount(Lightbox, {
      props: {
        photo: createPhoto('touch.jpeg'),
        hasPrevious: true,
        hasNext: true,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: true,
        mode: 'album',
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    return wrapper
  }
  it('pages on a horizontal swipe but not on vertical movement or cancellation', async () => {
    const wrapper = await createTouchPreview()
    try {
      const stage = wrapper.get('.lightbox-stage')
      await stage.trigger('pointerdown', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 200,
        clientY: 100
      })
      await stage.trigger('pointerup', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 110,
        clientY: 105
      })
      expect(wrapper.emitted('next')).toHaveLength(1)
      await stage.trigger('pointerdown', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 200,
        clientY: 100
      })
      await stage.trigger('pointerup', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 110,
        clientY: 220
      })
      await stage.trigger('pointerdown', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 200,
        clientY: 100
      })
      await stage.trigger('pointercancel', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 110,
        clientY: 100
      })
      expect(wrapper.emitted('next')).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })
  it('pinches, clamps the zoom, and pans without paging until a new photo resets it', async () => {
    const wrapper = await createTouchPreview()
    try {
      const stage = wrapper.get('.lightbox-stage')
      await stage.trigger('pointerdown', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 100,
        clientY: 100
      })
      await stage.trigger('pointerdown', {
        pointerType: 'touch',
        pointerId: 2,
        clientX: 200,
        clientY: 100
      })
      await stage.trigger('pointermove', {
        pointerType: 'touch',
        pointerId: 2,
        clientX: 300,
        clientY: 100
      })
      expect(wrapper.findAll('.lightbox-zoom-controls button')[1]!.text()).toBe('200%')
      await stage.trigger('pointermove', {
        pointerType: 'touch',
        pointerId: 2,
        clientX: 600,
        clientY: 100
      })
      expect(wrapper.findAll('.lightbox-zoom-controls button')[1]!.text()).toBe('400%')
      await stage.trigger('pointerup', {
        pointerType: 'touch',
        pointerId: 2,
        clientX: 600,
        clientY: 100
      })
      await stage.trigger('pointermove', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 160,
        clientY: 130
      })
      expect(wrapper.get('.lightbox-stage img').attributes('style')).toContain('translate3d')
      await stage.trigger('pointerup', {
        pointerType: 'touch',
        pointerId: 1,
        clientX: 160,
        clientY: 130
      })
      expect(wrapper.emitted('previous')).toBeUndefined()
      expect(wrapper.emitted('next')).toBeUndefined()
      await wrapper.setProps({ photo: createPhoto('next.jpeg') })
      expect(wrapper.findAll('.lightbox-zoom-controls button')[1]!.text()).toBe('100%')
    } finally {
      wrapper.unmount()
    }
  })
})

it('blocks album actions until the displayed photo matches the target', async () => {
  let finish!: (value: string) => void
  loadPhotoMock
    .mockReset()
    .mockResolvedValueOnce('blob:first')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
  const wrapper = mount(Lightbox, {
    props: {
      photo: createPhoto('first'),
      hasPrevious: true,
      hasNext: true,
      isDeleting: false,
      isFavorite: false,
      keyboardEnabled: true,
      mode: 'album',
      messages: messages.zh.lightbox,
      dateMessages: messages.zh.date
    },
    global: { stubs: { Teleport: true } }
  })
  await flushPromises()
  await wrapper.setProps({ photo: createPhoto('second') })
  const actions = [
    [messages.zh.lightbox.parsePhoto, 'parsePhoto'],
    [messages.zh.lightbox.editNote, 'editPhotoNote'],
    [messages.zh.lightbox.favorite, 'toggleFavorite']
  ] as const
  for (const [label, event] of actions) {
    const button = wrapper.get('button[aria-label="' + label + '"]')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(wrapper.emitted(event)).toBeUndefined()
  }
  finish('blob:second')
  await flushPromises()
  for (const [label, event] of actions) {
    await wrapper.get('button[aria-label="' + label + '"]').trigger('click')
    expect(wrapper.emitted(event)).toHaveLength(1)
  }
  wrapper.unmount()
})

it.each(['outfit', 'home'] as const)(
  'blocks %s copy/edit actions while replacing the image',
  async (mode) => {
    let finish!: (value: string) => void
    loadPhotoMock
      .mockReset()
      .mockResolvedValueOnce('blob:first')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
    const photo = createPhoto('first')
    const outfit = { ...photo, code: 'ABC', tags: [], note: '' } as unknown as OutfitItem
    const homeScheme = {
      id: 'home',
      code: 'HOME',
      name: '家园',
      tags: [],
      note: '',
      metadata: {}
    } as unknown as HomeSchemeItem
    const locale = mode === 'home' ? homeSchemeMessages.zh : outfitMessages.zh
    const wrapper = mount(Lightbox, {
      props: {
        photo,
        outfit,
        homeScheme,
        outfitMessages: outfitMessages.zh,
        homeMessages: homeSchemeMessages.zh,
        hasPrevious: true,
        hasNext: true,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: true,
        mode,
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()
    await wrapper.setProps({ photo: createPhoto('second') })
    const actions = [
      [locale.copy, mode === 'home' ? 'copyHomeScheme' : 'copyOutfit'],
      [locale.edit, mode === 'home' ? 'editHomeScheme' : 'editOutfit']
    ]
    for (const [label, event] of actions) {
      const button = wrapper.get('button[aria-label="' + label + '"]')
      expect(button.attributes('disabled')).toBeDefined()
      await button.trigger('click')
      expect(wrapper.emitted(event!)).toBeUndefined()
    }
    finish('blob:second')
    await flushPromises()
    for (const [label, event] of actions) {
      await wrapper.get('button[aria-label="' + label + '"]').trigger('click')
      expect(wrapper.emitted(event!)).toHaveLength(1)
    }
    wrapper.unmount()
  }
)

it('half-hides the toolbar after one second and only expands on toolbar hover or keyboard activity', async () => {
  vi.useFakeTimers()
  loadPhotoMock.mockResolvedValue('blob:photo')
  const wrapper = mount(Lightbox, {
    props: {
      photo: createPhoto('idle.jpeg'),
      hasPrevious: true,
      hasNext: true,
      isDeleting: false,
      isFavorite: false,
      keyboardEnabled: true,
      mode: 'album',
      messages: messages.zh.lightbox,
      dateMessages: messages.zh.date
    },
    global: { stubs: { Teleport: true } }
  })
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.get('.lightbox-footer').classes()).not.toContain('is-idle')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('.lightbox-footer').classes()).toContain('is-idle')
    expect(wrapper.find('.lightbox-close').exists()).toBe(true)
    expect(wrapper.find('.lightbox-stage .lightbox-nav-button').exists()).toBe(false)
    await wrapper.get('.lightbox > .lightbox-nav-zone--prev button').trigger('click')
    await wrapper.get('.lightbox > .lightbox-nav-zone--next button').trigger('click')
    expect(wrapper.emitted('previous')).toHaveLength(1)
    expect(wrapper.emitted('next')).toHaveLength(1)
    await wrapper.setProps({ photo: createPhoto('next-idle.jpeg') })
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.get('.lightbox-footer').classes()).toContain('is-idle')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.get('.lightbox-footer').classes()).toContain('is-idle')
    await wrapper.setProps({ hasPrevious: false })
    expect(wrapper.find('.lightbox-nav-zone--prev button').exists()).toBe(false)
    expect(wrapper.find('.lightbox-nav-zone--next button').exists()).toBe(true)

    await wrapper.get('.lightbox').trigger('pointermove')
    await wrapper.get('.lightbox-stage').trigger('pointermove')
    expect(wrapper.get('.lightbox-footer').classes()).toContain('is-idle')
    await wrapper.get('.lightbox-footer').trigger('pointerenter')
    await vi.advanceTimersByTimeAsync(5000)
    expect(wrapper.get('.lightbox-footer').classes()).not.toContain('is-idle')
    await wrapper.get('.lightbox-footer').trigger('pointerleave')
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.get('.lightbox-footer').classes()).toContain('is-idle')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.get('.lightbox-footer').classes()).not.toContain('is-idle')
    await wrapper.setProps({ photo: null })
    expect(vi.getTimerCount()).toBe(0)
  } finally {
    wrapper.unmount()
    vi.useRealTimers()
  }
})

describe('camera cover preview', () => {
  it('renders module actions with loading guards and ignores album Delete shortcuts', async () => {
    let finishLoad: ((url: string) => void) | undefined
    loadPhotoMock.mockResolvedValueOnce('blob:camera').mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve }))
    const wrapper = mount(Lightbox, {
      props: {
        photo: createPhoto('camera-cover.webp'),
        hasPrevious: false,
        hasNext: false,
        isDeleting: false,
        isFavorite: false,
        keyboardEnabled: true,
        mode: 'camera',
        messages: messages.zh.lightbox,
        dateMessages: messages.zh.date
      },
      slots: {
        metadata: '<span class="camera-test-meta">Camera name</span>',
        actions: '<template #default="{ disabled }"><button class="camera-test-action" :disabled="disabled">Copy</button></template>'
      },
      global: { stubs: { Teleport: true } }
    })
    try {
      await flushPromises()
      expect(wrapper.get('.camera-test-meta').text()).toBe('Camera name')
      expect(wrapper.get('.camera-test-action').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('.lightbox-delete').exists()).toBe(false)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
      expect(wrapper.emitted('deleteCurrent')).toBeUndefined()
      await wrapper.setProps({ photo: createPhoto('next-camera-cover.webp') })
      expect(wrapper.get('.camera-test-action').attributes('disabled')).toBeDefined()
      finishLoad?.('blob:next-camera')
      await flushPromises()
      expect(wrapper.get('.camera-test-action').attributes('disabled')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })
})

describe('seamless preview switching', () => {
  it('keeps the current image during loading and overlaps both images when the next is ready', async () => {
    let completeNext: ((url: string) => void) | undefined
    loadPhotoMock.mockResolvedValueOnce('blob:first').mockImplementationOnce(
      () => new Promise((resolve) => { completeNext = resolve })
    )
    const wrapper = mount(Lightbox, {
      props: {
        photo: createPhoto('first.jpeg'),
        hasPrevious: false, hasNext: true, isDeleting: false,
        isFavorite: false, keyboardEnabled: true, mode: 'album',
        messages: messages.zh.lightbox, dateMessages: messages.zh.date
      },
      global: { stubs: { Teleport: true, Transition: false } }
    })
    try {
      await flushPromises()
      expect(wrapper.get('.lightbox-stage img').attributes('alt')).toBe('first.jpeg')
      await wrapper.setProps({ photo: createPhoto('second.jpeg') })
      expect(wrapper.get('.lightbox-stage img').attributes('alt')).toBe('first.jpeg')
      completeNext?.('blob:second')
      await flushPromises()
      const images = wrapper.findAll('.lightbox-stage img')
      expect(images.map((img) => img.attributes('alt')).sort()).toEqual(['first.jpeg', 'second.jpeg'])
      expect(images.some((img) => img.classes().includes('lightbox-photo-leave-active'))).toBe(true)
      expect(images.some((img) => img.classes().includes('lightbox-photo-enter-active'))).toBe(true)
    } finally { wrapper.unmount() }
  })
})
