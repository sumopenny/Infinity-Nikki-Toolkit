// @vitest-environment jsdom
import { computed, ref } from 'vue'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useDirectorySession, type DirectoryState } from '../../src/composables/useDirectorySession'
import type { ActiveOperation } from '../../src/composables/useOperationNotice'
import { messages } from '../../src/i18n'
import {
  getSavedAlbumDirectoryHandle,
  readAlbumDirectory,
  pickAlbumDirectory
} from '../../src/utils/file-system/albumFileSystem'
import { getSavedX6GameDirectoryHandle } from '../../src/utils/file-system/directoryStorage'

vi.mock('../../src/utils/file-system/albumFileSystem', async (original) => {
  const actual = await original<typeof import('../../src/utils/file-system/albumFileSystem')>()
  return {
    ...actual,
    getSavedAlbumDirectoryHandle: vi.fn(),
    readAlbumDirectory: vi.fn(actual.readAlbumDirectory),
    pickAlbumDirectory: vi.fn()
  }
})
vi.mock('../../src/utils/file-system/directoryStorage', async (original) => ({
  ...(await original<typeof import('../../src/utils/file-system/directoryStorage')>()),
  getSavedX6GameDirectoryHandle: vi.fn()
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

function setup(language: 'zh' | 'en' = 'zh') {
  const activeOperation = ref<ActiveOperation | null>(null)
  const busy = computed(() => activeOperation.value !== null)
  const publishStatus = vi.fn()
  const replaceAlbum = vi.fn(async () => {})
  const hasX6GameAuthorization = ref(false)
  const createErrorStatus = vi.fn(() => ({ type: 'restoreFailed' as const }))
  const session = useDirectorySession({
    language: ref(language),
    activeOperation,
    isAnyFileOperationBusy: busy,
    publishStatus,
    locale: computed(() => messages[language]),
    directoryState: ref<DirectoryState>({ type: 'none' }),
    photos: ref([]),
    hasX6GameAuthorization,
    replaceAlbum,
    createErrorStatus
  })
  return { session, busy, publishStatus, replaceAlbum, hasX6GameAuthorization, createErrorStatus }
}

it.each(['zh', 'en'] as const)(
  'times out startup in %s and bypasses the old handle on the next selection',
  async (language) => {
    let finish!: (state: PermissionState) => void
    const requestPermission = vi.fn()
    const old = {
      name: 'album',
      queryPermission: vi.fn(
        () =>
          new Promise<PermissionState>((resolve) => {
            finish = resolve
          })
      ),
      requestPermission
    } as unknown as FileSystemDirectoryHandle
    vi.mocked(getSavedAlbumDirectoryHandle).mockResolvedValue(old)
    const { session, busy, publishStatus, replaceAlbum, createErrorStatus } = setup(language)
    const restore = session.restoreSavedDirectory()
    await vi.advanceTimersByTimeAsync(2999)
    expect(busy.value).toBe(true)
    expect(publishStatus).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await restore
    expect(busy.value).toBe(false)
    expect(publishStatus).toHaveBeenCalledWith({
      type: 'custom',
      message: messages[language].fileSystem.permissionQueryTimeout,
      tone: 'info'
    })
    expect(createErrorStatus).not.toHaveBeenCalled()
    finish('granted')
    await Promise.resolve()
    expect(replaceAlbum).not.toHaveBeenCalled()
    const result = {
      directoryName: 'new',
      directoryHandle: {} as FileSystemDirectoryHandle,
      photos: []
    }
    vi.mocked(pickAlbumDirectory).mockResolvedValue(result)
    await session.chooseDirectory()
    expect(getSavedAlbumDirectoryHandle).toHaveBeenCalledTimes(1)
    expect(readAlbumDirectory).toHaveBeenCalledTimes(1)
    expect(pickAlbumDirectory).toHaveBeenCalledTimes(1)
    expect(requestPermission).not.toHaveBeenCalled()
    expect(replaceAlbum).toHaveBeenCalledWith(result, expect.objectContaining({ type: 'success' }))
    expect(busy.value).toBe(false)
  }
)

it('bounds the independent X6Game startup query', async () => {
  vi.mocked(getSavedX6GameDirectoryHandle).mockResolvedValue({
    name: 'X6Game',
    queryPermission: () => new Promise(() => {})
  } as unknown as FileSystemDirectoryHandle)
  const { session, publishStatus, hasX6GameAuthorization } = setup()
  const restore = session.restoreSavedX6GameAuthorization()
  await vi.advanceTimersByTimeAsync(3000)
  await restore
  expect(hasX6GameAuthorization.value).toBe(false)
  expect(publishStatus).toHaveBeenCalledWith({
    type: 'custom',
    message: messages.zh.fileSystem.permissionQueryTimeout,
    tone: 'info'
  })
})

it('does not classify a normal permission prompt as a timeout', async () => {
  vi.mocked(getSavedAlbumDirectoryHandle).mockResolvedValue({
    name: 'album',
    queryPermission: async () => 'prompt'
  } as FileSystemDirectoryHandle)
  const { session, publishStatus, createErrorStatus, busy } = setup()
  await session.restoreSavedDirectory()
  expect(createErrorStatus).toHaveBeenCalled()
  expect(publishStatus).toHaveBeenCalledWith({ type: 'restoreFailed' })
  expect(busy.value).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it('allows directory scanning to take longer than three seconds after permission succeeds', async () => {
  let finish!: () => void
  const handle = {
    name: 'album',
    queryPermission: async () => 'granted',
    getFileHandle: async () => {
      throw new DOMException('missing', 'NotFoundError')
    },
    async *entries() {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    }
  } as unknown as FileSystemDirectoryHandle
  vi.mocked(getSavedAlbumDirectoryHandle).mockResolvedValue(handle)
  const { session, busy, publishStatus, replaceAlbum } = setup()
  const restore = session.restoreSavedDirectory()
  await vi.advanceTimersByTimeAsync(5000)
  expect(busy.value).toBe(true)
  expect(publishStatus).not.toHaveBeenCalled()
  finish()
  await restore
  expect(replaceAlbum).toHaveBeenCalled()
  expect(busy.value).toBe(false)
})
