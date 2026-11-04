import fs from 'node:fs/promises'
import path from 'node:path'
import type { IoEvent } from './directoryBackupFs'

export class NativeDisk {
  events: IoEvent[] = []
  files = new Map<string, number>()
  peakTemporaryBytes = 0
  peakTotalBytes = 0
  temporaryBytes = 0
  totalBytes = 0
  reads = 0
  writes = 0
  readBytes = 0
  writtenBytes = 0
  hook?: (event: IoEvent) => Promise<void> | void
  constructor(readonly root: string) {}
  async event(event: IoEvent) {
    // 大数据测试不保留无限事件数组，计数和占用统计独立维护。
    if (this.events.length < 200000) this.events.push(event)
    if (event.kind === 'read') {
      this.reads++
      this.readBytes += event.bytes ?? 0
    }
    if (event.kind === 'written') {
      this.writes++
      this.writtenBytes += event.bytes ?? 0
      const delta = (event.bytes ?? 0) - (this.files.get(event.path) ?? 0)
      this.files.set(event.path, event.bytes ?? 0)
      this.totalBytes += delta
      if (event.path.includes('/.写入中/')) this.temporaryBytes += delta
      this.peakTemporaryBytes = Math.max(this.peakTemporaryBytes, this.temporaryBytes)
      this.peakTotalBytes = Math.max(this.peakTotalBytes, this.totalBytes)
    }
    if (event.kind === 'deleted') {
      for (const [file, bytes] of this.files)
        if (file === event.path || file.startsWith(event.path + '/')) {
          this.totalBytes -= bytes
          if (file.includes('/.写入中/')) this.temporaryBytes -= bytes
          this.files.delete(file)
        }
    }
    await this.hook?.(event)
  }
}
function segment(name: string) {
  if (!name || /[\\/]/.test(name) || name === '.' || name === '..')
    throw new Error('Invalid file segment')
}
function mapError(error: unknown): never {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT')
    throw new DOMException('Not found', 'NotFoundError')
  throw error
}
export class NativeDirectory {
  readonly kind = 'directory'
  readonly name: string
  constructor(
    readonly disk: NativeDisk,
    readonly relative = ''
  ) {
    this.name = path.basename(relative || disk.root)
  }
  async queryPermission() {
    return 'granted'
  }
  async requestPermission() {
    return 'granted'
  }
  async isSameEntry(other: NativeDirectory) {
    return this.disk.root === other.disk.root && this.relative === other.relative
  }
  resolvePath(name: string) {
    segment(name)
    return this.relative ? `${this.relative}/${name}` : name
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const relative = this.resolvePath(name),
      absolute = path.join(this.disk.root, relative)
    try {
      if (options?.create) await fs.mkdir(absolute, { recursive: true })
      const stat = await fs.lstat(absolute)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe directory')
      return new NativeDirectory(this.disk, relative)
    } catch (error) {
      return mapError(error)
    }
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const relative = this.resolvePath(name),
      absolute = path.join(this.disk.root, relative)
    try {
      if (options?.create) await (await fs.open(absolute, 'a')).close()
      const stat = await fs.lstat(absolute)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe file')
      return new NativeFile(this.disk, relative, name)
    } catch (error) {
      return mapError(error)
    }
  }
  async removeEntry(name: string, options?: { recursive?: boolean }) {
    const relative = this.resolvePath(name),
      absolute = path.join(this.disk.root, relative)
    try {
      await this.disk.event({ kind: 'delete', path: relative })
      await fs.rm(absolute, { recursive: options?.recursive ?? false })
      await this.disk.event({ kind: 'deleted', path: relative })
    } catch (error) {
      mapError(error)
    }
  }
  async *entries() {
    await this.disk.event({ kind: 'enumerate', path: this.relative })
    try {
      for (const entry of await fs.readdir(path.join(this.disk.root, this.relative), {
        withFileTypes: true
      })) {
        if (entry.isSymbolicLink()) throw new Error('Symlinks not supported in test directory')
        const relative = this.resolvePath(entry.name)
        yield [
          entry.name,
          entry.isDirectory()
            ? new NativeDirectory(this.disk, relative)
            : new NativeFile(this.disk, relative, entry.name)
        ] as const
      }
    } catch (error) {
      mapError(error)
    }
  }
}
class NativeFile {
  readonly kind = 'file'
  constructor(
    readonly disk: NativeDisk,
    readonly relative: string,
    readonly name: string
  ) {}
  async getFile() {
    try {
      const bytes = await fs.readFile(path.join(this.disk.root, this.relative))
      await this.disk.event({ kind: 'read', path: this.relative, bytes: bytes.byteLength })
      return new File([bytes], this.name)
    } catch (error) {
      return mapError(error)
    }
  }
  async createWritable() {
    const absolute = path.join(this.disk.root, this.relative),
      temporary = absolute + '.native-test-writing'
    let data: Uint8Array | undefined
    return {
      write: async (value: Blob | Uint8Array | ArrayBuffer | string) => {
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
        await this.disk.event({ kind: 'write', path: this.relative, bytes: data.byteLength })
        await fs.writeFile(temporary, data)
        await fs.rename(temporary, absolute)
        await this.disk.event({ kind: 'written', path: this.relative, bytes: data.byteLength })
      },
      abort: async () => {
        data = undefined
        await fs.rm(temporary, { force: true })
      }
    }
  }
}
export const nativeHandle = (directory: NativeDirectory) =>
  directory as unknown as FileSystemDirectoryHandle
