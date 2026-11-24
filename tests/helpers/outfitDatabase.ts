import 'fake-indexeddb/auto'
import { afterEach, beforeEach, vi } from 'vitest'
import { DB_NAME } from '../../src/utils/file-system/database'

export const webp = (name = 'look.webp', content = 'image', timestamp = 100) =>
  new File(['RIFF0000WEBP' + content], name, { type: 'image/webp', lastModified: timestamp })
export async function resetOutfitDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Database still open'))
  })
}
export function setupOutfitDatabaseTests() {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 10, height: 10, close() {} }))
    )
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob: (callback: BlobCallback) =>
          callback(new Blob(['RIFF0000WEBPconverted'], { type: 'image/webp' }))
      })
    })
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await resetOutfitDatabase()
  })
}

export class OutfitDirectory {
  readonly kind = 'directory'
  token = crypto.randomUUID()
  files = new Map<string, File>()
  directories = new Map<string, OutfitDirectory>()
  denied = false
  removed: string[] = []
  constructor(readonly name = 'album') {}
  async isSameEntry(other: OutfitDirectory) {
    return this.token === other.token
  }
  async getDirectoryHandle(name: string) {
    if (this.denied) throw new DOMException('Denied', 'NotAllowedError')
    const directory = this.directories.get(name)
    if (!directory) throw new DOMException('Missing', 'NotFoundError')
    return directory
  }
  async getFileHandle(name: string) {
    if (!this.files.has(name)) throw new DOMException('Missing', 'NotFoundError')
    return {
      kind: 'file' as const,
      getFile: async () => {
        const file = this.files.get(name)
        if (!file) throw new DOMException('Missing', 'NotFoundError')
        return file
      }
    }
  }
  async removeEntry(name: string, options?: FileSystemRemoveOptions) {
    if (this.denied) throw new DOMException('Denied', 'NotAllowedError')
    const child = this.directories.get(name)
    if (child && !options?.recursive && (child.files.size || child.directories.size))
      throw new DOMException('Not empty', 'InvalidModificationError')
    if (!this.files.delete(name) && !this.directories.delete(name))
      throw new DOMException('Missing', 'NotFoundError')
    this.removed.push(name)
  }
  async resolve(other: OutfitDirectory): Promise<string[] | null> {
    if (await this.isSameEntry(other)) return []
    for (const [name, child] of this.directories) {
      const path = await child.resolve(other)
      if (path) return [name, ...path]
    }
    return null
  }
  async *entries() {
    for (const [name] of this.files) yield [name, await this.getFileHandle(name)]
    for (const [name] of this.directories) yield [name, { kind: 'directory' }]
  }
  json(name: string, value: unknown, timestamp = 100) {
    this.files.set(
      name,
      new File([JSON.stringify(value)], name, { type: 'application/json', lastModified: timestamp })
    )
  }
  child(name: string) {
    const child = new OutfitDirectory(name)
    this.directories.set(name, child)
    return child
  }
}
export const directoryHandle = (directory: OutfitDirectory) =>
  directory as unknown as FileSystemDirectoryHandle
export function gameSource() {
  const game = new OutfitDirectory('X6Game'),
    saved = game.child('Saved'),
    share = saved.child('ShareCode'),
    diy = saved.child('DIY')
  function publish(
    playerId: string,
    code: string,
    timestamp: number,
    imageTime = timestamp,
    content = code
  ) {
    share.json(`${playerId}-sharecode.json`, [{ RoleID: playerId, ShareCode: code }], timestamp)
    const player = diy.directories.get(playerId) ?? diy.child(playerId)
    player.files.set('latest.webp', webp('latest.webp', content, imageTime))
    return player
  }
  return { game, share, diy, publish, source: { x6GameDirectory: directoryHandle(game) } }
}
