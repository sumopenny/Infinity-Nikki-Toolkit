import { sha256Hex } from '../sha256'
import { createUuid } from '../uuid'
import type { BackupModule, DirtyChange } from './changeJournal'

export const DIRECTORY_NAME = '暖立方备份'
export const FORMAT = 'nuan-directory-original-backup'
export const VERSION = 1
export const MODULE_NAMES: Record<BackupModule, string> = {
  outfits: '搭配码',
  home: '家园方案',
  camera: '拍照参数收藏'
}
export const MODULE_LABELS = { ...MODULE_NAMES, camera: '相机参数收藏' }
export const MODULES: BackupModule[] = ['outfits', 'home', 'camera']
export const HASH = /^[a-f0-9]{64}$/
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const MAX_JSON_BYTES = 8 * 1024 * 1024
const MAX_FILE_BYTES = 256 * 1024 * 1024
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
export type IndexKind = 'record' | 'ignored'
export interface ModuleManifest {
  format: typeof FORMAT
  version: 1
  module: BackupModule
  count: number
  imageBytes: number
  initialized: boolean
  lastSuccess: string | null
  sourceRevision: string
  lastBatch: string
  indexes: Record<IndexKind, Record<string, string>>
  tagDigest: string | null
}
export interface RootManifest {
  format: typeof FORMAT
  version: 1
  backupId: string
  sourceId: string
  sourceOrigin?: string
  createdAt: string
  modulePaths?: Partial<Record<BackupModule, string>>
}
export interface Entry {
  version: 1
  module: BackupModule
  id: string
  revision: string
  value: unknown
  image: { path: string; sha256: string; size: number; type: string } | null
}
export interface Operation {
  path: string
  action: 'write' | 'delete'
  sha256?: string
  payload?: number
}
export interface BatchReceipt {
  sourceId: string
  binding: string
  changes: DirtyChange[]
}
export interface StageManifest {
  format: typeof FORMAT
  version: 1
  id: string
  module: BackupModule
  operations: Operation[]
  preparedAt: string
  receipt?: BatchReceipt
}
export interface DiskOperation {
  path: string
  data?: Blob | Uint8Array
}
export const jsonBytes = (value: unknown): Uint8Array =>
  encoder.encode(JSON.stringify(value, null, 2) + '\n')
export const parseJson = <T>(bytes: ArrayBuffer): T => JSON.parse(decoder.decode(bytes)) as T
export const digest = (bytes: ArrayBuffer): Promise<string> => sha256Hex(bytes)
export const keyHash = (id: string): Promise<string> =>
  digest(encoder.encode(id).buffer as ArrayBuffer)
export const recordPath = (hash: string) => `当前记录/${hash.slice(0, 2)}/${hash}.json`
export const ignoredPath = (hash: string) => `忽略搭配码/${hash.slice(0, 2)}/${hash}.json`
export const indexPath = (kind: IndexKind, bucket: string) => `索引/${kind}/${bucket}.json`
export function defaultManifest(module: BackupModule): ModuleManifest {
  return {
    format: FORMAT,
    version: VERSION,
    module,
    count: 0,
    imageBytes: 0,
    initialized: false,
    lastSuccess: null,
    sourceRevision: '',
    lastBatch: '',
    indexes: { record: {}, ignored: {} },
    tagDigest: null
  }
}
export function validatePath(path: string): string[] {
  if (
    typeof path !== 'string' ||
    !path ||
    path.length > 320 ||
    path.includes('\\') ||
    path
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[. ]$/.test(part) ||
          /[<>:"|?*\x00-\x1f]/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
      )
  )
    throw new Error('备份目录包含不安全路径')
  return path.split('/')
}
const directoryCache = new WeakMap<
  FileSystemDirectoryHandle,
  Map<string, FileSystemDirectoryHandle>
>()
export async function directoryAt(root: FileSystemDirectoryHandle, path: string, create = false) {
  let cache = directoryCache.get(root)
  if (!cache) {
    cache = new Map()
    directoryCache.set(root, cache)
  }
  let dir = root,
    prefix = ''
  for (const part of validatePath(path)) {
    prefix = prefix ? `${prefix}/${part}` : part
    const existing = cache.get(prefix)
    dir = existing ?? (await dir.getDirectoryHandle(part, { create }))
    if (!existing) cache.set(prefix, dir)
  }
  return dir
}
async function parentAt(root: FileSystemDirectoryHandle, path: string, create = false) {
  const parts = validatePath(path)
  const dir =
    parts.length > 1 ? await directoryAt(root, parts.slice(0, -1).join('/'), create) : root
  return { dir, name: parts[parts.length - 1] }
}
export async function readBytes(
  root: FileSystemDirectoryHandle,
  path: string,
  limit = MAX_FILE_BYTES
): Promise<ArrayBuffer | null> {
  try {
    const { dir, name } = await parentAt(root, path)
    const file = await (await dir.getFileHandle(name)).getFile()
    if (file.size > limit) throw new Error(`备份文件过大，已停止读取：${path}`)
    return await file.arrayBuffer()
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return null
    throw error
  }
}
export async function readJson<T>(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<T | null> {
  const bytes = await readBytes(root, path, MAX_JSON_BYTES)
  return bytes ? parseJson<T>(bytes) : null
}
export async function putBytes(
  root: FileSystemDirectoryHandle,
  path: string,
  bytes: Blob | ArrayBuffer | Uint8Array
): Promise<void> {
  const { dir, name } = await parentAt(root, path, true)
  const writer = await (await dir.getFileHandle(name, { create: true })).createWritable()
  try {
    await writer.write(bytes instanceof Uint8Array ? new Blob([bytes]) : bytes)
    await writer.close()
  } catch (error) {
    await writer.abort().catch(() => undefined)
    throw error
  }
}
export async function deleteFile(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  try {
    const { dir, name } = await parentAt(root, path)
    await dir.removeEntry(name)
  } catch (error) {
    if ((error as DOMException).name !== 'NotFoundError') throw error
  }
}
export function validateRoot(value: unknown): RootManifest {
  const info = value as RootManifest | null
  if (
    !info ||
    info.format !== FORMAT ||
    info.version !== VERSION ||
    !UUID.test(info.backupId) ||
    !UUID.test(info.sourceId) ||
    !Number.isFinite(Date.parse(info.createdAt))
  )
    throw new Error('备份目录身份或格式不兼容，禁止覆盖')
  if (info.modulePaths)
    for (const [module, path] of Object.entries(info.modulePaths)) {
      if (
        !MODULES.includes(module as BackupModule) ||
        typeof path !== 'string' ||
        !new RegExp(`^模块数据/[a-f0-9-]{36}/${MODULE_NAMES[module as BackupModule]}$`).test(path)
      )
        throw new Error('备份根目录含有非法模块路径')
      validatePath(path)
    }
  return info
}
export function validateManifest(value: unknown, module: BackupModule): ModuleManifest {
  const m = value as ModuleManifest | null
  if (
    !m ||
    m.format !== FORMAT ||
    m.version !== VERSION ||
    m.module !== module ||
    !Number.isSafeInteger(m.count) ||
    m.count < 0 ||
    !Number.isSafeInteger(m.imageBytes) ||
    m.imageBytes < 0 ||
    typeof m.initialized !== 'boolean' ||
    typeof m.sourceRevision !== 'string' ||
    typeof m.lastBatch !== 'string' ||
    (m.lastBatch !== '' && !UUID.test(m.lastBatch)) ||
    (m.lastSuccess !== null && !Number.isFinite(Date.parse(m.lastSuccess))) ||
    (m.tagDigest !== null && !HASH.test(m.tagDigest)) ||
    !m.indexes
  )
    throw new Error('模块备份信息缺失、损坏或版本不支持')
  for (const kind of ['record', 'ignored'] as const) {
    const indexes = m.indexes[kind]
    if (
      !indexes ||
      Array.isArray(indexes) ||
      typeof indexes !== 'object' ||
      Object.entries(indexes).some(([key, sha]) => !/^[a-f0-9]{2}$/.test(key) || !HASH.test(sha))
    )
      throw new Error('模块索引清单无效')
  }
  if (module !== 'outfits' && Object.keys(m.indexes.ignored).length)
    throw new Error('意外的模块索引类型')
  return m
}
export async function readModuleManifest(
  dir: FileSystemDirectoryHandle,
  module: BackupModule
): Promise<ModuleManifest> {
  const value = await readJson<ModuleManifest>(dir, '模块信息.json')
  return validateManifest(value, module)
}
export async function readIndex(
  dir: FileSystemDirectoryHandle,
  kind: IndexKind,
  bucket: string,
  expected?: string
): Promise<Record<string, string>> {
  if (!/^[a-f0-9]{2}$/.test(bucket)) throw new Error('非法索引分桶')
  const bytes = await readBytes(dir, indexPath(kind, bucket), MAX_JSON_BYTES)
  if (!bytes) {
    if (expected) throw new Error(`索引文件缺失：${kind}/${bucket}`)
    return {}
  }
  if (!expected || (await digest(bytes)) !== expected)
    throw new Error(`索引已被外部修改：${kind}/${bucket}`)
  const value = parseJson<Record<string, string>>(bytes)
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    Object.entries(value).some(
      ([key, sha]) => !HASH.test(key) || !HASH.test(sha) || key.slice(0, 2) !== bucket
    )
  )
    throw new Error('索引内容无效')
  return value
}
function validateOperationPath(path: string) {
  validatePath(path)
  if (
    path === '标签.json' ||
    path === '模块信息.json' ||
    /^索引\/(record|ignored)\/[a-f0-9]{2}\.json$/.test(path)
  )
    return
  const entry = /^(当前记录|忽略搭配码)\/([a-f0-9]{2})\/([a-f0-9]{64})\.json$/.exec(path)
  const image =
    /^图片\/([a-f0-9]{2})\/([a-f0-9]{64})\/[a-f0-9]{64}\.(webp|png|jpe?g|gif|bmp|avif|bin)$/.exec(
      path
    )
  if ((entry && entry[2] === entry[3].slice(0, 2)) || (image && image[1] === image[2].slice(0, 2)))
    return
  throw new Error('批次操作包含禁止写入的路径')
}
export async function validateStage(
  dir: FileSystemDirectoryHandle,
  id: string,
  module: BackupModule
): Promise<StageManifest | null> {
  if (!UUID.test(id)) throw new Error('无效的续写批次标识')
  const base = `.写入中/${id}`
  const ready = await readJson<{ sha256: string }>(dir, `${base}/ready.json`)
  if (!ready) return null // 未准备完成的批次尚未触碰正式文件。
  const bytes = await readBytes(dir, `${base}/manifest.json`, MAX_JSON_BYTES)
  if (!HASH.test(ready.sha256) || !bytes || (await digest(bytes)) !== ready.sha256)
    throw new Error('待续写批次清单不完整或已被修改')
  const m = parseJson<StageManifest>(bytes)
  if (
    m.format !== FORMAT ||
    m.version !== VERSION ||
    m.id !== id ||
    m.module !== module ||
    !Array.isArray(m.operations) ||
    !m.operations.length ||
    m.operations.length > 256 ||
    !Number.isFinite(Date.parse(m.preparedAt))
  )
    throw new Error('待续写批次格式无效')
  const paths = new Set<string>()
  for (const [i, op] of m.operations.entries()) {
    validateOperationPath(op.path)
    if (paths.has(op.path)) throw new Error('同一批次包含重复目标路径')
    paths.add(op.path)
    if (op.action === 'delete') {
      if (op.path === '模块信息.json' || op.path === '标签.json')
        throw new Error('不能删除模块校验信息')
      continue
    }
    if (op.action !== 'write' || op.payload !== i || !HASH.test(op.sha256 ?? ''))
      throw new Error('无效的批次操作')
    const data = await readBytes(
      dir,
      `${base}/payload-${i}`,
      op.path.endsWith('.json') ? MAX_JSON_BYTES : MAX_FILE_BYTES
    )
    if (!data || (await digest(data)) !== op.sha256)
      throw new Error(`待续写数据摘要不符：${op.path}`)
    if (op.path === '模块信息.json') {
      if (
        i !== m.operations.length - 1 ||
        validateManifest(parseJson(data), module).lastBatch !== id
      )
        throw new Error('批次缺少最后提交的模块状态')
    }
  }
  if (m.operations.at(-1)?.path !== '模块信息.json') throw new Error('批次缺少模块提交信息')
  if (
    m.receipt &&
    (!UUID.test(m.receipt.sourceId) ||
      !UUID.test(m.receipt.binding) ||
      !Array.isArray(m.receipt.changes) ||
      m.receipt.changes.length > 256 ||
      m.receipt.changes.some(
        (change) =>
          !Array.isArray(change.key) ||
          change.key.length !== 3 ||
          change.key[0] !== module ||
          !['record', 'image', 'tags', 'ignored', 'reset'].includes(change.key[1]) ||
          typeof change.key[2] !== 'string' ||
          !UUID.test(change.revision)
      ))
  )
    throw new Error('批次确认信息无效')
  return m
}
export async function finishStage(dir: FileSystemDirectoryHandle, id: string) {
  if (!UUID.test(id)) throw new Error('无效的批次清理路径')
  try {
    await (await dir.getDirectoryHandle('.写入中')).removeEntry(id, { recursive: true })
    const cache = directoryCache.get(dir)
    for (const key of cache?.keys() ?? [])
      if (key === `.写入中/${id}` || key.startsWith(`.写入中/${id}/`)) cache!.delete(key)
  } catch (error) {
    if ((error as DOMException).name !== 'NotFoundError') throw error
  }
}
/** 所有路径、清单和 payload 先只读验证；任何一项无效时绝不写正式目录。 */
export async function applyStage(
  dir: FileSystemDirectoryHandle,
  id: string,
  module: BackupModule,
  cleanup = true
): Promise<StageManifest> {
  const m = await validateStage(dir, id, module)
  if (!m) throw new Error('批次尚未准备完成，不能续写')
  for (const op of m.operations) {
    if (op.action === 'delete') {
      await deleteFile(dir, op.path)
      continue
    }
    const data = await readBytes(dir, `.写入中/${id}/payload-${op.payload}`)
    if (!data || (await digest(data)) !== op.sha256) throw new Error('暂存数据在校验后发生变化')
    await putBytes(dir, op.path, data)
    const written = await readBytes(dir, op.path)
    if (!written || (await digest(written)) !== op.sha256)
      throw new Error(`磁盘写入验证失败：${op.path}`)
  }
  if (cleanup) await finishStage(dir, id)
  return m
}
export async function stageAndApplyVerified(
  dir: FileSystemDirectoryHandle,
  module: BackupModule,
  operations: DiskOperation[],
  onStage?: (id: string) => void,
  receipt?: BatchReceipt,
  retain = false
): Promise<StageManifest> {
  const id = createUuid()
  if (!operations.length || operations.at(-1)?.path !== '模块信息.json')
    throw new Error('缺少批次提交信息')
  const final = operations.at(-1)!
  if (!(final.data instanceof Uint8Array)) throw new Error('模块信息必须为 JSON')
  const state = validateManifest(
    parseJson(
      final.data.buffer.slice(
        final.data.byteOffset,
        final.data.byteOffset + final.data.byteLength
      ) as ArrayBuffer
    ),
    module
  )
  const ops = [
    ...operations.slice(0, -1),
    { path: final.path, data: jsonBytes({ ...state, lastBatch: id }) }
  ]
  const base = `.写入中/${id}`
  const m: StageManifest = {
    format: FORMAT,
    version: VERSION,
    id,
    module,
    operations: [],
    preparedAt: new Date().toISOString(),
    ...(receipt ? { receipt } : {})
  }
  for (const [i, op] of ops.entries()) {
    validateOperationPath(op.path)
    if (!op.data) {
      m.operations.push({ path: op.path, action: 'delete' })
      continue
    }
    const size = op.data instanceof Blob ? op.data.size : op.data.byteLength
    if (size > (op.path.endsWith('.json') ? MAX_JSON_BYTES : MAX_FILE_BYTES))
      throw new Error(`备份文件超过格式允许的大小，浏览器数据已保留：${op.path}`)
    const data =
      op.data instanceof Blob
        ? await op.data.arrayBuffer()
        : (op.data.buffer.slice(
            op.data.byteOffset,
            op.data.byteOffset + op.data.byteLength
          ) as ArrayBuffer)
    const sha256 = await digest(data)
    await putBytes(dir, `${base}/payload-${i}`, data)
    const written = await readBytes(dir, `${base}/payload-${i}`)
    if (!written || (await digest(written)) !== sha256) throw new Error('暂存文件写入验证失败')
    m.operations.push({ path: op.path, action: 'write', sha256, payload: i })
  }
  const bytes = jsonBytes(m)
  await putBytes(dir, `${base}/manifest.json`, bytes)
  const actual = await readBytes(dir, `${base}/manifest.json`, MAX_JSON_BYTES)
  const sha256 = await digest(bytes.buffer as ArrayBuffer)
  if (!actual || (await digest(actual)) !== sha256) throw new Error('暂存清单写入验证失败')
  await putBytes(dir, `${base}/ready.json`, jsonBytes({ sha256 }))
  onStage?.(id)
  return applyStage(dir, id, module, !retain)
}
export async function discoverStages(dir: FileSystemDirectoryHandle): Promise<string[]> {
  try {
    const result: string[] = []
    for await (const [name, handle] of (await dir.getDirectoryHandle('.写入中')).entries()) {
      if (handle.kind !== 'directory' || !UUID.test(name)) throw new Error('发现未知的临时目录')
      result.push(name)
      if (result.length > 2) throw new Error('发现多个未完成批次，需要手动检查目录')
    }
    return result
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return []
    throw error
  }
}
export async function moduleDirectory(
  root: FileSystemDirectoryHandle,
  module: BackupModule,
  create = false
) {
  const info = validateRoot(await readJson(root, '存档信息.json'))
  return directoryAt(root, info.modulePaths?.[module] ?? MODULE_NAMES[module], create)
}

/** Compatibility entry point for callers that only need the durable batch ID. */
export async function stageAndApply(
  ...args: Parameters<typeof stageAndApplyVerified>
): Promise<string> {
  return (await stageAndApplyVerified(...args)).id
}
