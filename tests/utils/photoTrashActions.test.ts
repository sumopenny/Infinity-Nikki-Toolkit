import { beforeEach, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { usePhotoTrashActions } from '../../src/composables/usePhotoTrashActions'
import { messages } from '../../src/i18n'
import type { ActiveOperation, StatusState } from '../../src/composables/useOperationNotice'
import type {
  PhotoDisplayItem,
  PhotoItem,
  RecentlyDeletedPhoto
} from '../../src/utils/photoGrouping'
import {
  movePhotosToRecentlyDeleted,
  restoreRecentlyDeletedPhotos,
  permanentlyDeleteRecentlyDeleted,
  clearRecentlyDeleted
} from '../../src/utils/file-system/trashFileSystem'
import { releasePhotoUrl } from '../../src/utils/file-system/photoUrl'

vi.mock('../../src/utils/file-system/trashFileSystem', () => ({
  movePhotosToRecentlyDeleted: vi.fn(),
  restoreRecentlyDeletedPhotos: vi.fn(),
  permanentlyDeleteRecentlyDeleted: vi.fn(),
  clearRecentlyDeleted: vi.fn()
}))
vi.mock('../../src/utils/file-system/photoUrl', () => ({ releasePhotoUrl: vi.fn() }))
beforeEach(() => vi.resetAllMocks())

function photo(id: string): PhotoItem {
  return { id, name: `${id}.jpg`, timestamp: 1, url: null } as PhotoItem
}
function trash(id: string): RecentlyDeletedPhoto {
  return {
    ...photo(id),
    trashName: `${id}-trash`,
    deletedAt: 1,
    wasFavorite: true
  } as RecentlyDeletedPhoto
}
function setup() {
  const photos = ref<PhotoItem[]>([photo('a'), photo('b')])
  const recentlyDeleted = ref<RecentlyDeletedPhoto[]>([])
  const selectedIds = ref(new Set(['a', 'b']))
  const trashSelectedIds = ref(new Set<string>())
  const favoriteIds = ref(new Set(['a', 'b', 'other-album']))
  const currentPreview = ref<PhotoDisplayItem | null>(photos.value[0])
  const activeOperation = ref<ActiveOperation | null>(null)
  const statusState = ref<StatusState>({ type: 'initial' })
  const confirm = vi.fn(async () => true)
  const actions = usePhotoTrashActions({
    photos,
    recentlyDeleted,
    selectedIds,
    trashSelectedIds,
    favoriteIds,
    currentPreview,
    activeOperation,
    statusState,
    albumDirectoryHandle: ref({ name: 'Album' } as FileSystemDirectoryHandle),
    visiblePhotos: computed(() => photos.value),
    currentPreviewIndex: computed(() => 0),
    locale: computed(() => messages.zh),
    isAnyFileOperationBusy: computed(() => activeOperation.value !== null),
    createErrorStatus: () => ({ type: 'readFailed' }),
    openConfirmDialog: confirm
  })
  return {
    actions,
    photos,
    recentlyDeleted,
    selectedIds,
    trashSelectedIds,
    favoriteIds,
    currentPreview,
    activeOperation,
    statusState,
    confirm
  }
}

it('updates only successfully moved photos, preserves failed selections and advances the preview', async () => {
  const s = setup()
  vi.mocked(movePhotosToRecentlyDeleted).mockResolvedValue({
    succeeded: [s.photos.value[0]!],
    movedPhotos: [trash('ta')],
    failedNames: ['b.jpg']
  })
  await s.actions.movePhotosToTrash(s.photos.value, true)
  expect(s.photos.value.map((p) => p.id)).toEqual(['b'])
  expect([...s.selectedIds.value]).toEqual(['b'])
  expect([...s.favoriteIds.value]).toEqual(['b', 'other-album'])
  expect(s.currentPreview.value?.id).toBe('b')
  expect(s.recentlyDeleted.value.map((p) => p.id)).toEqual(['ta'])
  expect(s.activeOperation.value).toBeNull()
  expect(s.statusState.value).toMatchObject({ tone: 'warning' })
})

it('restores favorites and keeps failed trash entries selected', async () => {
  const s = setup()
  s.recentlyDeleted.value = [trash('ta'), trash('tb')]
  s.trashSelectedIds.value = new Set(['ta', 'tb'])
  s.currentPreview.value = s.recentlyDeleted.value[0]!
  vi.mocked(restoreRecentlyDeletedPhotos).mockResolvedValue({
    succeeded: [s.recentlyDeleted.value[0]!],
    restoredPhotos: [photo('restored')],
    failedNames: ['tb.jpg']
  })
  await s.actions.restoreTrashPhotos(s.recentlyDeleted.value, true)
  expect(s.recentlyDeleted.value.map((p) => p.id)).toEqual(['tb'])
  expect([...s.trashSelectedIds.value]).toEqual(['tb'])
  expect(s.favoriteIds.value.has('restored')).toBe(true)
  expect(s.currentPreview.value?.id).toBe('tb')
  expect(s.activeOperation.value).toBeNull()
})

it('does not mutate files or state when deletion is cancelled or another operation is busy', async () => {
  const s = setup()
  s.confirm.mockResolvedValue(false)
  await s.actions.movePhotosToTrash(s.photos.value)
  await s.actions.permanentlyDeleteTrashPhotos([trash('ta')])
  expect(movePhotosToRecentlyDeleted).not.toHaveBeenCalled()
  expect(permanentlyDeleteRecentlyDeleted).not.toHaveBeenCalled()
  s.activeOperation.value = 'all-data-backup'
  await s.actions.restoreTrashPhotos([trash('ta')])
  expect(restoreRecentlyDeletedPhotos).not.toHaveBeenCalled()
  expect(s.photos.value).toHaveLength(2)
})

it('confirms clear-all once and preserves failed entries and their selection', async () => {
  const s = setup()
  s.recentlyDeleted.value = [trash('ta'), trash('tb')]
  s.trashSelectedIds.value = new Set(['ta', 'tb'])
  vi.mocked(clearRecentlyDeleted).mockResolvedValue({
    succeeded: [s.recentlyDeleted.value[0]!],
    failedNames: ['tb.jpg']
  })
  await s.actions.deleteAllTrash()
  expect(s.confirm).toHaveBeenCalledTimes(1)
  expect(clearRecentlyDeleted).toHaveBeenCalledTimes(1)
  expect(permanentlyDeleteRecentlyDeleted).not.toHaveBeenCalled()
  expect(s.recentlyDeleted.value.map((p) => p.id)).toEqual(['tb'])
  expect([...s.trashSelectedIds.value]).toEqual(['tb'])
})

it('reports deletion failure without dropping state or retaining the operation lock', async () => {
  const s = setup()
  s.recentlyDeleted.value = [trash('ta')]
  vi.mocked(permanentlyDeleteRecentlyDeleted).mockRejectedValue(new Error('permission denied'))
  await s.actions.permanentlyDeleteTrashPhotos(s.recentlyDeleted.value)
  expect(s.recentlyDeleted.value).toHaveLength(1)
  expect(s.statusState.value.type).toBe('readFailed')
  expect(s.activeOperation.value).toBeNull()
})

it('reuses retained trash objects and releases URLs for removed entries during refresh', () => {
  const s = setup()
  s.recentlyDeleted.value = [trash('ta'), trash('tb')]
  const retained = s.recentlyDeleted.value[0]!
  const removed = s.recentlyDeleted.value[1]!
  s.trashSelectedIds.value = new Set(['ta', 'tb'])
  s.actions.mergeRecentlyDeleted([
    {
      ...trash('ta'),
      size: 500,
      fileSizeText: '500 B',
      note: 'recovered',
      noteKey: 'trash/ta',
      lastModified: 123
    }
  ])
  expect(s.recentlyDeleted.value[0]).toBe(retained)
  expect(retained.size).toBe(500)
  expect(retained.note).toBe('recovered')
  expect(retained.noteKey).toBe('trash/ta')
  expect(retained.lastModified).toBe(123)
  expect(releasePhotoUrl).toHaveBeenCalledTimes(1)
  expect(releasePhotoUrl).toHaveBeenCalledWith(removed)
  expect([...s.trashSelectedIds.value]).toEqual(['ta'])
})
