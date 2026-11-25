// @vitest-environment jsdom
import { computed, ref, shallowRef } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  useDirectorySession,
  type DirectoryState,
  type GameAlbumBinding
} from '../../src/composables/useDirectorySession'
import type { ActiveOperation } from '../../src/composables/useOperationNotice'
import { messages } from '../../src/i18n'
import { gameAlbumMessages } from '../../src/i18n/messages/gameAlbum'
import {
  getSavedAlbumDirectoryHandle,
  readAlbumDirectory
} from '../../src/utils/file-system/albumFileSystem'
import {
  getSavedGameAlbumUid,
  getSavedX6GameDirectoryHandle
} from '../../src/utils/file-system/directoryStorage'

vi.mock('../../src/utils/file-system/albumFileSystem', () => ({
  getSavedAlbumDirectoryHandle: vi.fn(),
  readAlbumDirectory: vi.fn(),
  pickAlbumDirectory: vi.fn()
}))
vi.mock('../../src/utils/file-system/directoryStorage', () => ({
  getSavedGameAlbumUid: vi.fn(),
  getSavedX6GameDirectoryHandle: vi.fn()
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  localStorage.clear()
  vi.mocked(getSavedX6GameDirectoryHandle).mockResolvedValue(null)
})
afterEach(() => vi.useRealTimers())

function setup(language: 'zh' | 'en' = 'zh') {
  const activeOperation = ref<ActiveOperation | null>(null)
  const busy = computed(() => activeOperation.value !== null)
  const publishStatus = vi.fn()
  const replaceAlbum = vi.fn(async () => {})
  const session = useDirectorySession({
    language: ref(language),
    activeOperation,
    isAnyFileOperationBusy: busy,
    publishStatus,
    locale: computed(() => messages[language]),
    directoryState: ref<DirectoryState>({ type: 'none' }),
    gameAlbum: shallowRef<GameAlbumBinding | null>(null),
    authorizedGameDirectory: shallowRef<FileSystemDirectoryHandle | null>(null),
    replaceAlbum,
    createErrorStatus: () => ({ type: 'restoreFailed' })
  })
  return { session, busy, publishStatus, replaceAlbum }
}

it.each(['zh', 'en'] as const)(
  'guides a timed-out standalone album to reselection in %s and ignores late results',
  async (language) => {
    let finish!: (state: PermissionState) => void
    const requestPermission = vi.fn()
    const handle = {
      name: 'album',
      queryPermission: () =>
        new Promise<PermissionState>((resolve) => {
          finish = resolve
        }),
      requestPermission
    } as unknown as FileSystemDirectoryHandle
    vi.mocked(getSavedAlbumDirectoryHandle).mockResolvedValue(handle)
    const { session, busy, publishStatus, replaceAlbum } = setup(language)
    const restoring = session.restoreSavedDirectory()
    await vi.advanceTimersByTimeAsync(2999)
    expect(busy.value).toBe(true)
    expect(publishStatus).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await restoring
    expect(busy.value).toBe(false)
    expect(publishStatus).toHaveBeenLastCalledWith({
      type: 'custom',
      message: gameAlbumMessages[language].restoreTimeout,
      tone: 'info'
    })
    expect(session.canRestoreDirectory.value).toBe(false)
    await session.restoreDirectoryAccess()
    expect(requestPermission).not.toHaveBeenCalled()
    finish('granted')
    await Promise.resolve()
    expect(readAlbumDirectory).not.toHaveBeenCalled()
    expect(replaceAlbum).not.toHaveBeenCalled()
  }
)

it('preserves the timeout distinction for the shared X6Game permission promise', async () => {
  const root = {
    name: 'X6Game',
    queryPermission: () => new Promise(() => {})
  } as unknown as FileSystemDirectoryHandle
  vi.mocked(getSavedX6GameDirectoryHandle).mockResolvedValue(root)
  vi.mocked(getSavedGameAlbumUid).mockResolvedValue('123')
  vi.mocked(getSavedAlbumDirectoryHandle).mockResolvedValue({
    name: 'album'
  } as FileSystemDirectoryHandle)
  const { session, busy, publishStatus } = setup()
  const restoring = session.restoreSavedDirectory()
  await vi.advanceTimersByTimeAsync(3000)
  await restoring
  expect(busy.value).toBe(false)
  expect(session.canRestoreDirectory.value).toBe(false)
  expect(publishStatus).toHaveBeenCalledTimes(1)
  expect(publishStatus).toHaveBeenCalledWith({
    type: 'custom',
    message: gameAlbumMessages.zh.restoreTimeout,
    tone: 'info'
  })
})

it.each(['prompt', 'denied'] as const)(
  'keeps normal %s permissions on the manual restore path',
  async (state) => {
    vi.mocked(getSavedAlbumDirectoryHandle).mockResolvedValue({
      name: 'album',
      queryPermission: async () => state
    } as FileSystemDirectoryHandle)
    const { session, busy, publishStatus } = setup()
    await session.restoreSavedDirectory()
    expect(busy.value).toBe(false)
    expect(session.canRestoreDirectory.value).toBe(true)
    expect(publishStatus).toHaveBeenCalledTimes(1)
    expect(publishStatus).toHaveBeenCalledWith({
      type: 'custom',
      message: gameAlbumMessages.zh.restoreHint,
      tone: 'info'
    })
    expect(vi.getTimerCount()).toBe(0)
  }
)
