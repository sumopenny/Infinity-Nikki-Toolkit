import { describe, expect, it, vi } from 'vitest'
import { File as NodeFile, Blob as NodeBlob } from 'node:buffer'
import { unzipSync, strFromU8 } from 'fflate'
import { readCompatibleAlbum } from '../../src/utils/file-system/compatibleAlbum'
import { readPhotoBlob } from '../../src/utils/file-system/photoUrl'
import { movePhotosToRecentlyDeleted } from '../../src/utils/file-system/trashFileSystem'
import { exportCompatiblePhotos } from '../../src/utils/file-system/compatiblePhotoExport'

function file(path: string, contents = 'image', lastModified = 1000): File {
  const file = new NodeFile([contents], path.split('/').at(-1)!, { lastModified })
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file as unknown as File
}

describe('compatible album snapshots', () => {
  it('loads only root images and existing notes without reading image bytes', async () => {
    const image = file('相册 1/2026_04_26_21_05_24.jpeg')
    const bytes = vi.spyOn(image, 'arrayBuffer')
    const result = await readCompatibleAlbum([
      image,
      file('相册 1/trash/deleted.jpg'),
      file('相册 1/nested/hidden.png'),
      file(
        '相册 1/album-metadata.json',
        JSON.stringify({ version: 1, photos: { [image.name]: { note: '测试备注' } } })
      )
    ])
    expect(result.directoryName).toBe('相册 1')
    expect(result.photos).toHaveLength(1)
    expect(result.photos[0]).toMatchObject({
      source: 'file',
      note: '测试备注',
      dateKey: '2026-04-26',
      url: null
    })
    expect(bytes).not.toHaveBeenCalled()
    expect(await readPhotoBlob(result.photos[0])).toBe(image)
  })

  it('reuses snapshot identity and invalidates changed names, sizes and timestamps', async () => {
    const id = async (input: File) => (await readCompatibleAlbum([input])).photos[0].id
    const original = await id(file('a/photo.jpg'))
    expect(await id(file('a/photo.jpg'))).toBe(original)
    expect(await id(file('b/photo.jpg'))).not.toBe(original)
    expect(await id(file('a/photo.jpg', 'new bytes'))).not.toBe(original)
    expect(await id(file('a/photo.jpg', 'image', 2000))).not.toBe(original)
  })

  it('opens photos with malformed metadata but rejects unrelated roots', async () => {
    await expect(
      readCompatibleAlbum([file('a/photo.jpg'), file('a/album-metadata.json', '{')])
    ).resolves.toMatchObject({
      notes: { blocked: true, main: { state: 'invalid' } },
      photos: [{ name: 'photo.jpg' }]
    })
    await expect(readCompatibleAlbum([file('a/photo.jpg'), file('b/photo.jpg')])).rejects.toThrow()
    expect((await readCompatibleAlbum([file('a/trash/photo.jpg')])).photos).toEqual([])
  })

  it('rejects a mixed writable and read-only delete batch before creating a trash directory', async () => {
    const photo = (await readCompatibleAlbum([file('a/photo.jpg')])).photos[0]
    const getDirectoryHandle = vi.fn()
    const writable = {
      ...photo,
      source: 'directory' as const,
      fileHandle: { getFile: vi.fn() },
      directoryHandle: { getDirectoryHandle }
    }
    await expect(
      movePhotosToRecentlyDeleted([writable as never, photo], new Set())
    ).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(getDirectoryHandle).not.toHaveBeenCalled()
  })

  it('exports original bytes and notes in a downloadable ZIP without directory access', async () => {
    const photos = (await readCompatibleAlbum([file('a/photo.jpg', 'original photo bytes')])).photos
    photos[0].note = '备注'
    const parts: File[] = []
    const progress = vi.fn()
    const originalFile = globalThis.File
    const originalBlob = globalThis.Blob
    vi.stubGlobal('File', NodeFile)
    vi.stubGlobal('Blob', NodeBlob)
    try {
      await exportCompatiblePhotos(
        photos,
        new AbortController().signal,
        (part) => parts.push(part),
        progress
      )
      const entries = unzipSync(new Uint8Array(await parts[0].arrayBuffer()))
      expect(strFromU8(entries['photo.jpg'])).toBe('original photo bytes')
      expect(JSON.parse(strFromU8(entries['album-metadata.json']))).toEqual({
        version: 1,
        photos: { 'photo.jpg': { note: '备注' } }
      })
      expect(progress).toHaveBeenLastCalledWith(1)
    } finally {
      vi.stubGlobal('File', originalFile)
      vi.stubGlobal('Blob', originalBlob)
    }
  })

  it('cancels export before delivering a download', async () => {
    const photos = (await readCompatibleAlbum([file('a/photo.jpg')])).photos
    const controller = new AbortController()
    controller.abort()
    const onPart = vi.fn()
    await expect(
      exportCompatiblePhotos(photos, controller.signal, onPart, vi.fn())
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(onPart).not.toHaveBeenCalled()
  })
})
it('previews a verified legacy swap and preserves good entries in a partial original', async () => {
  const photo = file('album/a.jpg')
  const swap = file(
    'album/album-metadata.json.crswap',
    '{"version":1,"photos":{"a.jpg":{"note":"copy"},"trash/example.jpg":{"note":""}}}'
  )
  const incident = await readCompatibleAlbum([photo, file('album/album-metadata.json', ''), swap])
  expect(incident).toMatchObject({
    photos: [{ note: 'copy' }],
    notes: { blocked: true, previewName: swap.name }
  })
  const partial = await readCompatibleAlbum([
    photo,
    file('album/album-metadata.json', '{"photos":{"a.jpg":{"note":"mine"},"bad":42}}'),
    swap
  ])
  expect(partial).toMatchObject({
    photos: [{ note: 'mine' }],
    notes: { main: { state: 'partial', badEntries: 1 } }
  })
  const unknown = await readCompatibleAlbum([
    photo,
    file('album/album-metadata.json', '{"version":2,"photos":{}}')
  ])
  expect(unknown.notes.main.state).toBe('unsupported')
})
