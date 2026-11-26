import { readRoot } from './disk'
import {
  BACKUP_SETTINGS_STORE,
  BACKUP_DIRTY_STORE,
  OUTFIT_IGNORED_CODES_STORE,
  runStoreRequest
} from '../file-system/database'
import { runDatabaseTransaction } from '../file-system/transaction'
import { createUuid } from '../uuid'
import { ADAPTERS, normalTags, presentImage, type StoredImage } from './adapters'
import { locateRoot } from './engine'
import { locked } from './coordination'
import {
  BATCH_RECORDS,
  countBrowserRecords,
  loadConfig,
  backupDirectorySource,
  readRevision,
  moduleRange,
  type Checkpoint,
  type SuccessReceipt,
  type BackupConfig
} from './repository'
import {
  announceBackupChange,
  revisionKey,
  type BackupModule,
  type Revision
} from './changeJournal'
import type { ChangeKind, DirtyChange } from './changeJournal'
import {
  discoverStages,
  directoryAt,
  checkedId,
  recordPath,
  readBytes,
  readIndex,
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
  changes: { kind: Exclude<ChangeKind, 'reset'>; id: string; deleted?: boolean }[]
}

/** 每批只打开一个事务；图片只取已存摘要，不解码或重新计算图片哈希。 */
async function comparisonBatch(module: BackupModule, after?: string) {
  const a = ADAPTERS[module]
  return runDatabaseTransaction([a.records, a.images], 'readonly', async (tx) => {
    const rows = await (tx
      .objectStore(a.records)
      .getAll(
        after === undefined ? undefined : IDBKeyRange.lowerBound(after, true),
        BATCH_RECORDS
      ) as Promise<unknown[]>)
    return Promise.all(
      rows.map(async (raw) => {
        const record = a.validate(raw)
        let imageSha = module === 'camera' ? record.cover?.sha256 : undefined
        if (module !== 'camera' && presentImage(module, record)) {
          const image = await (tx.objectStore(a.images).get(record.id) as Promise<
            StoredImage | undefined
          >)
          if (!image) throw new Error(`数据库图片缺失：${record.id}`)
          imageSha = image.sha256
        }
        return { record, imageSha }
      })
    )
  })
}
async function readDiskSnapshot(config: BackupConfig, module: BackupModule) {
  if (!config.handle) return null
  const root = await locateRoot(config.handle)
  if (!root) {
    if (config.backupId) throw new Error('备份目录已变化，请重新预览')
    return null
  }
  const marker = await readRoot(root)
  if (
    marker.sourceId !== backupDirectorySource(config) ||
    (config.backupId && marker.backupId !== config.backupId)
  )
    throw new Error('备份目录身份已变化，请重新选择目录并确认使用')
  let dir: FileSystemDirectoryHandle
  try {
    dir = await moduleDirectory(root, module)
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return null
    throw error
  }
  const bytes = await readBytes(dir, '_系统/备份信息.json', MAX_JSON_BYTES)
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
    binding: config.binding,
    changes: []
  }
  const snapshot = await readDiskSnapshot(config, module)
  if (!snapshot) return result
  const { dir, bytes } = snapshot
  const manifest = validateManifest(parseJson(bytes), module)
  result.fingerprint = await digest(bytes)
  result.backupCount = manifest.count
  result.added = 0
  const remaining = new Map(Object.entries(await readIndex(dir, manifest.indexes.record.all)))
  if (remaining.size !== manifest.count) throw new Error('备份索引与记录数不符，请先完整性检查')
  const a = ADAPTERS[module]
  const changes = result.changes
  let compared = 0
  let after: string | undefined
  while (true) {
    const rows = await comparisonBatch(module, after)
    if (!rows.length) break
    compared += rows.length
    for (const { record, imageSha } of rows) {
      const id = record.id
      const expected = remaining.get(checkedId(id))
      if (!expected) {
        result.added++
        changes.push({ kind: 'record', id })
        continue
      }
      remaining.delete(id)
      const bytes = await readBytes(dir, recordPath(id), MAX_JSON_BYTES)
      if (!bytes || (await digest(bytes)) !== expected)
        throw new Error('备份记录丢失或摘要不符，请先完整性检查')
      const entry = parseJson<Entry>(bytes)
      if (entry.id !== id) throw new Error('目录 ID 不匹配')
      const imageChanged = presentImage(module, record) && imageSha !== entry.image?.sha256
      if (JSON.stringify(record) !== JSON.stringify(entry.value) || imageChanged) {
        result.updated++
        changes.push({ kind: 'record', id })
        if (imageChanged) changes.push({ kind: 'image', id })
      }
    }
    after = rows.at(-1)!.record.id
  }
  result.removed = remaining.size
  for (const id of remaining.keys()) changes.push({ kind: 'record', id, deleted: true })
  const tagsBytes = await readBytes(dir, '标签.json', MAX_JSON_BYTES)
  if (manifest.tagDigest && (!tagsBytes || (await digest(tagsBytes)) !== manifest.tagDigest))
    throw new Error('标签文件被修改或丢失，请先完整性检查')
  const tags = normalTags(
    module,
    await runStoreRequest(a.tags, 'readonly', (store) => store.get(a.tagKey))
  )
  if (
    JSON.stringify(tags) !==
    JSON.stringify(tagsBytes ? normalTags(module, parseJson(tagsBytes)) : [])
  )
    changes.push({ kind: 'tags', id: 'default' })
  if (module === 'outfits') {
    const ignoredBytes = await readBytes(dir, '忽略搭配码.json', MAX_JSON_BYTES)
    if (
      manifest.ignoredDigest &&
      (!ignoredBytes || (await digest(ignoredBytes)) !== manifest.ignoredDigest)
    )
      throw new Error('忽略搭配码被修改或丢失，请先完整性检查')
    const previous = ignoredBytes ? parseJson<Record<string, unknown>>(ignoredBytes) : {}
    let ignoredAfter: string | undefined
    while (true) {
      const values = await runStoreRequest<{ code: string }[]>(
        OUTFIT_IGNORED_CODES_STORE,
        'readonly',
        (store) =>
          store.getAll(
            ignoredAfter === undefined ? undefined : IDBKeyRange.lowerBound(ignoredAfter, true),
            BATCH_RECORDS
          )
      )
      if (!values.length) break
      for (const value of values) {
        if (JSON.stringify(value) !== JSON.stringify(previous[value.code]))
          changes.push({ kind: 'ignored', id: value.code })
        delete previous[value.code]
      }
      ignoredAfter = values.at(-1)!.code
    }
    for (const id of Object.keys(previous)) changes.push({ kind: 'ignored', id, deleted: true })
  }
  const final = await readBytes(dir, '_系统/备份信息.json', MAX_JSON_BYTES)
  if (
    compared !== browserCount ||
    browserCount !== (await countBrowserRecords(module)) ||
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
    const manifest = snapshot ? validateManifest(parseJson(snapshot.bytes), module) : null
    let hasRebuild = false
    if (snapshot) {
      try {
        for await (const entry of (await directoryAt(snapshot.dir, '_系统/重建中')).entries()) {
          void entry
          hasRebuild = true
          break
        }
      } catch (error) {
        if ((error as DOMException).name !== 'NotFoundError') throw error
      }
    }
    const complete = Boolean(
      manifest?.initialized &&
      manifest.lastSuccess &&
      !hasRebuild &&
      snapshot &&
      !(await discoverStages(snapshot.dir)).length
    )
    const result = await runDatabaseTransaction(
      [BACKUP_SETTINGS_STORE, BACKUP_DIRTY_STORE],
      'readwrite',
      async (tx) => {
        const store = tx.objectStore(BACKUP_SETTINGS_STORE)
        const revision =
          (await (store.get(revisionKey(module)) as Promise<Revision | undefined>))?.revision ?? ''
        const current = await (store.get('config') as Promise<BackupConfig>)
        if (revision !== expected.revision || current?.binding !== expected.binding)
          throw new Error('浏览器数据在确认期间发生变化，请重新预览')
        const checkpoint = await (store.get(`checkpoint:${module}`) as Promise<
          Checkpoint | undefined
        >)
        const receipt = await (store.get(`success:${module}`) as Promise<
          SuccessReceipt | undefined
        >)
        const previousError = await store.get(`error:${module}`)
        const incremental =
          complete &&
          !previousError &&
          current.initialized[module] &&
          checkpoint?.binding === current.binding &&
          checkpoint.digest === fingerprint &&
          receipt?.binding === current.binding &&
          receipt.revision === manifest!.sourceRevision &&
          receipt.at === manifest!.lastSuccess &&
          receipt.count === manifest!.count
        current.enabled[module] = true
        current.initialized[module] = Boolean(incremental)
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
        if (!incremental && fingerprint && complete) {
          await store.put({
            key: `checkpoint:${module}`,
            binding: current.binding,
            generation: current.generations[module],
            digest: fingerprint
          } satisfies Checkpoint)
        }
        if (incremental) {
          await store.put({ ...checkpoint!, generation: current.generations[module] })
          // 比对覆盖了该修订的完整数据，在同一事务中替换旧任务；后续编辑会生成新修订。
          const dirty = tx.objectStore(BACKUP_DIRTY_STORE)
          await dirty.delete(moduleRange(module))
          for (const change of expected.changes)
            await dirty.put({
              key: [module, change.kind, change.id],
              revision,
              at: new Date().toISOString(),
              ...(change.deleted ? { intent: 'confirmed-delete' as const } : {})
            } satisfies DirtyChange)
        }
        await store.delete(`scan:${module}`)
        await store.delete(`error:${module}`)
        await store.put(current)
        return current
      }
    )
    announceBackupChange()
    return result
  })
}
