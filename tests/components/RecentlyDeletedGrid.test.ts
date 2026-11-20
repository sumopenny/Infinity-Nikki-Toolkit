import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import RecentlyDeletedGrid from '../../src/components/RecentlyDeletedGrid.vue'
import { createPhotoThumbnailCache } from '../../src/utils/photoThumbnail'
import { messages } from '../../src/i18n'
import type { RecentlyDeletedPhoto } from '../../src/utils/photoGrouping'

const photo = {
  id: 'deleted',
  name: 'photo.jpg',
  url: 'blob:original',
  fileHandle: {} as FileSystemFileHandle,
  directoryHandle: {} as FileSystemDirectoryHandle,
  fileSizeText: '5 B',
  fileSize: 5,
  lastModified: 1,
  dateKey: '2026-11-20',
  year: '2026',
  monthDay: '11月20日',
  displayDate: '2026年11月20日',
  timeText: '12:00',
  timestamp: 1,
  originalName: 'photo.jpg',
  trashName: 'deleted.jpg',
  deletedAt: 1,
  wasFavorite: true,
  size: 5
} satisfies RecentlyDeletedPhoto

const props = {
  photos: [photo],
  selectedIds: new Set<string>(),
  thumbnailMode: 'wide' as const,
  thumbnailSize: 'small' as const,
  language: 'zh' as const,
  messages: messages.zh.trash
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('uses bounded thumbnails instead of original URLs, reuses them after remount and releases old size tiers', async () => {
  let sequence = 0
  const revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return `blob:thumbnail-${++sequence}`
      }
      static revokeObjectURL = revoke
    }
  )
  const generate = vi.fn(async () => new Blob(['thumbnail']))
  const cache = createPhotoThumbnailCache({ maxCount: 1, generate })
  const options = {
    props: { ...props, thumbnailCache: cache },
    global: { stubs: { WindowedPhotoBatch: { template: '<div><slot /></div>' } } }
  }
  let view = mount(RecentlyDeletedGrid, options)
  try {
    await vi.waitFor(() => expect(view.find('.lazy-photo-image img').exists()).toBe(true))
    expect(view.get('.lazy-photo-image img').attributes('src')).toBe('blob:thumbnail-1')
    expect(generate).toHaveBeenLastCalledWith(expect.objectContaining({ id: photo.id }), 512)
    expect(photo.url).toBe('blob:original')
    view.unmount()
    view = mount(RecentlyDeletedGrid, options)
    await vi.waitFor(() => expect(view.find('.lazy-photo-image img').exists()).toBe(true))
    expect(generate).toHaveBeenCalledTimes(1)
    await view.setProps({ thumbnailSize: 'large' })
    await vi.waitFor(() => expect(view.find('.lazy-photo-image img').exists()).toBe(true))
    expect(generate).toHaveBeenLastCalledWith(expect.objectContaining({ id: photo.id }), 1024)
    expect(view.get('.lazy-photo-image img').attributes('src')).toBe('blob:thumbnail-2')
    expect(revoke).toHaveBeenCalledWith('blob:thumbnail-1')
    expect(cache.stats().count).toBe(1)
  } finally {
    view.unmount()
    cache.dispose()
  }
  expect(revoke).toHaveBeenCalledWith('blob:thumbnail-2')
  expect(revoke).not.toHaveBeenCalledWith('blob:original')
})

it('recalculates offscreen batch heights when the ratio or thumbnail size changes', async () => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640)
  let columns = '208px 208px 208px'
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        gridTemplateColumns: columns,
        rowGap: '8px',
        columnGap: '8px',
        getPropertyValue: () => ''
      }) as unknown as CSSStyleDeclaration
  )
  const cache = createPhotoThumbnailCache()
  const view = mount(RecentlyDeletedGrid, {
    props: {
      ...props,
      thumbnailCache: cache,
      photos: Array.from({ length: 36 }, (_, index) => ({ ...photo, id: String(index) }))
    }
  })
  try {
    const batch = () => view.get('.trash-photo-grid').element as HTMLElement
    await nextTick()
    expect(batch().style.height).toBe('1586.5px')
    expect(view.find('.photo-card').exists()).toBe(false)
    await view.setProps({ thumbnailMode: 'standard' })
    expect(batch().style.height).toBe('2014px')
    columns = '316px 316px'
    await view.setProps({ thumbnailSize: 'large' })
    expect(batch().style.height).toBe('4483px')
  } finally {
    view.unmount()
    cache.dispose()
  }
})
