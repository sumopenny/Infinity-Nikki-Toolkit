import { computed, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useOutfitWorkspace } from '../../src/composables/useOutfitWorkspace'
import { useOperationNotice } from '../../src/composables/useOperationNotice'
import { messages } from '../../src/i18n'

vi.mock('../../src/utils/outfit/outfitBackup', () => ({ exportOutfitBackup: vi.fn() }))
import { exportOutfitBackup } from '../../src/utils/outfit/outfitBackup'

afterEach(() => vi.restoreAllMocks())

it.each([false, true])('retires the outfit export loading notice on failure=%s', async (fails) => {
  const notice = useOperationNotice(computed(() => messages.zh))
  let finish!: () => void
  vi.mocked(exportOutfitBackup).mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        finish = () =>
          fails
            ? reject(new Error('Export failed'))
            : resolve({ fileNames: ['backup.zip'], count: 1 })
      })
  )
  const options = {
    activeOperation: ref(null),
    isAnyFileOperationBusy: ref(false),
    outfits: ref([{}]),
    outfitTags: ref([]),
    outfitLocale: computed(() => ({
      exporting: 'Generating',
      operations: { exportSucceeded: () => 'Exported' }
    })),
    publishStatus: notice.publishStatus,
    showOutfitStatus: (message: string, tone: 'info', loading: boolean, source?: string) =>
      notice.showStatus({ message, tone, loading, source }),
    showOutfitStorageError: (_error: unknown, source?: string) =>
      notice.showStatus({ message: 'Failed', tone: 'error', source })
  } as unknown as Parameters<typeof useOutfitWorkspace>[0]
  const workspace = useOutfitWorkspace(options)
  const pending = workspace.exportOutfits()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  expect(notice.notices.value.some((item) => item.loading)).toBe(true)
  finish()
  await pending
  expect(notice.notices.value).toHaveLength(1)
  expect(notice.notices.value[0]).toMatchObject({
    loading: false,
    source: 'outfits-export',
    message: fails ? 'Failed' : 'Exported'
  })
  notice.dispose()
})
