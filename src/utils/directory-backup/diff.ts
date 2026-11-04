import { BACKUP_SETTINGS_STORE, runStoreRequest } from '../file-system/database'
import { databaseRequest, runDatabaseTransaction } from '../file-system/transaction'
import { createUuid } from '../uuid'
import { ADAPTERS, presentImage, type StoredImage } from './adapters'
import { locateRoot } from './engine'
import { locked } from './coordination'
import {
  currentKeys,
  countBrowserRecords,
  loadConfig,
  readRevision,
  type BackupConfig
} from './repository'
import {
  announceBackupChange,
  revisionKey,
  type BackupModule,
  type Revision
} from './changeJournal'
import {
  keyHash,
  recordPath,
  readBytes,
  readIndex,
  readJson,
  validateRoot,
  validateManifest,
  moduleDirectory,
  digest,
  parseJson,
  type Entry,
  MAX_JSON_BYTES
} from './disk'

export interface BackupDiff {
  added: number
  updated: number
  removed: number
  browserCount: number
  backupCount: number
  revision: string
  fingerprint: string
  binding: string
}
async function readDiskSnapshot(config: BackupConfig, module: BackupModule) {
  if (!config.handle) return null
  const root = await locateRoot(config.handle)
  if (!root) {
    if (config.backupId) throw new Error('备份目录已变化，请重新预览')
    return null
  }
  const marker = validateRoot(await readJson(root, '存档信息.json'))
  if (
    marker.sourceId !== config.sourceId ||
    (config.backupId && marker.backupId !== config.backupId)
  )
    throw new Error('目录属于其他存档，请重新预览')
  let dir: FileSystemDirectoryHandle
  try {
    dir = await moduleDirectory(root, module)
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return null
    throw error
  }
  const bytes = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
  if (!bytes) throw new Error('模块信息缺失，请重新预览并检查目录')
  return { dir, bytes }
}
/** 仅在用户开启/重新开启时允许全量比对；绝不创建目录或写任何磁盘文件。 */
export async function estimateBackupDiff(
  config: BackupConfig,
  module: BackupModule
): Promise<BackupDiff> {
  const revision = await readRevision(module),
    browserCount = await countBrowserRecords(module)
  const result: BackupDiff = {
    added: browserCount,
    updated: 0,
    removed: 0,
    browserCount,
    backupCount: 0,
    revision,
    fingerprint: '',
    binding: config.binding
  }
  const snapshot = await readDiskSnapshot(config, module)
  if (!snapshot) return result
  const { dir, bytes } = snapshot
  const manifest = validateManifest(parseJson(bytes), module)
  result.fingerprint = await digest(bytes)
  result.backupCount = manifest.count
  result.added = 0
  const hashes = new Map<string, string>()
  for (const bucket of Object.keys(manifest.indexes.record)) {
    for (const [hash, sha] of Object.entries(
      await readIndex(dir, 'record', bucket, manifest.indexes.record[bucket])
    ))
      hashes.set(hash, sha)
  }
  const a = ADAPTERS[module]
  let after: string | undefined
  while (true) {
    const keys = await currentKeys(a.records, after)
    if (!keys.length) break
    for (const id of keys) {
      const hash = await keyHash(id),
        expected = hashes.get(hash)
      if (!expected) {
        result.added++
        continue
      }
      hashes.delete(hash)
      const bytes = await readBytes(dir, recordPath(hash), MAX_JSON_BYTES)
      if (!bytes || (await digest(bytes)) !== expected)
        throw new Error('备份记录丢失或摘要不符，请先完整性检查')
      const entry = parseJson<Entry>(bytes)
      if (entry.id !== id) throw new Error('目录 ID 不匹配')
      const raw = await runStoreRequest<unknown>(a.records, 'readonly', (store) => store.get(id))
      const record = a.validate(raw)
      let changed = JSON.stringify(record) !== JSON.stringify(entry.value)
      // 两个图片表已经保存摘要；显式比对时只比较已有摘要，不解码图片。
      if (!changed && module !== 'camera' && presentImage(module, record)) {
        const image = await runStoreRequest<StoredImage | undefined>(
          a.images,
          'readonly',
          (store) => store.get(id)
        )
        if (!image) throw new Error(`数据库图片缺失：${id}`)
        changed = image.sha256 !== entry.image?.sha256
      }
      if (changed) result.updated++
    }
    after = keys.at(-1)
  }
  result.removed = hashes.size
  const final = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
  if (
    revision !== (await readRevision(module)) ||
    !final ||
    (await digest(final)) !== result.fingerprint
  )
    throw new Error('比对期间浏览器数据或电脑备份发生变化，请重新预览')
  return result
}
export async function confirmEnable(
  module: BackupModule,
  expected: BackupDiff
): Promise<BackupConfig> {
  return locked(module, async () => {
    const config = await loadConfig()
    if (config.binding !== expected.binding) throw new Error('目录绑定已变化，请重新预览')
    const snapshot = await readDiskSnapshot(config, module)
    const fingerprint = snapshot ? await digest(snapshot.bytes) : ''
    if (fingerprint !== expected.fingerprint) throw new Error('电脑副本已变化，请重新预览')
    const result = await runDatabaseTransaction(
      [BACKUP_SETTINGS_STORE],
      'readwrite',
      async (tx) => {
        const store = tx.objectStore(BACKUP_SETTINGS_STORE)
        const revision =
          (await databaseRequest<Revision | undefined>(store.get(revisionKey(module))))?.revision ??
          ''
        const current = await databaseRequest<BackupConfig>(store.get('config'))
        if (revision !== expected.revision || current?.binding !== expected.binding)
          throw new Error('浏览器数据在确认期间发生变化，请重新预览')
        current.enabled[module] = true
        current.initialized[module] = false
        current.emptyApprovals ??= {}
        delete current.emptyApprovals[module]
        if (
          expected.backupCount > 0 &&
          expected.browserCount === 0 &&
          expected.removed === expected.backupCount &&
          current.backupId
        )
          current.emptyApprovals[module] = {
            backupId: current.backupId,
            revision: expected.revision
          }
        current.generations[module] = createUuid()
        store.put(current)
        return current
      }
    )
    announceBackupChange()
    return result
  })
}
