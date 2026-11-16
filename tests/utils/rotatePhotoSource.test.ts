import { beforeEach, expect, it, vi } from 'vitest'
import { setupOutfitDatabaseTests } from '../helpers/outfitDatabase'
import { rotateDirectoryPhoto, rotateStoredPhoto } from '../../src/utils/rotatePhotoSource'
import {
  runStoreRequest,
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  HOME_SCHEMES_STORE,
  HOME_IMAGES_STORE,
  CAMERA_FAVORITES_STORE,
  CAMERA_COVERS_STORE
} from '../../src/utils/file-system/database'
import { sha256Hex } from '../../src/utils/sha256'
import type { DirectoryPhotoItem } from '../../src/utils/photoGrouping'
import { rotateImageBlob } from '../../src/utils/imageRotation'

vi.mock('../../src/utils/imageRotation', () => ({ rotateImageBlob: vi.fn() }))
setupOutfitDatabaseTests()
const rotated = new Blob(['rotated'], { type: 'image/png' })
beforeEach(() => vi.mocked(rotateImageBlob).mockReset().mockResolvedValue(rotated))

function directoryPhoto() {
  let file = new File(['original'], 'photo.png', { lastModified: 100 })
  let pending: Blob
  const abort = vi.fn(async () => undefined)
  const write = vi.fn(async (blob: Blob) => {
    pending = blob
  })
  const close = vi.fn(async () => {
    file = new File([pending], 'photo.png', { lastModified: 200 })
  })
  const handle = {
    getFile: vi.fn(async () => file),
    createWritable: vi.fn(async () => ({ write, close, abort }))
  }
  const permission = vi.fn(async () => 'granted')
  const photo = {
    fileHandle: handle,
    directoryHandle: { queryPermission: permission },
    fileSize: file.size,
    lastModified: 100
  } as unknown as DirectoryPhotoItem
  return { photo, handle, permission, abort, close, file: () => file }
}
it('overwrites only after preparation and commits before returning the updated file', async () => {
  const test = directoryPhoto()
  expect((await rotateDirectoryPhoto(test.photo)).lastModified).toBe(200)
  expect(await test.file().text()).toBe('rotated')
  expect(test.handle.createWritable).toHaveBeenCalledWith({ keepExistingData: false })
})
it('does not open a writer when permission is denied or the preview is stale', async () => {
  const test = directoryPhoto()
  test.permission.mockResolvedValue('denied')
  test.photo.directoryHandle.requestPermission = vi.fn(async () => 'denied' as const)
  await expect(rotateDirectoryPhoto(test.photo)).rejects.toThrow('rotation_permission')
  expect(test.handle.createWritable).not.toHaveBeenCalled()
  test.permission.mockResolvedValue('granted')
  test.photo.lastModified = 99
  await expect(rotateDirectoryPhoto(test.photo)).rejects.toThrow('rotation_conflict')
  expect(test.handle.createWritable).not.toHaveBeenCalled()
})
it('aborts a failed commit without changing the original file', async () => {
  const test = directoryPhoto()
  test.close.mockRejectedValue(new Error('disk full'))
  await expect(rotateDirectoryPhoto(test.photo)).rejects.toThrow('disk full')
  expect(test.abort).toHaveBeenCalledOnce()
  expect(await test.file().text()).toBe('original')
})
it('detects an external edit while preparing the rotation', async () => {
  const test = directoryPhoto()
  vi.mocked(rotateImageBlob).mockImplementationOnce(async () => {
    test.handle.getFile.mockResolvedValue(
      new File(['changed!'], 'photo.png', { lastModified: 100 })
    )
    return rotated
  })
  await expect(rotateDirectoryPhoto(test.photo)).rejects.toThrow('rotation_conflict')
  expect(test.handle.createWritable).not.toHaveBeenCalled()
})
it.each([
  ['outfit', OUTFITS_STORE, OUTFIT_IMAGES_STORE],
  ['home', HOME_SCHEMES_STORE, HOME_IMAGES_STORE],
  ['camera', CAMERA_FAVORITES_STORE, CAMERA_COVERS_STORE]
] as const)(
  'atomically saves %s source and metadata; rejects stale repeat saves',
  async (kind, records, images) => {
    const blob = new Blob(['original'], { type: 'image/webp' }),
      id = 'test'
    const sha256 = await sha256Hex(await blob.arrayBuffer())
    const record = {
      id,
      updatedAt: '2026-01-01T00:00:00.000Z',
      image: 'test.webp',
      code: 'CODE',
      note: 'keep',
      ...(kind === 'camera'
        ? { cover: { name: 'cover.webp', size: blob.size, type: blob.type, sha256 } }
        : {})
    }
    await runStoreRequest(records, 'readwrite', (s) => s.put(record))
    await runStoreRequest(images, 'readwrite', (s) =>
      kind === 'camera' ? s.put(blob, id) : s.put({ id, blob, size: blob.size, sha256 })
    )
    await rotateStoredPhoto(kind, id, record.updatedAt)
    const next = await runStoreRequest<any>(records, 'readonly', (s) => s.get(id))
    const nextImage = await runStoreRequest<any>(images, 'readonly', (s) => s.get(id))
    expect(next.note).toBe('keep')
    expect(next.code).toBe('CODE')
    expect(next.updatedAt).not.toBe(record.updatedAt)
    expect(await (kind === 'camera' ? nextImage : nextImage.blob).text()).toBe('rotated')
    expect(kind === 'camera' ? next.cover.type : next.image).toBe(
      kind === 'camera' ? 'image/png' : 'test.png'
    )
    await expect(rotateStoredPhoto(kind, id, record.updatedAt)).rejects.toThrow('rotation_conflict')
  }
)
