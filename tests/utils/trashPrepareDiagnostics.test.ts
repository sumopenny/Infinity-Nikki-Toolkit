import { expect, it, vi, afterEach } from 'vitest'
import { movePhotosToRecentlyDeleted } from '../../src/utils/file-system/trashFileSystem'
import { readAlbumMetadata } from '../../src/utils/file-system/photoMetadata'
import { diagnosticMetadata } from '../../src/utils/errorReporting/errorReporter'
import type { PhotoItem } from '../../src/utils/photoGrouping'
vi.mock('../../src/utils/file-system/photoMetadata', async (original) => ({
  ...(await original<object>()),
  readAlbumMetadata: vi.fn()
}))
afterEach(() => vi.resetAllMocks())
it.each(['read-metadata', 'create-trash-directory'])(
  'annotates %s without retaining names or paths',
  async (stage) => {
    const error = new DOMException('write denied', 'NoModificationAllowedError')
    const directory = { getDirectoryHandle: vi.fn().mockRejectedValue(error) }
    vi.mocked(readAlbumMetadata).mockImplementation(async () => {
      if (stage === 'read-metadata') throw error
      return {} as never
    })
    const photo = { name: 'private-photo.jpg', directoryHandle: directory } as unknown as PhotoItem
    await expect(movePhotosToRecentlyDeleted([photo], new Set())).rejects.toBe(error)
    expect(diagnosticMetadata(error)).toMatchObject({ stage, context: { targetCount: 1 } })
    expect(JSON.stringify(diagnosticMetadata(error))).not.toContain('private-photo')
  }
)
