// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useDirectoryRefresh } from '../../src/composables/useDirectoryRefresh'
import { messages } from '../../src/i18n'
import { refreshAlbumPhotos } from '../../src/utils/file-system/albumFileSystem'
import { listRecentlyDeleted } from '../../src/utils/file-system/trashFileSystem'
import type { ActiveOperation, StatusState } from '../../src/composables/useOperationNotice'
vi.mock('../../src/utils/file-system/albumFileSystem', () => ({ refreshAlbumPhotos: vi.fn() }))
vi.mock('../../src/utils/file-system/trashFileSystem', () => ({ listRecentlyDeleted: vi.fn() }))
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  vi.useRealTimers()
  vi.resetAllMocks()
})
function setup() {
  const apply = vi.fn(),
    refreshCollections = vi.fn(async () => {})
  const directory = ref<FileSystemDirectoryHandle | null>({
    name: 'album'
  } as FileSystemDirectoryHandle)
  const statusState = ref<StatusState>({ type: 'initial' })
  let session!: ReturnType<typeof useDirectoryRefresh>
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          session = useDirectoryRefresh({
            directory: () => directory.value,
            photos: () => [],
            blocked: () => false,
            editorOpen: () => false,
            refreshingMessage: () => 'refreshing',
            locale: computed(() => messages.zh),
            activeOperation: ref<ActiveOperation | null>(null),
            publishStatus: (status) => {
              statusState.value = status
            },
            apply,
            refreshCollections,
            createErrorStatus: () => ({ type: 'readFailed' })
          })
          return () => null
        }
      })
    )
  )
  vi.mocked(listRecentlyDeleted).mockResolvedValue([])
  return { session, apply, directory, statusState, refreshCollections }
}
it('discards an in-flight scan after the directory session is invalidated', async () => {
  const { session, apply } = setup()
  let finish!: (result: Awaited<ReturnType<typeof refreshAlbumPhotos>>) => void
  vi.mocked(refreshAlbumPhotos).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const job = session.refreshAlbum(false)
  session.invalidatePendingRefreshes()
  finish({
    directoryName: 'album',
    directoryHandle: {} as FileSystemDirectoryHandle,
    photos: [],
    addedCount: 0,
    removedCount: 0,
    removedPhotos: [],
    replacedPhotos: []
  })
  await job
  expect(apply).not.toHaveBeenCalled()
})
it('invalidates queued focus refresh and releases it on unmount', async () => {
  vi.useFakeTimers()
  const { session, refreshCollections, directory } = setup()
  directory.value = null
  session.scheduleFocusRefresh()
  session.invalidatePendingRefreshes()
  await vi.advanceTimersByTimeAsync(500)
  expect(refreshCollections).not.toHaveBeenCalled()
  session.scheduleFocusRefresh()
  wrappers[0].unmount()
  wrappers.length = 0
  await vi.advanceTimersByTimeAsync(500)
  expect(refreshCollections).not.toHaveBeenCalled()
})
