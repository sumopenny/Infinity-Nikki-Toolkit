import type { BackupConfig, ModuleProgress } from '../../src/utils/directory-backup/engine'
import { loadConfig, syncModule } from '../../src/utils/directory-backup/engine'
import {
  BACKUP_SETTINGS_STORE,
  runStoreRequest,
  DB_NAME,
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE
} from '../../src/utils/file-system/database'
import { runDatabaseTransaction } from '../../src/utils/file-system/transaction'
import {
  digest,
  DIRECTORY_NAME,
  MODULE_NAMES,
  moduleDirectory
} from '../../src/utils/directory-backup/disk'
import type { BackupModule } from '../../src/utils/directory-backup/changeJournal'

export interface IoEvent {
  kind: 'read' | 'write' | 'written' | 'delete' | 'deleted' | 'enumerate'
  path: string
  bytes?: number
}
export class MemoryDisk {
  files = new Map<string, Uint8Array>()
  dirs = new Set<string>([''])
  events: IoEvent[] = []
  hook?: (event: IoEvent) => void | Promise<void>
  granted = true
  async event(event: IoEvent) {
    this.events.push(event)
    await this.hook?.(event)
  }
  failOnce(predicate: (event: IoEvent) => boolean, error = new Error('injected interruption')) {
    this.hook = (event) => {
      if (predicate(event)) {
        this.hook = undefined
        throw error
      }
    }
  }
}
function missing(): never {
  throw new DOMException('Not found', 'NotFoundError')
}
class MemoryFile {
  readonly kind = 'file'
  constructor(
    readonly disk: MemoryDisk,
    readonly path: string,
    readonly name: string
  ) {}
  async getFile() {
    const value = this.disk.files.get(this.path) ?? missing()
    await this.disk.event({ kind: 'read', path: this.path, bytes: value.byteLength })
    return new File([value], this.name)
  }
  async createWritable() {
    if (!this.disk.granted) throw new DOMException('Permission denied', 'NotAllowedError')
    let data: Uint8Array | undefined
    return {
      write: async (value: Blob | ArrayBuffer | Uint8Array | string) => {
        data =
          typeof value === 'string'
            ? new TextEncoder().encode(value)
            : new Uint8Array(
                value instanceof Blob
                  ? await value.arrayBuffer()
                  : value instanceof Uint8Array
                    ? value
                    : value
              )
      },
      close: async () => {
        if (!data) return
        await this.disk.event({ kind: 'write', path: this.path, bytes: data.byteLength })
        this.disk.files.set(this.path, data)
        await this.disk.event({ kind: 'written', path: this.path, bytes: data.byteLength })
      },
      abort: async () => {
        data = undefined
      }
    }
  }
}
export class MemoryDirectory {
  readonly kind = 'directory'
  constructor(
    readonly disk = new MemoryDisk(),
    readonly path = '',
    readonly name = 'memory-backup'
  ) {}
  async queryPermission() {
    return this.disk.granted ? 'granted' : 'denied'
  }
  async requestPermission() {
    return this.queryPermission()
  }
  async isSameEntry(other: MemoryDirectory) {
    return this.disk === other.disk && this.path === other.path
  }
  child(name: string) {
    if (!name || /[\\/]/.test(name) || name === '.' || name === '..')
      throw new Error('Invalid segment')
    return this.path ? `${this.path}/${name}` : name
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const path = this.child(name)
    if (!this.disk.dirs.has(path)) {
      if (!options?.create) missing()
      this.disk.dirs.add(path)
    }
    return new MemoryDirectory(this.disk, path, name)
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const path = this.child(name)
    if (!this.disk.files.has(path)) {
      if (!options?.create) missing()
      this.disk.files.set(path, new Uint8Array())
    }
    return new MemoryFile(this.disk, path, name)
  }
  async removeEntry(name: string, options?: { recursive?: boolean }) {
    const path = this.child(name)
    await this.disk.event({ kind: 'delete', path })
    if (!this.disk.files.delete(path)) {
      if (!this.disk.dirs.has(path)) missing()
      const children = [...this.disk.files.keys(), ...this.disk.dirs].filter((key) =>
        key.startsWith(path + '/')
      )
      if (children.length && !options?.recursive)
        throw new DOMException('Not empty', 'InvalidModificationError')
      for (const child of children) {
        this.disk.files.delete(child)
        this.disk.dirs.delete(child)
      }
      this.disk.dirs.delete(path)
    }
    await this.disk.event({ kind: 'deleted', path })
  }
  async *entries(): AsyncGenerator<[string, MemoryDirectory | MemoryFile]> {
    await this.disk.event({ kind: 'enumerate', path: this.path })
    const prefix = this.path ? this.path + '/' : ''
    for (const path of [...this.disk.dirs]) {
      const name = path.slice(prefix.length)
      if (path.startsWith(prefix) && name && !name.includes('/'))
        yield [name, new MemoryDirectory(this.disk, path, name)]
    }
    for (const path of [...this.disk.files.keys()]) {
      const name = path.slice(prefix.length)
      if (path.startsWith(prefix) && name && !name.includes('/'))
        yield [name, new MemoryFile(this.disk, path, name)]
    }
  }
}
export const asHandle = (value: MemoryDirectory): FileSystemDirectoryHandle =>
  value as unknown as FileSystemDirectoryHandle
export const png = () =>
  new Blob(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=',
        'base64'
      )
    ],
    { type: 'image/png' }
  )
export const date = '2026-11-03T12:00:00.000Z'
export const outfit = (id: string, note = '', image?: Blob) => ({
  version: 1,
  id,
  code: id,
  codeKey: id,
  image: image ? `${id}.png` : '',
  ...(image ? { imageSize: image.size } : {}),
  tags: [] as string[],
  note,
  createdAt: date,
  updatedAt: date
})
export async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
}
export async function setup(
  directory = new MemoryDirectory(),
  modules: BackupModule[] = ['outfits']
) {
  const config = await loadConfig()
  config.handle = asHandle(directory)
  config.directoryName = directory.name
  for (const module of modules) config.enabled[module] = true
  await saveConfig(config)
  return { directory, disk: directory.disk, config }
}
export async function reloadConfig(directory: MemoryDirectory) {
  // fake-indexeddb 不能像浏览器一样克隆原生文件句柄；恢复夹具的内存句柄，而不是在产品中绕过权限。
  const config = await loadConfig()
  config.handle = asHandle(directory)
  return config
}
export async function sync(config: BackupConfig, module: BackupModule = 'outfits') {
  const status: ModuleProgress = { enabled: true, count: 0, lastSuccess: null, state: 'waiting' }
  await syncModule(config, module, status, () => undefined)
  return status
}
export async function putOutfit(id: string, note = '', image?: Blob) {
  const raw = outfit(id, note, image)
  const sha256 = image ? await digest(await image.arrayBuffer()) : undefined
  await runDatabaseTransaction(
    [OUTFITS_STORE, ...(image ? [OUTFIT_IMAGES_STORE] : [])],
    'readwrite',
    async (tx) => {
      tx.objectStore(OUTFITS_STORE).put(raw)
      if (image)
        tx.objectStore(OUTFIT_IMAGES_STORE).put({
          id,
          blob: image,
          size: image.size,
          sha256,
          extension: 'png'
        })
    }
  )
  return raw
}
export async function moduleDir(directory: MemoryDirectory, module: BackupModule = 'outfits') {
  const root = asHandle(await directory.getDirectoryHandle(DIRECTORY_NAME))
  return moduleDirectory(root, module)
}
export const modulePrefix = (module: BackupModule = 'outfits') =>
  `${DIRECTORY_NAME}/${MODULE_NAMES[module]}/`

export async function saveConfig(config: BackupConfig): Promise<void> {
  await runStoreRequest(BACKUP_SETTINGS_STORE, 'readwrite', (store) => store.put(config))
}
