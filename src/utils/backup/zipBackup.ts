import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { retainDownload, requestBlobDownload } from './downloadFallback'

import type { BackupLimits } from './backupLimits'
export {
  HOME_BACKUP_LIMITS,
  OUTFIT_BACKUP_LIMITS,
  CAMERA_BACKUP_LIMITS,
  type BackupLimits
} from './backupLimits'
export interface BackupFile {
  name: string
  blob: Blob
}
export interface BackupItem<T> {
  record: T
  files: BackupFile[]
}
export interface BackupPart {
  manifest: Uint8Array
  files: BackupFile[]
  count: number
}

/** Every part contains its own complete manifest and referenced images. */
export function planBackupParts<T>(
  items: BackupItem<T>[],
  makeManifest: (records: T[]) => unknown,
  manifestName: string,
  limits: BackupLimits
): BackupPart[] {
  const parts: BackupPart[] = []
  const base = strToU8(JSON.stringify(makeManifest([]))).length
  let current: BackupItem<T>[] = [],
    rowBytes = 0,
    imageBytes = 0,
    entries = 1,
    overhead = 22 + entryOverhead(manifestName)
  const fits = (
    rows: number,
    jsonBytes: number,
    images: number,
    count: number,
    headers: number
  ) => {
    const manifestSize = base + jsonBytes + Math.max(0, rows - 1)
    // Conservative DEFLATE expansion allowance; actual ZIP size is also checked while writing.
    const archiveBound = images + manifestSize + Math.ceil(manifestSize / 16000) * 5 + 64 + headers
    return (
      rows <= limits.records &&
      count <= limits.entries &&
      manifestSize <= limits.manifest &&
      archiveBound <= limits.bytes
    )
  }
  const finish = () => {
    const manifest = strToU8(JSON.stringify(makeManifest(current.map((item) => item.record))))
    parts.push({ manifest, files: current.flatMap((item) => item.files), count: current.length })
    current = []
    rowBytes = 0
    imageBytes = 0
    entries = 1
    overhead = 22 + entryOverhead(manifestName)
  }
  if (!fits(0, 0, 0, 1, overhead))
    throw new Error('备份标签或清单过大 / Backup manifest is too large')
  for (const item of items) {
    if (item.files.some((file) => !file.blob.size || file.blob.size > limits.image))
      throw new Error('单张备份图片为空或过大 / Backup image is empty or too large')
    const bytes = strToU8(JSON.stringify(item.record)).length
    const images = item.files.reduce((sum, file) => sum + file.blob.size, 0)
    const headers = item.files.reduce((sum, file) => sum + entryOverhead(file.name), 0)
    if (
      !fits(
        current.length + 1,
        rowBytes + bytes,
        imageBytes + images,
        entries + item.files.length,
        overhead + headers
      )
    ) {
      if (current.length) finish()
      if (!fits(1, bytes, images, 1 + item.files.length, overhead + headers))
        throw new Error('单条记录超过备份容量 / One record exceeds the backup limit')
    }
    current.push(item)
    rowBytes += bytes
    imageBytes += images
    entries += item.files.length
    overhead += headers
  }
  if (current.length || !parts.length) finish()
  return parts
}

function entryOverhead(name: string): number {
  return 92 + 2 * strToU8(name).length
}

export function backupPartName(base: string, index: number, total: number): string {
  return (
    base +
    (total > 1
      ? `_part-${String(index + 1).padStart(3, '0')}-of-${String(total).padStart(3, '0')}`
      : '') +
    '.zip'
  )
}

export async function streamBackupPart(
  part: BackupPart,
  manifestName: string,
  limits: BackupLimits,
  write: (bytes: Uint8Array) => Promise<void>
): Promise<void> {
  let pending = Promise.resolve()
  let bytesWritten = 0
  let complete!: () => void, fail!: (error: Error) => void
  const done = new Promise<void>((resolve, reject) => {
    complete = resolve
    fail = reject
  })
  void done.catch(() => undefined)
  const archive = new Zip((error, chunk, final) => {
    if (error) {
      fail(error)
      return
    }
    bytesWritten += chunk.length
    pending = pending.then(() => {
      if (bytesWritten > limits.bytes)
        throw new Error('备份文件超过容量 / Archive size limit exceeded')
      return write(chunk)
    })
    void pending.catch(fail)
    if (final) pending.then(complete, fail)
  })
  try {
    const manifest = new ZipDeflate(manifestName, { level: 6 })
    archive.add(manifest)
    manifest.push(part.manifest, true)
    await pending
    const names = new Set([manifestName])
    for (const file of part.files) {
      if (names.has(file.name)) throw new Error('备份图片路径重复 / Duplicate backup image')
      names.add(file.name)
      const entry = new ZipPassThrough(file.name)
      archive.add(entry)
      const reader = file.blob.stream().getReader()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          entry.push(value)
          await pending
        }
        entry.push(new Uint8Array(), true)
        await pending
      } catch (error) {
        await reader.cancel(error).catch(() => undefined)
        throw error
      } finally {
        reader.releaseLock()
      }
    }
    archive.end()
    await done
  } catch (error) {
    archive.terminate()
    await pending.catch(() => undefined)
    throw error
  }
}

export type BackupDownload = (fileName: string, blob: Blob) => void | Promise<void>

export function downloadBackupBlob(fileName: string, blob: Blob, module = 'default'): void {
  retainDownload(fileName, blob, module)
  requestBlobDownload(fileName, blob)
}

export async function downloadBackupParts(
  base: string,
  parts: BackupPart[],
  manifestName: string,
  limits: BackupLimits,
  download: BackupDownload = downloadBackupBlob
): Promise<string[]> {
  const names: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const name = backupPartName(base, i, parts.length)
    await download(name, await backupPartBlob(parts[i], manifestName, limits))
    names.push(name)
  }
  return names
}

export async function backupPartBlob(
  part: BackupPart,
  manifestName: string,
  limits: BackupLimits
): Promise<Blob> {
  const chunks: Uint8Array[] = []
  await streamBackupPart(part, manifestName, limits, async (chunk) => {
    chunks.push(chunk.slice())
  })
  return new Blob(chunks, { type: 'application/zip' })
}
