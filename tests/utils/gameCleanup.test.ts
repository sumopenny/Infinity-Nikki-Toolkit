// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, ref } from 'vue'
import { useGameCleanup } from '../../src/composables/useGameCleanup'
import { messages } from '../../src/i18n'
import type { ActiveOperation, StatusState } from '../../src/composables/useOperationNotice'
import {
  listGamePlayPhotoAccounts,
  resolveX6GameAccountDirectory
} from '../../src/utils/file-system/directoryAccess'
import {
  prepareSpecialCleanup,
  executeSpecialCleanup
} from '../../src/utils/file-system/cleanupFileSystem'

vi.mock('../../src/utils/file-system/directoryAccess', () => ({
  listGamePlayPhotoAccounts: vi.fn(),
  resolveX6GameAccountDirectory: vi.fn(),
  getX6GameDirectoryForAlbum: vi.fn(),
  pickStandaloneX6GameDirectory: vi.fn()
}))
vi.mock('../../src/utils/file-system/cleanupFileSystem', () => ({
  prepareSpecialCleanup: vi.fn(),
  executeSpecialCleanup: vi.fn(),
  prepareMatchingPhotoCleanup: vi.fn(),
  executeMatchingPhotoCleanup: vi.fn()
}))

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
})

function setup() {
  const activeOperation = ref<ActiveOperation | null>(null)
  const statusState = ref<StatusState>({ type: 'initial' })
  const albumDirectoryHandle = ref<FileSystemDirectoryHandle | null>(null)
  const confirm = vi.fn(async () => true)
  let cleanup!: ReturnType<typeof useGameCleanup>
  const wrapper = mount(
    defineComponent({
      setup() {
        cleanup = useGameCleanup({
          albumDirectoryHandle,
          activeOperation,
          publishStatus: (status) => {
            statusState.value = status
          },
          hasX6GameAuthorization: ref(false),
          language: ref('zh'),
          locale: computed(() => messages.zh),
          isAnyFileOperationBusy: computed(() => activeOperation.value !== null),
          createErrorStatus: () => ({ type: 'readFailed' }),
          openConfirmDialog: confirm
        })
        return () => null
      }
    })
  )
  cleanup.cleanupX6GameHandle.value = { name: 'X6Game' } as FileSystemDirectoryHandle
  return { cleanup, wrapper, activeOperation, statusState, albumDirectoryHandle, confirm }
}

it('cancels account selection without deleting files and releases the operation lock', async () => {
  vi.mocked(listGamePlayPhotoAccounts).mockResolvedValue(['a', 'b'])
  const { cleanup, wrapper, activeOperation } = setup()
  const task = cleanup.cleanSpecialItem('lowQuality')
  await flushPromises()
  expect(cleanup.showCleanupAccountDialog.value).toBe(true)
  expect(activeOperation.value).toBe('cleanup')
  cleanup.resolveCleanupAccounts(null)
  await task
  expect(prepareSpecialCleanup).not.toHaveBeenCalled()
  expect(executeSpecialCleanup).not.toHaveBeenCalled()
  expect(activeOperation.value).toBeNull()
  wrapper.unmount()
})

it('settles a pending account choice when the owner unmounts', async () => {
  vi.mocked(listGamePlayPhotoAccounts).mockResolvedValue(['a', 'b'])
  const { cleanup, wrapper, activeOperation } = setup()
  const task = cleanup.cleanSpecialItem('lowQuality')
  await flushPromises()
  wrapper.unmount()
  await task
  expect(activeOperation.value).toBeNull()
  expect(executeSpecialCleanup).not.toHaveBeenCalled()
})

it('passes the current album as a protected directory and releases the lock on failure', async () => {
  vi.mocked(resolveX6GameAccountDirectory).mockResolvedValue('a')
  vi.mocked(prepareSpecialCleanup).mockRejectedValue(new Error('read failed'))
  const { cleanup, wrapper, activeOperation, albumDirectoryHandle, statusState } = setup()
  albumDirectoryHandle.value = { name: 'Album' } as FileSystemDirectoryHandle
  await cleanup.cleanSpecialItem('lowQuality')
  expect(prepareSpecialCleanup).toHaveBeenCalledWith(
    cleanup.cleanupX6GameHandle.value,
    'lowQuality',
    ['a'],
    { skipDirectoryHandle: albumDirectoryHandle.value }
  )
  expect(activeOperation.value).toBeNull()
  expect(statusState.value.type).toBe('readFailed')
  expect(executeSpecialCleanup).not.toHaveBeenCalled()
  wrapper.unmount()
})
