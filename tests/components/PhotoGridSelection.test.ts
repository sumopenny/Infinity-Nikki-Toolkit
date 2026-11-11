import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PhotoGrid from '../../src/components/PhotoGrid.vue'
import RecentlyDeletedGrid from '../../src/components/RecentlyDeletedGrid.vue'
import { messages } from '../../src/i18n'
import type { DirectoryPhotoItem, RecentlyDeletedPhoto } from '../../src/utils/photoGrouping'

const photo: DirectoryPhotoItem = {
  id: 'photo',
  name: 'photo.jpg',
  url: null,
  fileSizeText: '1 MB',
  fileHandle: {} as FileSystemFileHandle,
  directoryHandle: {} as FileSystemDirectoryHandle,
  dateKey: '2026-11-11',
  year: '2026',
  monthDay: '11月11日',
  displayDate: '2026年11月11日',
  timeText: '09:55',
  timestamp: 0
}

it('photo grid previews on click and selects through the circle or Space', async () => {
  const view = mount(PhotoGrid, {
    props: {
      dateGroups: [
        {
          dateKey: photo.dateKey,
          year: photo.year,
          monthDay: photo.monthDay,
          displayDate: photo.displayDate,
          photos: [photo]
        }
      ],
      selectedIds: new Set<string>(),
      favoriteIds: new Set<string>(),
      thumbnailMode: 'wide',
      isFavoritesView: false,
      messages: messages.zh.grid
    },
    global: {
      stubs: { LazyPhotoImage: true, WindowedPhotoBatch: { template: '<div><slot /></div>' } }
    }
  })
  try {
    await view.get('.photo-frame').trigger('click')
    expect(view.emitted('openPreview')).toEqual([[photo]])
    expect(view.emitted('togglePhoto')).toBeUndefined()
    await view.get('.selected-badge').trigger('click')
    expect(view.emitted('togglePhoto')).toEqual([[photo.id]])
    await view.setProps({ selectedIds: new Set([photo.id]) })
    expect(view.get('.photo-card').classes()).toContain('selection-mode')
    await view.get('.photo-card').trigger('keydown', { key: ' ' })
    expect(view.emitted('togglePhoto')).toHaveLength(2)
    await view.setProps({ selectedIds: new Set() })
    expect(view.get('.photo-card').classes()).not.toContain('selection-mode')
  } finally {
    view.unmount()
  }
})

it('recently deleted uses the same preview and independent selection behavior', async () => {
  const deleted: RecentlyDeletedPhoto = {
    ...photo,
    trashName: 'trash.jpg',
    originalName: photo.name,
    deletedAt: 0,
    wasFavorite: false,
    size: 100
  }
  const view = mount(RecentlyDeletedGrid, {
    props: {
      photos: [deleted],
      selectedIds: new Set<string>(),
      thumbnailMode: 'wide',
      language: 'en',
      messages: messages.en.trash
    },
    global: {
      stubs: { LazyPhotoImage: true, WindowedPhotoBatch: { template: '<div><slot /></div>' } }
    }
  })
  try {
    await view.get('.photo-frame').trigger('click')
    expect(view.emitted('openPreview')).toEqual([[deleted]])
    expect(view.emitted('togglePhoto')).toBeUndefined()
    await view.get('.selected-badge').trigger('click')
    expect(view.emitted('togglePhoto')).toEqual([[deleted.id]])
    expect(view.get('.selected-badge').attributes('aria-label')).toBe('Select photo')
    await view.setProps({ selectedIds: new Set([deleted.id]) })
    expect(view.get('.selected-badge').attributes('aria-label')).toBe('Deselect photo')
  } finally {
    view.unmount()
  }
})
