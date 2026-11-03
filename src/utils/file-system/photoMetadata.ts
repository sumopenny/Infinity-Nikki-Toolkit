// 相片元数据：负责 album-metadata.json 的读取、校验和备注保存。
export const PHOTO_NOTE_LIMIT = 15
const ALBUM_METADATA_FILE_NAME = 'album-metadata.json'
const METADATA_WRITE_LOCK = 'infinity-nikki-album-metadata-write'

export class PhotoMetadataError extends Error {
  constructor(
    public readonly code: 'invalid' | 'changed' | 'lockUnavailable' | 'verificationFailed'
  ) {
    super(`photo_metadata_${code}`)
  }
}

export interface AlbumMetadata {
  version: 1
  photos: Record<string, { note: string }>
}

export function normalizePhotoNote(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, PHOTO_NOTE_LIMIT) : ''
}

const PENDING = 'album-metadata.pending.json'
const SWAP = ALBUM_METADATA_FILE_NAME + '.crswap'
type State = 'missing' | 'valid' | 'partial' | 'invalid' | 'unsupported' | 'unreadable'
interface NoteFile {
  name: string
  state: State
  text: string | null
  modified: number
  metadata: AlbumMetadata
  badEntries: number
}
export interface AlbumNoteSnapshot {
  main: NoteFile
  candidates: NoteFile[]
  metadata: AlbumMetadata
  blocked: boolean
  previewName?: string
}
type GetFile = (name: string) => Promise<File | undefined>
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
async function inspect(name: string, get: GetFile): Promise<NoteFile> {
  const result: NoteFile = {
    name,
    state: 'missing',
    text: null,
    modified: 0,
    metadata: { version: 1, photos: Object.create(null) },
    badEntries: 0
  }
  try {
    const file = await get(name)
    if (!file) return result
    result.text = await file.text()
    result.modified = file.lastModified
  } catch {
    result.state = 'unreadable'
    return result
  }
  return { ...result, ...decodeNotes(result.text) }
}

function decodeNotes(text: string) {
  const metadata: AlbumMetadata = { version: 1, photos: Object.create(null) }
  const result: Pick<NoteFile, 'state' | 'metadata' | 'badEntries'> = {
    state: 'invalid',
    metadata,
    badEntries: 0
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return result
  }
  if (!object(data)) return result
  if (data.version !== undefined && data.version !== 1) {
    result.state = 'unsupported'
    return result
  }
  if (!object(data.photos)) return result
  for (const [key, value] of Object.entries(data.photos)) {
    if (object(value) && typeof value.note === 'string')
      result.metadata.photos[key] = { ...value, note: value.note }
    else result.badEntries++
  }
  result.state = result.badEntries ? 'partial' : 'valid'
  return result
}
export function parseAlbumMetadata(text: string): AlbumMetadata {
  const parsed = decodeNotes(text)
  if (parsed.state !== 'valid') throw new PhotoMetadataError('invalid')
  return parsed.metadata
}

function filesIn(directory: FileSystemDirectoryHandle): GetFile {
  return async (name) => {
    try {
      return await (await directory.getFileHandle(name)).getFile()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return undefined
      throw error
    }
  }
}
export async function inspectAlbumNotes(
  source: FileSystemDirectoryHandle | GetFile
): Promise<AlbumNoteSnapshot> {
  const get = typeof source === 'function' ? source : filesIn(source)
  const [main, pending] = await Promise.all([
    inspect(ALBUM_METADATA_FILE_NAME, get),
    inspect(PENDING, get)
  ])
  const candidates = pending.state === 'missing' ? [] : [pending]
  if (main.state !== 'valid') {
    const swap = await inspect(SWAP, get)
    if (swap.state !== 'missing') candidates.push(swap)
  }
  const valid = candidates.filter((file) => file.state === 'valid')
  const preview =
    !['valid', 'partial', 'unsupported'].includes(main.state) && valid.length === 1
      ? valid[0]
      : undefined
  return {
    main,
    candidates,
    metadata: preview?.metadata ?? main.metadata,
    previewName: preview?.name,
    blocked: !['valid', 'missing'].includes(main.state) || candidates.length > 0
  }
}
async function writableSnapshot(directory: FileSystemDirectoryHandle) {
  const snapshot = await inspectAlbumNotes(directory)
  if (snapshot.blocked) throw new PhotoMetadataError('invalid')
  return snapshot
}
export async function readAlbumMetadata(
  directory: FileSystemDirectoryHandle
): Promise<AlbumMetadata> {
  const { metadata } = await writableSnapshot(directory)
  return {
    version: 1,
    photos: Object.fromEntries(
      Object.entries(metadata.photos)
        .map(([key, value]) => [key, { note: normalizePhotoNote(value.note) }] as const)
        .filter(([, value]) => value.note)
    )
  }
}
async function writeVerified(directory: FileSystemDirectoryHandle, name: string, text: string) {
  const handle = await directory.getFileHandle(name, { create: true })
  const writer = await handle.createWritable()
  try {
    await writer.write(text)
    await writer.close()
  } catch (error) {
    await writer.abort(error).catch(() => undefined)
    throw error
  }
  if ((await (await handle.getFile()).text()) !== text)
    throw new PhotoMetadataError('verificationFailed')
}
async function assertText(
  directory: FileSystemDirectoryHandle,
  name: string,
  expected: string | null
) {
  const file = await filesIn(directory)(name)
  if ((file ? await file.text() : null) !== expected) throw new PhotoMetadataError('changed')
}
async function writeMetadata(
  directory: FileSystemDirectoryHandle,
  metadata: AlbumMetadata,
  baseline: string | null
) {
  const text = JSON.stringify(metadata, null, 2) + '\n'
  await assertText(directory, PENDING, null)
  await assertText(directory, ALBUM_METADATA_FILE_NAME, baseline)
  await writeVerified(directory, PENDING, text)
  parseAlbumMetadata(text)
  await assertText(directory, ALBUM_METADATA_FILE_NAME, baseline)
  await assertText(directory, PENDING, text)
  await writeVerified(directory, ALBUM_METADATA_FILE_NAME, text)
  // A leftover pending file is surfaced on the next scan. The verified save succeeded.
  try {
    await assertText(directory, PENDING, text)
    await directory.removeEntry(PENDING)
  } catch {
    /* keep for recovery */
  }
  return text
}
async function backupOriginal(directory: FileSystemDirectoryHandle, name: string) {
  const source = await filesIn(directory)(name)
  if (!source) return
  const backup = name + '.' + crypto.randomUUID() + '.bak'
  await assertText(directory, backup, null)
  const handle = await directory.getFileHandle(backup, { create: true })
  const writer = await handle.createWritable()
  try {
    await writer.write(source)
    await writer.close()
  } catch (error) {
    await writer.abort(error).catch(() => undefined)
    throw error
  }
  const original = new Uint8Array(await source.arrayBuffer())
  const copy = new Uint8Array(await (await handle.getFile()).arrayBuffer())
  if (original.length !== copy.length || !original.every((byte, i) => byte === copy[i]))
    throw new PhotoMetadataError('verificationFailed')
}
/** null keeps the current valid version. Never delete a browser-owned swap file. */
export async function recoverAlbumNotes(
  directory: FileSystemDirectoryHandle,
  shown: AlbumNoteSnapshot,
  choice: string | null
) {
  if (!navigator.locks?.request) throw new PhotoMetadataError('lockUnavailable')
  return navigator.locks.request(METADATA_WRITE_LOCK, async () => {
    const current = await inspectAlbumNotes(directory)
    const version = (s: AlbumNoteSnapshot) =>
      JSON.stringify([s.main, ...s.candidates].map((f) => [f.name, f.state, f.text]))
    if (version(current) !== version(shown)) throw new PhotoMetadataError('changed')
    if (current.main.state === 'unreadable') throw new PhotoMetadataError('invalid')
    const source = current.candidates.find((f) => f.name === choice && f.state === 'valid')
    if ((choice !== null && !source) || (choice === null && current.main.state !== 'valid'))
      throw new PhotoMetadataError('invalid')
    const pending = current.candidates.find((f) => f.name === PENDING)
    if (pending && pending.state === 'unreadable') throw new PhotoMetadataError('invalid')
    if (pending && pending.text !== (source?.text ?? current.main.text))
      await backupOriginal(directory, PENDING)
    if (source) {
      await backupOriginal(directory, ALBUM_METADATA_FILE_NAME)
      await assertText(directory, source.name, source.text)
      await assertText(directory, ALBUM_METADATA_FILE_NAME, current.main.text)
      await writeVerified(directory, ALBUM_METADATA_FILE_NAME, source.text!)
    }
    if (pending) {
      await assertText(directory, PENDING, pending.text)
      await assertText(directory, ALBUM_METADATA_FILE_NAME, source?.text ?? current.main.text)
      try {
        await directory.removeEntry(PENDING)
      } catch {
        return { cleanupPending: true }
      }
    }
    return { cleanupPending: false }
  })
}
/** 在共享写锁内迁移备注，再删除源文件；失败恢复元数据，恢复失败则要求调用方保留目标副本。 */
export async function transferPhotoNote(
  directory: FileSystemDirectoryHandle,
  from: string | string[],
  to: string | null,
  fallback: string,
  removeSource: () => Promise<void>
): Promise<string> {
  const transfer = async () => {
    const baseline = await writableSnapshot(directory)
    const original = baseline.metadata
    const keys = Array.isArray(from) ? from : [from]
    const note = normalizePhotoNote(original.photos[keys[0]]?.note ?? fallback)
    const next: AlbumMetadata = { version: 1, photos: { ...original.photos } }
    for (const key of keys) delete next.photos[key]
    if (to) {
      delete next.photos[to]
      // 空备注也保留回收键，区分新回收记录与旧版按原名保存的备注。
      if (note || to.startsWith('trash/')) next.photos[to] = { note }
    }
    const changed = JSON.stringify(next) !== JSON.stringify(original)
    if (changed && !navigator.locks?.request) throw new PhotoMetadataError('lockUnavailable')
    let committed: string | undefined
    try {
      if (changed) committed = await writeMetadata(directory, next, baseline.main.text)
      await removeSource()
    } catch (error) {
      if (committed !== undefined) {
        try {
          await writeMetadata(directory, original, committed)
        } catch {
          throw Object.assign(new PhotoMetadataError('verificationFailed'), {
            preserveTarget: true
          })
        }
      }
      throw error
    }
    return note
  }
  return navigator.locks?.request
    ? navigator.locks.request(METADATA_WRITE_LOCK, transfer)
    : transfer()
}

/** 回收站须保留空备注键，以识别已迁移的新记录。 */
export async function readTrashNotes(
  directory: FileSystemDirectoryHandle
): Promise<Record<string, { note: string }>> {
  return (await inspectAlbumNotes(directory)).metadata.photos
}

/** 同站点窗口共用写锁；不同目录也短暂串行，避免同名或不同句柄导致锁身份冲突。 */
export async function savePhotoNote(
  directory: FileSystemDirectoryHandle,
  photoName: string,
  note: string,
  expectedNote?: string
): Promise<string> {
  // 不用仅限当前页面的队列冒充跨窗口保护；缺少锁能力时停止写入。
  if (typeof navigator === 'undefined' || !navigator.locks?.request)
    throw new PhotoMetadataError('lockUnavailable')
  return navigator.locks.request(METADATA_WRITE_LOCK, async () => {
    const snapshot = await writableSnapshot(directory)
    const metadata = snapshot.metadata
    const currentNote = Object.hasOwn(metadata.photos, photoName)
      ? metadata.photos[photoName].note
      : ''
    if (
      expectedNote !== undefined &&
      normalizePhotoNote(currentNote) !== normalizePhotoNote(expectedNote)
    ) {
      throw new PhotoMetadataError('changed')
    }
    const normalized = normalizePhotoNote(note)
    // 保留其他照片的原始备注，只修改本次目标，避免顺手清洗造成数据损失。
    metadata.photos = { ...metadata.photos, [photoName]: { note: normalized } }
    if (!normalized) delete metadata.photos[photoName]
    await writeMetadata(directory, metadata, snapshot.main.text)
    return normalized
  })
}
