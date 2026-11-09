import { describe, expect, it } from 'vitest'
import type { PhotoItem } from '../../src/utils/photoGrouping'
import { preparePhotoTransfer, runPhotoTransfer } from '../../src/utils/file-system/photoTransfer'

class TestFileHandle implements FileSystemFileHandle {
  readonly kind = 'file' as const
  private data: Blob
  constructor(
    public readonly name: string,
    data = new Blob(['x'], { type: 'image/jpeg' }),
    private readonly fail = false
  ) {
    this.data = data
  }
  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return other === this
  }
  async getFile(): Promise<File> {
    if (this.fail) throw new Error('read failed')
    return new File([this.data], this.name, { type: this.data.type, lastModified: 1 })
  }
  async createWritable(): Promise<FileSystemWritableFileStream> {
    return {
      write: async (value: Blob | BufferSource | string) => {
        this.data = value instanceof Blob ? value : new Blob([value])
      },
      close: async () => undefined,
      abort: async () => undefined
    } as FileSystemWritableFileStream
  }
}

class TestDirectory implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const
  readonly files = new Map<string, TestFileHandle>()
  constructor(public readonly name: string) {}
  async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return other === this
  }
  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const [name, handle] of this.files) yield [name, handle as unknown as FileSystemHandle]
  }
  values(): AsyncIterableIterator<FileSystemHandle> {
    return this.entriesAsValues()
  }
  private async *entriesAsValues() {
    for await (const [, handle] of this.entries()) yield handle
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    const existing = this.files.get(name)
    if (existing) return existing
    if (!options?.create) throw new DOMException('missing', 'NotFoundError')
    const handle = new TestFileHandle(name, new Blob())
    this.files.set(name, handle)
    return handle
  }
  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
    throw new DOMException('missing', 'NotFoundError')
  }
  async removeEntry(name: string): Promise<void> {
    this.files.delete(name)
  }
  async resolve(): Promise<string[] | null> {
    return null
  }
}

function photo(directory: TestDirectory, name: string, timestamp: number, fail = false): PhotoItem {
  const handle = new TestFileHandle(name, undefined, fail)
  directory.files.set(name, handle)
  return {
    id: name,
    name,
    url: null,
    fileSizeText: '1 B',
    fileSize: 1,
    lastModified: 1,
    fileHandle: handle,
    directoryHandle: directory,
    note: '',
    dateKey: '2026-01-01',
    year: '2026',
    monthDay: '01月01日',
    displayDate: '2026年01月01日',
    timeText: '00:00',
    timestamp
  }
}

describe('photo transfer', () => {
  it('imports supported files and allocates duplicate names', async () => {
    const directory = new TestDirectory('album')
    directory.files.set('a.jpg', new TestFileHandle('a.jpg'))
    const prepared = await preparePhotoTransfer(directory, {
      kind: 'import',
      files: [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.png', { type: 'image/png' }),
        new File(['x'], 'note.txt')
      ]
    })
    const result = await runPhotoTransfer(directory, prepared)
    expect(result.succeeded).toBe(2)
    expect([...directory.files.keys()]).toEqual(
      expect.arrayContaining(['a.jpg', 'a_imported_1.jpg', 'b.png'])
    )
  })

  it('exports concurrently and keeps successful files when cancelled', async () => {
    const source = new TestDirectory('source')
    const target = new TestDirectory('target')
    const controller = new AbortController()
    const prepared = await preparePhotoTransfer(target, {
      kind: 'export',
      photos: [photo(source, '1.jpg', 1), photo(source, '2.jpg', 2), photo(source, '3.jpg', 3)]
    })
    const result = await runPhotoTransfer(target, prepared, {
      concurrency: 8,
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.completed === 1) controller.abort()
      }
    })
    expect(result.cancelled).toBe(true)
    expect(result.succeeded).toBeGreaterThanOrEqual(1)
    expect(target.files.size).toBe(result.succeeded)
  })
})

it('allocates case-insensitive names for existing files and the same import batch', async () => {
  const dir = new TestDirectory('album')
  const original = new TestFileHandle('A.JPG')
  dir.files.set('A.JPG', original)
  const prepared = await preparePhotoTransfer(dir, {
    kind: 'import',
    files: [new File(['new'], 'a.jpg'), new File(['next'], 'a.JPG')]
  })
  const result = await runPhotoTransfer(dir, prepared)
  expect(result.succeeded).toBe(2)
  expect(dir.files.get('A.JPG')).toBe(original)
  expect([...dir.files.keys()]).toEqual(['A.JPG', 'a_imported_1.jpg', 'a_imported_2.JPG'])
})
it('preserves a destination that appears after preparation, including on failure', async () => {
  const dir = new TestDirectory('album')
  const prepared = await preparePhotoTransfer(dir, {
    kind: 'import',
    files: [new File(['new'], 'a.jpg')]
  })
  const original = new TestFileHandle('a.jpg')
  dir.files.set('a.jpg', original)
  const result = await runPhotoTransfer(dir, prepared)
  expect(result.succeeded).toBe(0)
  expect(result.failedNames).toEqual(['a.jpg'])
  expect(dir.files.get('a.jpg')).toBe(original)
})
it('removes only a new empty placeholder when opening a writer fails', async () => {
  const dir = new TestDirectory('album')
  const get = dir.getFileHandle.bind(dir)
  dir.getFileHandle = async (name, options) => {
    const handle = await get(name, options)
    if (options?.create)
      handle.createWritable = async () => {
        throw new Error('write denied')
      }
    return handle
  }
  const prepared = await preparePhotoTransfer(dir, {
    kind: 'import',
    files: [new File(['new'], 'a.jpg')]
  })
  expect((await runPhotoTransfer(dir, prepared)).succeeded).toBe(0)
  expect(dir.files.size).toBe(0)
})

it('serializes prepared transfers so concurrent same-name writes cannot both succeed', async () => {
  const directory = new TestDirectory('album')
  const [first, second] = await Promise.all([
    preparePhotoTransfer(directory, { kind: 'import', files: [new File(['first'], 'same.png')] }),
    preparePhotoTransfer(directory, { kind: 'import', files: [new File(['second'], 'same.png')] })
  ])
  const results = await Promise.all([
    runPhotoTransfer(directory, first),
    runPhotoTransfer(directory, second)
  ])
  expect(results.map((result) => result.succeeded)).toEqual([1, 0])
  expect(results[1].failedNames).toEqual(['same.png'])
  const content = await (await directory.files.get('same.png')!.getFile()).text()
  expect(content).toBe('first')
})

it('keeps a cancelled queued import from writing and permits the following batch', async () => {
  const directory = new TestDirectory('album')
  const prepare = (name: string) =>
    preparePhotoTransfer(directory, { kind: 'import', files: [new File([name], name)] })
  const [first, cancelled, last] = await Promise.all([
    prepare('first.png'),
    prepare('cancelled.png'),
    prepare('last.png')
  ])
  const controller = new AbortController()
  const firstRun = runPhotoTransfer(directory, first)
  const cancelledRun = runPhotoTransfer(directory, cancelled, { signal: controller.signal })
  controller.abort()
  expect((await firstRun).succeeded).toBe(1)
  expect(await cancelledRun).toMatchObject({ cancelled: true, succeeded: 0, completed: 0 })
  expect((await runPhotoTransfer(directory, last)).succeeded).toBe(1)
  expect([...directory.files.keys()]).toEqual(['first.png', 'last.png'])
})
