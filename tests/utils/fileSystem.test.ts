import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { messages } from '../../src/i18n'
import { readAlbumMetadata, savePhotoNote } from '../../src/utils/file-system/photoMetadata'
import type { PhotoItem } from '../../src/utils/photoGrouping'
import {
  pickAlbumDirectory,
  readAlbumDirectory,
  refreshAlbumDirectory
} from '../../src/utils/file-system/albumFileSystem'
import {
  clearRecentlyDeleted,
  listRecentlyDeleted,
  movePhotosToRecentlyDeleted,
  permanentlyDeleteRecentlyDeleted,
  restoreRecentlyDeletedPhotos
} from '../../src/utils/file-system/trashFileSystem'
import {
  executeMatchingPhotoCleanup,
  executeSpecialCleanup,
  prepareMatchingPhotoCleanup,
  prepareSpecialCleanup
} from '../../src/utils/file-system/cleanupFileSystem'
import {
  listGamePlayPhotoAccounts,
  resolveX6GameAccountDirectory
} from '../../src/utils/file-system/directoryAccess'

beforeAll(() => {
  const tails = new Map<string, Promise<unknown>>()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, action: () => Promise<void>) => {
        const next = (tails.get(_name) ?? Promise.resolve()).then(action)
        tails.set(_name, next.catch(() => undefined))
        return next
      }
    }
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined })
})

afterEach(() => {
  vi.restoreAllMocks()
})

class MemoryFileHandle {
  readonly kind = 'file' as const

  constructor(
    public readonly name: string,
    private contents: Blob = new Blob(['photo'], { type: 'image/jpeg' }),
    private readonly failRead = false,
    public readonly lastModified = 1,
    private readonly writeTracker?: { active: number; peak: number }
  ) {}

  async getFile(): Promise<File> {
    if (this.failRead) throw new DOMException('Read failed', 'NotReadableError')
    const file = new File([this.contents], this.name, {
      type: this.contents.type,
      lastModified: this.lastModified
    })
    Object.defineProperty(file, 'text', {
      value: () =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error)
          reader.readAsText(this.contents)
        })
    })
    return file
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    return {
      write: async (data: BufferSource | Blob | string) => {
        if (this.writeTracker) {
          this.writeTracker.active += 1
          this.writeTracker.peak = Math.max(this.writeTracker.peak, this.writeTracker.active)
        }
        try {
          if (this.writeTracker) await Promise.resolve()
          this.contents = data instanceof Blob ? data : new Blob([data])
        } finally {
          if (this.writeTracker) this.writeTracker.active -= 1
        }
      },
      close: async () => undefined,
      abort: async () => undefined
    } as FileSystemWritableFileStream
  }
}

class DelayedMemoryFileHandle extends MemoryFileHandle {
  constructor(
    name: string,
    private readonly tracker: { active: number; peak: number },
    lastModified: number
  ) {
    super(name, new Blob(['photo'], { type: 'image/jpeg' }), false, lastModified)
  }

  override async getFile(): Promise<File> {
    this.tracker.active += 1
    this.tracker.peak = Math.max(this.tracker.peak, this.tracker.active)
    try {
      await Promise.resolve()
      return await super.getFile()
    } finally {
      this.tracker.active -= 1
    }
  }
}

class MemoryDirectoryHandle {
  readonly kind = 'directory' as const
  readonly files = new Map<string, MemoryFileHandle>()
  readonly directories = new Map<string, MemoryDirectoryHandle>()
  failRemoveName: string | null = null
  writeTracker?: { active: number; peak: number }
  removeTracker?: { active: number; peak: number }
  readonly recursiveRemoveNames: string[] = []
  readonly resolvedPaths = new Map<MemoryDirectoryHandle, string[]>()

  constructor(public readonly name: string) {}

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const entry of this.files) yield entry as unknown as [string, FileSystemHandle]
    for (const entry of this.directories) yield entry as unknown as [string, FileSystemHandle]
  }

  values(): AsyncIterableIterator<FileSystemHandle> {
    return this.entriesAsValues()
  }

  private async *entriesAsValues(): AsyncIterableIterator<FileSystemHandle> {
    for await (const [, handle] of this.entries()) yield handle
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle> {
    const existing = this.files.get(name)
    if (existing) return existing as unknown as FileSystemFileHandle
    if (!options?.create) throw new DOMException('Missing file', 'NotFoundError')
    const created = new MemoryFileHandle(name, new Blob([]), false, 1, this.writeTracker)
    this.files.set(name, created)
    return created as unknown as FileSystemFileHandle
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FileSystemDirectoryHandle> {
    const existing = this.directories.get(name)
    if (existing) return existing as unknown as FileSystemDirectoryHandle
    if (!options?.create) throw new DOMException('Missing directory', 'NotFoundError')
    const created = new MemoryDirectoryHandle(name)
    this.directories.set(name, created)
    return created as unknown as FileSystemDirectoryHandle
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.failRemoveName === name)
      throw new DOMException('Remove failed', 'InvalidModificationError')
    if (options?.recursive) this.recursiveRemoveNames.push(name)
    if (this.removeTracker) {
      this.removeTracker.active += 1
      this.removeTracker.peak = Math.max(this.removeTracker.peak, this.removeTracker.active)
    }
    try {
      if (this.removeTracker) await Promise.resolve()
      if (!this.files.delete(name) && !this.directories.delete(name))
        throw new DOMException('Missing entry', 'NotFoundError')
    } finally {
      if (this.removeTracker) this.removeTracker.active -= 1
    }
  }

  async resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null> {
    return this.resolvedPaths.get(possibleDescendant as unknown as MemoryDirectoryHandle) ?? null
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted'
  }
}

function createPhoto(directory: MemoryDirectoryHandle, name: string): PhotoItem {
  const fileHandle = new MemoryFileHandle(name)
  directory.files.set(name, fileHandle)
  const photoFileSize = 5
  return {
    id: `2026-06-26-11:22-${name}`,
    name,
    url: 'blob:loaded-thumbnail',
    fileSizeText: '5 B',
    fileSize: photoFileSize,
    lastModified: fileHandle.lastModified,
    fileHandle: fileHandle as unknown as FileSystemFileHandle,
    directoryHandle: directory as unknown as FileSystemDirectoryHandle,
    dateKey: '2026-06-26',
    year: '2026',
    monthDay: '06月26日',
    displayDate: '2026年06月26日',
    timeText: '11:22',
    timestamp: new Date(2026, 5, 26, 11, 22).getTime()
  }
}

describe('album refresh and recently deleted filesystem operations', () => {
  it('reports unsupported directory authorization on mobile browsers', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 16)'
    )

    await expect(pickAlbumDirectory(messages.zh.fileSystem)).rejects.toThrow(
      messages.zh.fileSystem.mobileBrowserUnsupported
    )
  })

  it('scans album metadata with a maximum of six concurrent file reads', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const tracker = { active: 0, peak: 0 }
    for (let index = 0; index < 8; index += 1) {
      const name = `2026_06_26_11_${String(index).padStart(2, '0')}_00.jpeg`
      album.files.set(name, new DelayedMemoryFileHandle(name, tracker, index))
    }

    const result = await readAlbumDirectory(album as unknown as FileSystemDirectoryHandle, {
      messages: messages.zh.fileSystem
    })

    expect(tracker.peak).toBeGreaterThan(1)
    expect(tracker.peak).toBeLessThanOrEqual(6)
    expect(result.photos).toHaveLength(8)
    expect(result.photos.map((photo) => photo.name)).toEqual(
      [...result.photos.map((photo) => photo.name)].sort().reverse()
    )
  })

  it('prefers a valid filename timestamp and falls back to lastModified for unmatched names', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const fallbackTimestamp = new Date(2025, 0, 2, 3, 4).getTime()
    album.files.set(
      '2026_06_26_11_22_00.jpeg',
      new MemoryFileHandle(
        '2026_06_26_11_22_00.jpeg',
        new Blob(['photo']),
        false,
        fallbackTimestamp
      )
    )
    album.files.set(
      'shared-image.jpeg',
      new MemoryFileHandle('shared-image.jpeg', new Blob(['photo']), false, fallbackTimestamp)
    )
    album.files.set(
      'unreadable-image.jpeg',
      new MemoryFileHandle('unreadable-image.jpeg', new Blob(['photo']), true)
    )

    const result = await readAlbumDirectory(album as unknown as FileSystemDirectoryHandle, {
      messages: messages.zh.fileSystem
    })

    expect(result.photos).toHaveLength(2)
    expect(result.photos.find((photo) => photo.name === '2026_06_26_11_22_00.jpeg')).toMatchObject({
      dateKey: '2026-06-26',
      timeText: '11:22'
    })
    expect(result.photos.find((photo) => photo.name === 'shared-image.jpeg')).toMatchObject({
      dateKey: '2025-01-02',
      timeText: '03:04',
      timestamp: fallbackTimestamp
    })
  })

  it('allows X6Game authorization for an unrelated album without an account path', async () => {
    const album = new MemoryDirectoryHandle('MyPhotoCollection')
    const x6Game = new MemoryDirectoryHandle('X6Game')

    await expect(
      resolveX6GameAccountDirectory(
        x6Game as unknown as FileSystemDirectoryHandle,
        album as unknown as FileSystemDirectoryHandle,
        messages.zh.fileSystem,
        true
      )
    ).resolves.toBe('')
  })

  it('rejects a non-X6Game folder even for unrelated album authorization', async () => {
    const album = new MemoryDirectoryHandle('MyPhotoCollection')
    const wrongDirectory = new MemoryDirectoryHandle('InfinityNikki')

    await expect(
      resolveX6GameAccountDirectory(
        wrongDirectory as unknown as FileSystemDirectoryHandle,
        album as unknown as FileSystemDirectoryHandle,
        messages.zh.fileSystem,
        true
      )
    ).rejects.toThrow(messages.zh.fileSystem.invalidX6GameDirectory)
  })

  it('still validates the account path when the album is NikkiPhotos_HighQuality', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const unrelatedX6Game = new MemoryDirectoryHandle('X6Game')

    await expect(
      resolveX6GameAccountDirectory(
        unrelatedX6Game as unknown as FileSystemDirectoryHandle,
        album as unknown as FileSystemDirectoryHandle,
        messages.zh.fileSystem,
        true
      )
    ).rejects.toThrow(messages.zh.fileSystem.invalidX6GameDirectory)
  })

  it('accepts another selected folder at the expected account path', async () => {
    const album = new MemoryDirectoryHandle('MyPhotoCollection')
    const x6Game = new MemoryDirectoryHandle('X6Game')
    x6Game.resolvedPaths.set(album, ['Saved', 'GamePlayPhotos', '123456789', 'MyPhotoCollection'])

    await expect(
      resolveX6GameAccountDirectory(
        x6Game as unknown as FileSystemDirectoryHandle,
        album as unknown as FileSystemDirectoryHandle,
        messages.zh.fileSystem
      )
    ).resolves.toBe('123456789')
  })

  it('allows X6Game authorization when the album is a cleanup target folder', async () => {
    const screenShotAlbum = new MemoryDirectoryHandle('ScreenShot')
    const lowQualityAlbum = new MemoryDirectoryHandle('NikkiPhotos_LowQuality')
    const x6Game = new MemoryDirectoryHandle('X6Game')

    await expect(
      resolveX6GameAccountDirectory(
        x6Game as unknown as FileSystemDirectoryHandle,
        screenShotAlbum as unknown as FileSystemDirectoryHandle,
        messages.zh.fileSystem,
        true
      )
    ).resolves.toBe('')
    await expect(
      resolveX6GameAccountDirectory(
        x6Game as unknown as FileSystemDirectoryHandle,
        lowQualityAlbum as unknown as FileSystemDirectoryHandle,
        messages.zh.fileSystem,
        true
      )
    ).resolves.toBe('')
  })

  it('resolves the account id for a low-quality album at the expected account path', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_LowQuality')
    const x6Game = new MemoryDirectoryHandle('X6Game')
    x6Game.resolvedPaths.set(album, [
      'Saved',
      'GamePlayPhotos',
      '123456789',
      'NikkiPhotos_LowQuality'
    ])

    await expect(
      resolveX6GameAccountDirectory(
        x6Game as unknown as FileSystemDirectoryHandle,
        album as unknown as FileSystemDirectoryHandle,
        messages.zh.fileSystem
      )
    ).resolves.toBe('123456789')
  })

  it('skips the ScreenShot cleanup target when it is the current album', async () => {
    const x6Game = new MemoryDirectoryHandle('X6Game')
    const saved = new MemoryDirectoryHandle('Saved')
    const gamePlayPhotos = new MemoryDirectoryHandle('GamePlayPhotos')
    const account = new MemoryDirectoryHandle('123456789')
    const lowQuality = new MemoryDirectoryHandle('NikkiPhotos_LowQuality')
    lowQuality.files.set('low.jpeg', new MemoryFileHandle('low.jpeg', new Blob(['12'])))
    account.directories.set('NikkiPhotos_LowQuality', lowQuality)
    gamePlayPhotos.directories.set('123456789', account)
    saved.directories.set('GamePlayPhotos', gamePlayPhotos)
    x6Game.directories.set('Saved', saved)
    const screenShot = new MemoryDirectoryHandle('ScreenShot')
    screenShot.files.set('screen.png', new MemoryFileHandle('screen.png', new Blob(['123'])))
    x6Game.directories.set('ScreenShot', screenShot)
    // 当前相册就是 X6Game 下的 ScreenShot 目录（同一条目）。
    const album = new MemoryDirectoryHandle('ScreenShot')
    album.resolvedPaths.set(screenShot, [])

    const plan = await prepareSpecialCleanup(
      x6Game as unknown as FileSystemDirectoryHandle,
      'lowQuality',
      ['123456789'],
      { skipDirectoryHandle: album as unknown as FileSystemDirectoryHandle }
    )

    expect(plan.skippedDirectories).toEqual(['ScreenShot'])
    expect(plan.photoTargets.map((target) => target.directoryName)).toEqual([
      'NikkiPhotos_LowQuality'
    ])
    expect(plan.fileCount).toBe(1)
    expect(plan.missingDirectories).toEqual([])
  })

  it('skips only the account low-quality folder that matches the current album', async () => {
    const x6Game = new MemoryDirectoryHandle('X6Game')
    const saved = new MemoryDirectoryHandle('Saved')
    const gamePlayPhotos = new MemoryDirectoryHandle('GamePlayPhotos')
    const accountA = new MemoryDirectoryHandle('account-a')
    const lowQualityA = new MemoryDirectoryHandle('NikkiPhotos_LowQuality')
    lowQualityA.files.set('a.jpeg', new MemoryFileHandle('a.jpeg', new Blob(['1'])))
    accountA.directories.set('NikkiPhotos_LowQuality', lowQualityA)
    const accountB = new MemoryDirectoryHandle('account-b')
    const lowQualityB = new MemoryDirectoryHandle('NikkiPhotos_LowQuality')
    lowQualityB.files.set('b.jpeg', new MemoryFileHandle('b.jpeg', new Blob(['1'])))
    accountB.directories.set('NikkiPhotos_LowQuality', lowQualityB)
    gamePlayPhotos.directories.set('account-a', accountA)
    gamePlayPhotos.directories.set('account-b', accountB)
    saved.directories.set('GamePlayPhotos', gamePlayPhotos)
    x6Game.directories.set('Saved', saved)
    const screenShot = new MemoryDirectoryHandle('ScreenShot')
    screenShot.files.set('screen.png', new MemoryFileHandle('screen.png', new Blob(['1'])))
    x6Game.directories.set('ScreenShot', screenShot)
    // 当前相册是账号 a 的低画质目录，账号 b 的同名目录不受影响。
    const album = new MemoryDirectoryHandle('NikkiPhotos_LowQuality')
    album.resolvedPaths.set(lowQualityA, [])

    const plan = await prepareSpecialCleanup(
      x6Game as unknown as FileSystemDirectoryHandle,
      'lowQuality',
      ['account-a', 'account-b'],
      { skipDirectoryHandle: album as unknown as FileSystemDirectoryHandle }
    )

    expect(plan.skippedDirectories).toEqual(['NikkiPhotos_LowQuality'])
    expect(plan.photoTargets.map((target) => target.directoryName)).toEqual([
      'NikkiPhotos_LowQuality',
      'ScreenShot'
    ])
    expect(plan.fileCount).toBe(2)
  })

  it('permanently deletes only selected-name matches and preserves the source album photo', async () => {
    const x6Game = new MemoryDirectoryHandle('X6Game')
    const saved = new MemoryDirectoryHandle('Saved')
    const gamePlayPhotos = new MemoryDirectoryHandle('GamePlayPhotos')
    const account = new MemoryDirectoryHandle('account-a')
    const lowQuality = new MemoryDirectoryHandle('NikkiPhotos_LowQuality')
    const screenshot = new MemoryDirectoryHandle('ScreenShot')
    const selectedName = 'same-name.png'
    lowQuality.files.set(selectedName, new MemoryFileHandle(selectedName))
    lowQuality.files.set('unselected.png', new MemoryFileHandle('unselected.png'))
    screenshot.files.set(selectedName, new MemoryFileHandle(selectedName))
    screenshot.files.set('other.png', new MemoryFileHandle('other.png'))
    account.directories.set('NikkiPhotos_LowQuality', lowQuality)
    gamePlayPhotos.directories.set('account-a', account)
    saved.directories.set('GamePlayPhotos', gamePlayPhotos)
    x6Game.directories.set('Saved', saved)
    x6Game.directories.set('ScreenShot', screenshot)
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    album.files.set(selectedName, new MemoryFileHandle(selectedName))

    const plan = await prepareMatchingPhotoCleanup(
      x6Game as unknown as FileSystemDirectoryHandle,
      'account-a',
      [selectedName],
      album as unknown as FileSystemDirectoryHandle
    )
    const result = await executeMatchingPhotoCleanup(plan)

    expect(plan.matchedCount).toBe(2)
    expect(result.deletedCount).toBe(2)
    expect(lowQuality.files.has(selectedName)).toBe(false)
    expect(screenshot.files.has(selectedName)).toBe(false)
    expect(lowQuality.files.has('unselected.png')).toBe(true)
    expect(screenshot.files.has('other.png')).toBe(true)
    expect(album.files.has(selectedName)).toBe(true)
  })

  it('skips the current album directory when it is a low-quality target', async () => {
    const x6Game = new MemoryDirectoryHandle('X6Game')
    const saved = new MemoryDirectoryHandle('Saved')
    const gamePlayPhotos = new MemoryDirectoryHandle('GamePlayPhotos')
    const account = new MemoryDirectoryHandle('account-a')
    const lowQuality = new MemoryDirectoryHandle('NikkiPhotos_LowQuality')
    const selectedName = 'source.png'
    lowQuality.files.set(selectedName, new MemoryFileHandle(selectedName))
    account.directories.set('NikkiPhotos_LowQuality', lowQuality)
    gamePlayPhotos.directories.set('account-a', account)
    saved.directories.set('GamePlayPhotos', gamePlayPhotos)
    x6Game.directories.set('Saved', saved)
    const screenshot = new MemoryDirectoryHandle('ScreenShot')
    x6Game.directories.set('ScreenShot', screenshot)

    const plan = await prepareMatchingPhotoCleanup(
      x6Game as unknown as FileSystemDirectoryHandle,
      'account-a',
      [selectedName],
      lowQuality as unknown as FileSystemDirectoryHandle
    )
    const result = await executeMatchingPhotoCleanup(plan)

    expect(plan.skippedDirectories).toEqual(['NikkiPhotos_LowQuality'])
    expect(plan.matchedCount).toBe(0)
    expect(result.deletedCount).toBe(0)
    expect(lowQuality.files.has(selectedName)).toBe(true)
  })

  it('still attempts permanent deletion when a matched file size cannot be read', async () => {
    const directory = new MemoryDirectoryHandle('ScreenShot')
    directory.files.set(
      'unreadable.png',
      new MemoryFileHandle('unreadable.png', new Blob(['x']), true)
    )
    directory.failRemoveName = 'locked.png'
    directory.files.set('locked.png', new MemoryFileHandle('locked.png'))
    const plan = {
      photoTargets: [
        {
          directoryName: 'ScreenShot',
          directoryHandle: directory as unknown as FileSystemDirectoryHandle,
          photoNames: ['unreadable.png', 'locked.png']
        }
      ],
      matchedCount: 2,
      missingDirectories: [],
      skippedDirectories: []
    }

    const result = await executeMatchingPhotoCleanup(plan)

    expect(result.deletedCount).toBe(1)
    expect(directory.files.has('unreadable.png')).toBe(false)
    expect(result.failures).toEqual([{ path: 'ScreenShot\\locked.png', reason: 'remove-failed' }])
  })

  it('counts only successfully removed bytes and returns readable failures', async () => {
    const directory = new MemoryDirectoryHandle('ScreenShot')
    directory.files.set('ok.png', new MemoryFileHandle('ok.png', new Blob(['1234'])))
    directory.files.set('locked.png', new MemoryFileHandle('locked.png', new Blob(['123456'])))
    directory.files.set(
      'unreadable.png',
      new MemoryFileHandle('unreadable.png', new Blob(['12']), true)
    )
    directory.failRemoveName = 'locked.png'

    const result = await executeSpecialCleanup({
      item: 'lowQuality',
      fileCount: 3,
      totalBytes: 0,
      totalBytesKnown: true,
      photoTargets: [
        {
          directoryName: 'ScreenShot',
          directoryHandle: directory as unknown as FileSystemDirectoryHandle,
          photoNames: ['ok.png', 'locked.png', 'unreadable.png']
        }
      ],
      directoryTargets: [],
      missingDirectories: [],
      skippedDirectories: []
    })

    expect(result.deletedCount).toBe(1)
    expect(result.deletedBytes).toBe(4)
    expect(result.failures).toEqual([
      { path: 'ScreenShot\\locked.png', reason: 'remove-failed' },
      { path: 'ScreenShot\\unreadable.png', reason: 'unreadable-size' }
    ])
    expect(directory.files.has('unreadable.png')).toBe(true)
  })

  it('clears directory cleanup contents recursively while keeping the folder itself', async () => {
    const x6Game = new MemoryDirectoryHandle('X6Game')
    const saved = new MemoryDirectoryHandle('Saved')
    const crashes = new MemoryDirectoryHandle('Crashes')
    const nested = new MemoryDirectoryHandle('CrashContext')
    nested.files.set('context.log', new MemoryFileHandle('context.log', new Blob(['12'])))
    crashes.files.set('crash.dmp', new MemoryFileHandle('crash.dmp', new Blob(['1234'])))
    crashes.directories.set('CrashContext', nested)
    saved.directories.set('Crashes', crashes)
    x6Game.directories.set('Saved', saved)

    const plan = await prepareSpecialCleanup(
      x6Game as unknown as FileSystemDirectoryHandle,
      'crashes'
    )

    expect(plan.fileCount).toBe(2)
    expect(plan.totalBytes).toBe(6)
    expect(plan.totalBytesKnown).toBe(true)
    expect(plan.missingDirectories).toEqual([])

    const result = await executeSpecialCleanup(plan)

    expect(result.deletedCount).toBe(2)
    expect(result.deletedBytes).toBe(6)
    expect(result.failures).toEqual([])
    // 文件夹本身保留，内容被清空
    expect(saved.directories.has('Crashes')).toBe(true)
    expect(crashes.files.size).toBe(0)
    expect(crashes.directories.size).toBe(0)
  })

  it('deletes unreadable directory entries while marking the size estimate as incomplete', async () => {
    const x6Game = new MemoryDirectoryHandle('X6Game')
    const saved = new MemoryDirectoryHandle('Saved')
    const logs = new MemoryDirectoryHandle('Logs')
    logs.files.set('locked.log', new MemoryFileHandle('locked.log', new Blob(['1234']), true))
    saved.directories.set('Logs', logs)
    x6Game.directories.set('Saved', saved)

    const plan = await prepareSpecialCleanup(x6Game as unknown as FileSystemDirectoryHandle, 'logs')

    expect(plan.fileCount).toBe(1)
    expect(plan.totalBytes).toBe(0)
    expect(plan.totalBytesKnown).toBe(false)

    const result = await executeSpecialCleanup(plan)

    expect(result.deletedCount).toBe(1)
    expect(result.deletedBytes).toBe(0)
    expect(result.failures).toEqual([])
    expect(logs.files.size).toBe(0)
  })

  it('reports a missing directory when the cleanup target does not exist', async () => {
    const x6Game = new MemoryDirectoryHandle('X6Game')

    const plan = await prepareSpecialCleanup(x6Game as unknown as FileSystemDirectoryHandle, 'logs')

    expect(plan.fileCount).toBe(0)
    expect(plan.missingDirectories).toEqual(['Logs'])
  })

  it('lists account folders under GamePlayPhotos and returns empty when missing', async () => {
    const x6Game = new MemoryDirectoryHandle('X6Game')
    const saved = new MemoryDirectoryHandle('Saved')
    const gamePlayPhotos = new MemoryDirectoryHandle('GamePlayPhotos')
    gamePlayPhotos.directories.set('22222', new MemoryDirectoryHandle('22222'))
    gamePlayPhotos.directories.set('11111', new MemoryDirectoryHandle('11111'))
    saved.directories.set('GamePlayPhotos', gamePlayPhotos)
    x6Game.directories.set('Saved', saved)

    await expect(
      listGamePlayPhotoAccounts(x6Game as unknown as FileSystemDirectoryHandle)
    ).resolves.toEqual(['11111', '22222'])

    const emptyX6Game = new MemoryDirectoryHandle('X6Game')
    await expect(
      listGamePlayPhotoAccounts(emptyX6Game as unknown as FileSystemDirectoryHandle)
    ).resolves.toEqual([])
  })

  it('reuses unchanged photo state and reports added and externally removed files', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const kept = createPhoto(album, '2026_06_26_11_22_00.jpeg')
    const removed = createPhoto(album, '2026_06_26_11_23_00.jpeg')
    album.files.delete(removed.name)
    album.files.set('2026_06_26_11_24_00.jpeg', new MemoryFileHandle('2026_06_26_11_24_00.jpeg'))

    const result = await refreshAlbumDirectory(
      album as unknown as FileSystemDirectoryHandle,
      [kept, removed],
      { messages: messages.zh.fileSystem }
    )

    expect(result.addedCount).toBe(1)
    expect(result.removedCount).toBe(1)
    expect(result.photos).toContain(kept)
    expect(result.photos.find((photo) => photo === kept)?.url).toBe('blob:loaded-thumbnail')
  })

  it('replaces a same-name photo when its file metadata changes', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const currentHandle = new MemoryFileHandle(
      '2026_06_26_11_22_00.jpeg',
      new Blob(['old']),
      false,
      1
    )
    album.files.set(currentHandle.name, currentHandle)
    const current = createPhoto(album, currentHandle.name)
    const replacementHandle = new MemoryFileHandle(
      currentHandle.name,
      new Blob(['new content']),
      false,
      2
    )
    album.files.set(replacementHandle.name, replacementHandle)

    const result = await refreshAlbumDirectory(
      album as unknown as FileSystemDirectoryHandle,
      [current],
      { messages: messages.zh.fileSystem }
    )

    expect(result.photos[0]).not.toBe(current)
    expect(result.replacedPhotos).toEqual([current])
    expect(result.removedCount).toBe(0)
  })

  it('moves a favorite photo into trash and reconstructs its metadata', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const photo = createPhoto(album, '2026_06_26_11_22_00.jpeg')

    const result = await movePhotosToRecentlyDeleted([photo], new Set([photo.id]))
    const trashPhotos = await listRecentlyDeleted(album as unknown as FileSystemDirectoryHandle)

    expect(result.succeeded).toEqual([photo])
    expect(result.movedPhotos[0]).toMatchObject({
      originalName: photo.name,
      wasFavorite: true,
      size: 5
    })
    expect(album.files.has(photo.name)).toBe(false)
    expect(trashPhotos).toHaveLength(1)
    expect(trashPhotos[0]).toMatchObject({ originalName: photo.name, wasFavorite: true, size: 5 })
  })

  it('copies at most twenty-seven photos concurrently when moving to trash and restoring', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const trash = new MemoryDirectoryHandle('trash')
    const moveTracker = { active: 0, peak: 0 }
    trash.writeTracker = moveTracker
    album.directories.set('trash', trash)
    const photos = Array.from({ length: 28 }, (_, index) =>
      createPhoto(album, `2026_06_26_11_${String(index).padStart(2, '0')}_00.jpeg`)
    )

    const moved = await movePhotosToRecentlyDeleted(photos, new Set())
    expect(moved.succeeded).toHaveLength(28)
    expect(moveTracker.peak).toBeGreaterThan(1)
    expect(moveTracker.peak).toBeLessThanOrEqual(27)

    const restoreTracker = { active: 0, peak: 0 }
    album.writeTracker = restoreTracker
    const restored = await restoreRecentlyDeletedPhotos(
      moved.movedPhotos,
      album as unknown as FileSystemDirectoryHandle
    )
    expect(restored.restoredPhotos).toHaveLength(28)
    expect(restoreTracker.peak).toBeGreaterThan(1)
    expect(restoreTracker.peak).toBeLessThanOrEqual(27)
  })

  it('deletes at most ten recently deleted photos concurrently', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const photos = Array.from({ length: 15 }, (_, index) =>
      createPhoto(album, `2026_06_26_12_${String(index).padStart(2, '0')}_00.jpeg`)
    )
    const moved = await movePhotosToRecentlyDeleted(photos, new Set())
    const trash = album.directories.get('trash')!
    const removeTracker = { active: 0, peak: 0 }
    trash.removeTracker = removeTracker

    const deleted = await permanentlyDeleteRecentlyDeleted(moved.movedPhotos)
    expect(deleted.succeeded).toHaveLength(15)
    expect(removeTracker.peak).toBeGreaterThan(1)
    expect(removeTracker.peak).toBeLessThanOrEqual(10)
  })

  it('removes the whole trash directory only when it contains no unknown entries', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const photo = createPhoto(album, '2026_06_26_13_00_00.jpeg')
    const moved = await movePhotosToRecentlyDeleted([photo], new Set())

    const cleared = await clearRecentlyDeleted(
      album as unknown as FileSystemDirectoryHandle,
      moved.movedPhotos
    )
    expect(cleared.succeeded).toHaveLength(1)
    expect(album.recursiveRemoveNames).toEqual(['trash'])
    expect(album.directories.has('trash')).toBe(false)

    const nextPhoto = createPhoto(album, '2026_06_26_13_01_00.jpeg')
    const nextMoved = await movePhotosToRecentlyDeleted([nextPhoto], new Set())
    const trash = album.directories.get('trash')!
    trash.files.set('keep.txt', new MemoryFileHandle('keep.txt'))
    album.recursiveRemoveNames.length = 0

    const fallback = await clearRecentlyDeleted(
      album as unknown as FileSystemDirectoryHandle,
      nextMoved.movedPhotos
    )
    expect(fallback.succeeded).toHaveLength(1)
    expect(album.recursiveRemoveNames).toEqual([])
    expect(trash.files.has('keep.txt')).toBe(true)
  })

  it('keeps a fallback-timestamp photo visible after moving it to recently deleted', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const timestamp = new Date(2025, 0, 2, 3, 4).getTime()
    album.files.set(
      'shared-image.jpeg',
      new MemoryFileHandle('shared-image.jpeg', new Blob(['photo']), false, timestamp)
    )
    const [photo] = (
      await readAlbumDirectory(album as unknown as FileSystemDirectoryHandle, {
        messages: messages.zh.fileSystem
      })
    ).photos

    await movePhotosToRecentlyDeleted([photo], new Set([photo.id]))
    const [trashPhoto] = await listRecentlyDeleted(album as unknown as FileSystemDirectoryHandle)
    const restored = await restoreRecentlyDeletedPhotos(
      [trashPhoto],
      album as unknown as FileSystemDirectoryHandle
    )

    expect(trashPhoto).toMatchObject({
      originalName: 'shared-image.jpeg',
      timestamp: 1,
      lastModified: 1
    })
    expect(restored.failedNames).toEqual([])
    expect(restored.restoredPhotos).toHaveLength(1)
  })

  it('rolls back the trash copy when deleting the source file fails', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const photo = createPhoto(album, '2026_06_26_11_22_00.jpeg')
    album.failRemoveName = photo.name

    const result = await movePhotosToRecentlyDeleted([photo], new Set())
    const trash = album.directories.get('trash')

    expect(result.failedNames).toEqual([photo.name])
    expect(album.files.has(photo.name)).toBe(true)
    expect(trash?.files.size).toBe(0)
  })

  it('restores with an incremented name instead of overwriting a conflict', async () => {
    const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
    const photo = createPhoto(album, '2026_06_26_11_22_00.jpeg')
    await movePhotosToRecentlyDeleted([photo], new Set())
    album.files.set(photo.name, new MemoryFileHandle(photo.name, new Blob(['replacement'])))
    const [trashPhoto] = await listRecentlyDeleted(album as unknown as FileSystemDirectoryHandle)

    const result = await restoreRecentlyDeletedPhotos(
      [trashPhoto],
      album as unknown as FileSystemDirectoryHandle
    )

    expect(result.failedNames).toEqual([])
    expect(result.restoredPhotos[0].name).toBe('2026_06_26_11_22_00_restored_1.jpeg')
    expect(album.files.has(photo.name)).toBe(true)
    expect(album.files.has('2026_06_26_11_22_00_restored_1.jpeg')).toBe(true)
  })
})

it('refreshes changed and removed notes while retaining the original photo URL', async () => {
  const directory = new MemoryDirectoryHandle('album')
  createPhoto(directory, '2026-10-14_12-00-00.jpg')
  const handle = directory as unknown as FileSystemDirectoryHandle
  await savePhotoNote(handle, '2026-10-14_12-00-00.jpg', 'old')
  const first = await readAlbumDirectory(handle, { messages: messages.zh.fileSystem })
  first.photos[0].url = 'blob:kept'
  await savePhotoNote(handle, first.photos[0].name, 'new')
  const second = await refreshAlbumDirectory(handle, first.photos, {
    messages: messages.zh.fileSystem
  })
  expect(second.photos[0]).toBe(first.photos[0])
  expect(second.photos[0]).toMatchObject({ note: 'new', url: 'blob:kept' })
  await savePhotoNote(handle, first.photos[0].name, '')
  expect(
    (await refreshAlbumDirectory(handle, second.photos, { messages: messages.zh.fileSystem }))
      .photos[0].note
  ).toBe('')
})

it('persists trash notes across reload and restores them under a conflict-free new name', async () => {
  const directory = new MemoryDirectoryHandle('album')
  const photo = createPhoto(directory, '2026-10-14_12-00-00.jpg')
  const handle = directory as unknown as FileSystemDirectoryHandle
  await savePhotoNote(handle, photo.name, 'original')
  const moved = await movePhotosToRecentlyDeleted([photo], new Set())
  expect(moved.movedPhotos[0].note).toBe('original')
  expect((await readAlbumMetadata(handle)).photos[photo.name]).toBeUndefined()
  const reloaded = await listRecentlyDeleted(handle)
  expect(reloaded[0].note).toBe('original')
  createPhoto(directory, photo.name)
  await savePhotoNote(handle, photo.name, 'replacement')
  const restored = await restoreRecentlyDeletedPhotos(reloaded, handle)
  expect(restored.restoredPhotos[0].name).toContain('_restored_1')
  const notes = (await readAlbumMetadata(handle)).photos
  expect(notes[restored.restoredPhotos[0].name].note).toBe('original')
  expect(notes[photo.name].note).toBe('replacement')
  expect(notes[reloaded[0].noteKey!]).toBeUndefined()
})

it('keeps source notes and files when move or restore deletion fails', async () => {
  const directory = new MemoryDirectoryHandle('album')
  const photo = createPhoto(directory, '2026-10-14_12-00-00.jpg')
  const handle = directory as unknown as FileSystemDirectoryHandle
  await savePhotoNote(handle, photo.name, 'kept')
  directory.failRemoveName = photo.name
  expect((await movePhotosToRecentlyDeleted([photo], new Set())).failedNames).toEqual([photo.name])
  expect((await readAlbumMetadata(handle)).photos).toEqual({ [photo.name]: { note: 'kept' } })
  expect(directory.files.has(photo.name)).toBe(true)
  directory.failRemoveName = null
  const moved = await movePhotosToRecentlyDeleted([photo], new Set())
  directory.directories.get('trash')!.failRemoveName = moved.movedPhotos[0].trashName
  expect((await restoreRecentlyDeletedPhotos(moved.movedPhotos, handle)).failedNames).toEqual([
    photo.name
  ])
  // A completed copy is preserved if source removal fails; never delete an uncertain target.
  expect(directory.files.has(photo.name)).toBe(true)
  expect((await listRecentlyDeleted(handle))[0].note).toBe('kept')
})

it('does not resurrect a note removed after the album was loaded', async () => {
  const directory = new MemoryDirectoryHandle('album')
  const photo = createPhoto(directory, '2026-10-14_12-00-00.jpg')
  photo.note = 'stale note'
  const result = await movePhotosToRecentlyDeleted([photo], new Set())
  expect(result.failedNames).toEqual([])
  expect(result.movedPhotos[0].note).toBe('')
  expect(
    (await listRecentlyDeleted(directory as unknown as FileSystemDirectoryHandle))[0].note
  ).toBe('')
})

it('preserves a destination created after restore-name allocation', async () => {
  const directory = new MemoryDirectoryHandle('album')
  const handle = directory as unknown as FileSystemDirectoryHandle
  const source = new MemoryFileHandle('2026_06_26_11_22_00.jpeg')
  directory.files.set(source.name, source)
  const { photos: [photo] } = await readAlbumDirectory(handle, { messages: messages.zh.fileSystem })
  const moved = await movePhotosToRecentlyDeleted([photo], new Set())
  const original = directory.getFileHandle.bind(directory)
  vi.spyOn(directory, 'getFileHandle').mockImplementation(async (name, options) => {
    if (name === source.name && options?.create)
      directory.files.set(name, new MemoryFileHandle(name, new Blob(['external'])))
    return original(name, options)
  })
  const restored = await restoreRecentlyDeletedPhotos(moved.movedPhotos, handle)
  expect(restored.succeeded).toHaveLength(0)
  expect(await (await directory.files.get(source.name)!.getFile()).text()).toBe('external')
  expect(await listRecentlyDeleted(handle)).toHaveLength(1)
})
it('opens and refreshes a writable album with an empty original and a valid trash-note swap', async () => {
  const album = new MemoryDirectoryHandle('NikkiPhotos_HighQuality')
  const photo = createPhoto(album, '2026_11_03_13_25_08.jpg')
  album.files.set('album-metadata.json',new MemoryFileHandle('album-metadata.json', new Blob([])))
  const swap = 'album-metadata.json.crswap'
  album.files.set(swap,new MemoryFileHandle(swap,new Blob(['{"version":1,"photos":{"trash/example.jpg":{"note":""}}}'])))
  album.directories.set('trash',new MemoryDirectoryHandle('trash'))
  const dir=album as unknown as FileSystemDirectoryHandle
  const opts={messages:messages.zh.fileSystem}
  const opened=await readAlbumDirectory(dir,opts)
  expect(opened).toMatchObject({photos:[{name:photo.name}],notes:{blocked:true,previewName:swap}})
  expect(await refreshAlbumDirectory(dir,opened.photos,opts)).toMatchObject({photos:[{name:photo.name}],recentlyDeleted:[],notes:{blocked:true}})
  expect((await readAlbumDirectory(dir,opts)).photos[0].source).not.toBe('file')
  expect(await (await album.files.get('album-metadata.json')!.getFile()).text()).toBe('')
})
