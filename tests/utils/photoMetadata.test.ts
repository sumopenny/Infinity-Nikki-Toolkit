import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  inspectAlbumNotes,
  recoverAlbumNotes,
  normalizePhotoNote,
  readAlbumMetadata,
  savePhotoNote
} from '../../src/utils/file-system/photoMetadata'

import { reportError } from '../../src/utils/errorReporting/errorReporter'
vi.mock('../../src/utils/errorReporting/errorReporter', () => ({ reportError: vi.fn() }))

class FileHandle {
  constructor(
    public name: string,
    public contents = ''
  ) {}
  async getFile() {
    const contents = this.contents
    const f = new File([contents], this.name)
    Object.defineProperty(f, 'arrayBuffer', {
      value: async () => new TextEncoder().encode(contents).buffer
    })
    Object.defineProperty(f, 'text', { value: async () => contents })
    return f
  }
  async createWritable() {
    return {
      write: async (v: string | File) => {
        this.contents = typeof v === 'string' ? v : await v.text()
      },
      close: async () => undefined,
      abort: async () => undefined
    } as unknown as FileSystemWritableFileStream
  }
}
class Dir {
  async removeEntry(name: string) {
    this.files.delete(name)
  }
  files = new Map<string, FileHandle>()
  async getFileHandle(name: string, o?: { create?: boolean }) {
    let f = this.files.get(name)
    if (!f && o?.create) {
      f = new FileHandle(name)
      this.files.set(name, f)
    }
    if (!f) throw new DOMException('missing', 'NotFoundError')
    return f as unknown as FileSystemFileHandle
  }
}
const asDir = (d: Dir) => d as unknown as FileSystemDirectoryHandle

describe('photoMetadata', () => {
  it('normalizes notes and truncates to fifteen characters', () => {
    expect(normalizePhotoNote(`  ${'a'.repeat(20)}  `)).toBe('a'.repeat(15))
    expect(normalizePhotoNote(3)).toBe('')
  })
  it('reads legacy valid notes without requiring a version field', async () => {
    const d = new Dir()
    d.files.set(
      'album-metadata.json',
      new FileHandle(
        'album-metadata.json',
        JSON.stringify({ photos: { a: { note: ' ok ' }, b: { note: '' } } })
      )
    )
    expect(await readAlbumMetadata(asDir(d))).toEqual({ version: 1, photos: { a: { note: 'ok' } } })
  })
  it('saves and removes a note', async () => {
    const d = new Dir()
    await savePhotoNote(asDir(d), 'a.jpg', ' note ')
    expect((await readAlbumMetadata(asDir(d))).photos['a.jpg'].note).toBe('note')
    await savePhotoNote(asDir(d), 'a.jpg', '   ')
    expect((await readAlbumMetadata(asDir(d))).photos).toEqual({})
  })
})

// 按锁名协调不同模块实例，模拟浏览器跨窗口锁，而非页面内共享队列。
beforeEach(() => {
  const tails = new Map<string, Promise<unknown>>()
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn((name: string, action: () => Promise<unknown>) => {
        const next = (tails.get(name) ?? Promise.resolve()).then(action)
        tails.set(
          name,
          next.catch(() => undefined)
        )
        return next
      })
    }
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('preserves concurrent notes from separate window instances and distinct handles', async () => {
  vi.resetModules()
  const otherWindow = await import('../../src/utils/file-system/photoMetadata')
  const directory = new Dir()
  const alias = {
    removeEntry: directory.removeEntry.bind(directory),
    getFileHandle: directory.getFileHandle.bind(directory)
  } as FileSystemDirectoryHandle
  await Promise.all([
    savePhotoNote(asDir(directory), 'a', 'first'),
    otherWindow.savePhotoNote(alias, 'b', 'second')
  ])
  expect((await readAlbumMetadata(asDir(directory))).photos).toEqual({
    a: { note: 'first' },
    b: { note: 'second' }
  })
  expect(new Set(vi.mocked(navigator.locks.request).mock.calls.map((call) => call[0])).size).toBe(1)
})
it.each([
  '{broken',
  'null',
  '[]',
  '{}',
  '{"photos":[]}',
  '{"version":2,"photos":{}}',
  '{"photos":{"a":null}}',
  '{"photos":{"a":{"note":42}}}'
])('preserves invalid metadata without opening a writer: %s', async (contents) => {
  const directory = new Dir(),
    file = new FileHandle('album-metadata.json', contents)
  directory.files.set(file.name, file)
  const writer = vi.spyOn(file, 'createWritable')
  await expect(savePhotoNote(asDir(directory), 'new', 'text')).rejects.toMatchObject({
    code: 'invalid'
  })
  expect(file.contents).toBe(contents)
  expect(writer).not.toHaveBeenCalled()
})
it('propagates read errors and preserves unrelated raw note content', async () => {
  const directory = new Dir(),
    file = new FileHandle(
      'album-metadata.json',
      JSON.stringify({ photos: { other: { note: '  original longer than fifteen  ' } } })
    )
  directory.files.set(file.name, file)
  vi.spyOn(file, 'getFile').mockRejectedValueOnce(new Error('read failed'))
  await expect(savePhotoNote(asDir(directory), 'new', 'text')).rejects.toMatchObject({
    code: 'invalid'
  })
  await savePhotoNote(asDir(directory), 'new', 'text')
  expect(JSON.parse(file.contents).photos.other.note).toBe('  original longer than fifteen  ')
})
it('rejects a stale editor and accepts a refreshed editing baseline', async () => {
  const directory = asDir(new Dir())
  await savePhotoNote(directory, 'a', 'newer', '')
  await expect(savePhotoNote(directory, 'a', 'stale', '')).rejects.toMatchObject({
    code: 'changed'
  })
  expect((await readAlbumMetadata(directory)).photos.a.note).toBe('newer')
  await savePhotoNote(directory, 'a', 'refreshed', 'newer')
  expect((await readAlbumMetadata(directory)).photos.a.note).toBe('refreshed')
})
it('releases the lock after write failure and verifies actual saved content', async () => {
  const directory = new Dir(),
    file = new FileHandle('album-metadata.json', '{"photos":{}}')
  directory.files.set(file.name, file)
  vi.spyOn(file, 'createWritable').mockRejectedValueOnce(new Error('write denied'))
  await expect(savePhotoNote(asDir(directory), 'a', 'one')).rejects.toThrow('write denied')
  const interrupted = await inspectAlbumNotes(asDir(directory))
  expect(interrupted.blocked).toBe(true)
  expect(interrupted.candidates[0].metadata.photos.a.note).toBe('one')
  await recoverAlbumNotes(asDir(directory), interrupted, null)
  await savePhotoNote(asDir(directory), 'b', 'two')
  expect((await readAlbumMetadata(asDir(directory))).photos).toEqual({ b: { note: 'two' } })
  vi.spyOn(file, 'createWritable').mockResolvedValueOnce({
    write: async () => {},
    close: async () => {},
    abort: async () => {}
  } as unknown as FileSystemWritableFileStream)
  await expect(savePhotoNote(asDir(directory), 'c', 'three')).rejects.toMatchObject({
    code: 'verificationFailed'
  })
})
it('does not write without cross-window lock support', async () => {
  vi.stubGlobal('navigator', {})
  const directory = new Dir()
  await expect(savePhotoNote(asDir(directory), 'a', 'note')).rejects.toMatchObject({
    code: 'lockUnavailable'
  })
  expect(directory.files.size).toBe(0)
})
const MAIN = 'album-metadata.json'
const PENDING = 'album-metadata.pending.json'
const SWAP = MAIN + '.crswap'
const trashText = JSON.stringify({ version: 1, photos: { 'trash/example.jpg': { note: '' } } })

it('backs up the empty original and restores the incident swap, including its empty trash note', async () => {
  const d = new Dir()
  d.files.set(MAIN, new FileHandle(MAIN))
  d.files.set(SWAP, new FileHandle(SWAP, trashText))
  vi.mocked(reportError).mockClear()
  await inspectAlbumNotes(asDir(new Dir()), 'open')
  expect(reportError).not.toHaveBeenCalled()
  const state = await inspectAlbumNotes(asDir(d), 'compatible')
  expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
    module: 'album', action: 'read-notes', stage: 'compatible', code: 'ALBUM_NOTES_BLOCKED',
    severity: 'warning', context: { mainState: 'empty', invalidEntryCount: 0, pendingState: 'missing', swapState: 'valid' }
  })
  expect(state).toMatchObject({ blocked: true, previewName: SWAP, metadata: JSON.parse(trashText) })
  await expect(savePhotoNote(asDir(d), 'x', 'edit')).rejects.toMatchObject({ code: 'invalid' })
  await recoverAlbumNotes(asDir(d), state, SWAP)
  expect(d.files.get(MAIN)?.contents).toBe(trashText)
  expect(d.files.get(SWAP)?.contents).toBe(trashText)
  const backup = [...d.files.values()].filter((file) => file.name.endsWith('.bak'))
  expect(backup).toHaveLength(1)
  expect(backup[0].contents).toBe('')
  expect((await inspectAlbumNotes(asDir(d))).blocked).toBe(false)
})

it('backs up both versions before resolving a multi-candidate conflict', async () => {
  const d = new Dir()
  for (const [name, text] of [
    [MAIN, 'damaged'],
    [SWAP, trashText],
    [PENDING, '{"photos":{}}']
  ])
    d.files.set(name, new FileHandle(name, text))
  const state = await inspectAlbumNotes(asDir(d))
  expect(state.previewName).toBeUndefined()
  await recoverAlbumNotes(asDir(d), state, SWAP)
  expect(
    [...d.files.values()]
      .filter((file) => file.name.endsWith('.bak'))
      .map((file) => file.contents)
      .sort()
  ).toEqual(['damaged', '{"photos":{}}'])
  expect(d.files.has(PENDING)).toBe(false)
})

it('stops before replacing an original if backup fails or the selected candidate changes', async () => {
  const d = new Dir()
  const main = new FileHandle(MAIN, '{broken')
  const swap = new FileHandle(SWAP, trashText)
  d.files.set(MAIN, main)
  d.files.set(SWAP, swap)
  const state = await inspectAlbumNotes(asDir(d))
  const get = d.getFileHandle.bind(d)
  const spy = vi.spyOn(d, 'getFileHandle').mockImplementation(async (name, options) => {
    if (name.endsWith('.bak') && options?.create) throw new Error('backup denied')
    return get(name, options)
  })
  await expect(recoverAlbumNotes(asDir(d), state, SWAP)).rejects.toThrow('backup denied')
  expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
    module: 'album', action: 'recover-notes', stage: 'backup', code: 'ALBUM_NOTE_FILE_FAILED'
  }))
  spy.mockRestore()
  swap.contents = '{"photos":{}}'
  await expect(recoverAlbumNotes(asDir(d), state, SWAP)).rejects.toMatchObject({ code: 'changed' })
  expect(main.contents).toBe('{broken')
})

it('keeps backups and candidates after a recovery write failure', async () => {
  const d = new Dir(),
    main = new FileHandle(MAIN, 'broken')
  d.files.set(MAIN, main)
  d.files.set(SWAP, new FileHandle(SWAP, trashText))
  vi.spyOn(main, 'createWritable').mockRejectedValue(new Error('denied'))
  await expect(
    recoverAlbumNotes(asDir(d), await inspectAlbumNotes(asDir(d)), SWAP)
  ).rejects.toThrow('denied')
  expect([...d.files.values()].find((f) => f.name.endsWith('.bak'))?.contents).toBe('broken')
  expect(d.files.get(SWAP)?.contents).toBe(trashText)
})

it('never creates a formal file if staging fails and exposes invalid pending data for manual recovery', async () => {
  const d = new Dir(),
    get = d.getFileHandle.bind(d)
  vi.spyOn(d, 'getFileHandle').mockImplementation(async (name, options) => {
    const h = await get(name, options)
    if (name === PENDING && options?.create)
      vi.spyOn(h, 'createWritable').mockRejectedValueOnce(new Error('disk full'))
    return h
  })
  await expect(savePhotoNote(asDir(d), 'a', 'one')).rejects.toThrow('disk full')
  expect(d.files.has(MAIN)).toBe(false)
  expect(await inspectAlbumNotes(asDir(d))).toMatchObject({
    blocked: true,
    candidates: [{ state: 'invalid' }]
  })
})
it('does not report a failed save when only pending cleanup fails', async () => {
  const d = new Dir()
  vi.spyOn(d, 'removeEntry').mockRejectedValue(new Error('cleanup denied'))
  expect(await savePhotoNote(asDir(d), 'a.jpg', 'saved')).toBe('saved')
  const state = await inspectAlbumNotes(asDir(d))
  expect(state).toMatchObject({
    blocked: true,
    main: { state: 'valid', metadata: { photos: { 'a.jpg': { note: 'saved' } } } }
  })
  expect(await recoverAlbumNotes(asDir(d), state, null)).toEqual({ cleanupPending: true })
})
it('retains the verified pending version if the original changes before commit', async () => {
  const d = new Dir(),
    main = new FileHandle(MAIN, '{"photos":{}}'),
    get = d.getFileHandle.bind(d)
  d.files.set(MAIN, main)
  vi.spyOn(d, 'getFileHandle').mockImplementation(async (name, options) => {
    const file = await get(name, options)
    if (name === PENDING && options?.create)
      main.contents = '{"photos":{"other":{"note":"external"}}}'
    return file
  })
  await expect(savePhotoNote(asDir(d), 'a.jpg', 'new')).rejects.toMatchObject({ code: 'changed' })
  expect(JSON.parse(main.contents).photos.other.note).toBe('external')
  expect(JSON.parse(d.files.get(PENDING)!.contents).photos['a.jpg'].note).toBe('new')
})
