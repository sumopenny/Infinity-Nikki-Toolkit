import {
  BACKUP_SETTINGS_STORE,
  OUTFIT_IGNORED_CODES_STORE,
  runStoreRequest
} from '../file-system/database'
import { createUuid } from '../uuid'
import { announceBackupChange, type BackupModule, type DirtyChange } from './changeJournal'
import { ADAPTERS, checkedImage, presentImage } from './adapters'
import { locked, withAllBackupLocks, withExclusiveBusiness } from './coordination'
import {
  BATCH_RECORDS,
  active,
  acknowledgeStage,
  acknowledgeUnchanged,
  captureBatch,
  checkpoint,
  countBrowserRecords,
  confirmedDeletionKeys,
  currentKeys,
  defaultStates,
  dirtyChanges,
  idleRevision,
  loadConfig,
  readRevision,
  recordSuccess,
  saveConfig,
  saveScan,
  scanProgress,
  setting,
  updateConfig,
  type BackupConfig,
  type ModuleProgress,
  type ScanProgress,
  type SuccessReceipt
} from './repository'
import {
  DIRECTORY_NAME,
  FORMAT,
  VERSION,
  MODULES,
  MODULE_LABELS,
  type RootManifest,
  type Entry,
  type IndexKind,
  type DiskOperation,
  jsonBytes,
  parseJson,
  digest,
  keyHash,
  recordPath,
  ignoredPath,
  indexPath,
  readBytes,
  readJson,
  putBytes,
  defaultManifest,
  readModuleManifest,
  readIndex,
  stageAndApply,
  discoverStages,
  validateStage,
  applyStage,
  finishStage,
  validateRoot,
  moduleDirectory,
  MAX_JSON_BYTES
} from './disk'

export {
  ADAPTERS,
  locked,
  moduleDirectory,
  defaultStates,
  loadConfig,
  saveConfig,
  updateConfig,
  countBrowserRecords
}
export type { BackupConfig, ModuleProgress } from './repository'
export function supportsBackup(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.showDirectoryPicker === 'function' &&
    Boolean(navigator.locks) &&
    !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) &&
    !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}
export async function pickDirectory(readonly = false): Promise<FileSystemDirectoryHandle> {
  if (!supportsBackup())
    throw new Error('此浏览器不支持电脑目录自动备份；编辑和 ZIP 导入导出仍可正常使用。')
  return window.showDirectoryPicker!({
    mode: readonly ? 'read' : 'readwrite',
    id: 'nuan-original-backup'
  })
}
export async function permission(
  handle: FileSystemDirectoryHandle,
  request = false,
  readonly = false
) {
  const options = { mode: readonly ? ('read' as const) : ('readwrite' as const) }
  return (
    (request
      ? await handle.requestPermission?.(options)
      : await handle.queryPermission?.(options)) === 'granted'
  )
}
/** 允许选择父目录，也允许直接选择“暖立方备份”。全过程只读。 */
export async function locateRoot(
  handle: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
  const direct = await readJson<RootManifest>(handle, '存档信息.json')
  if (direct) {
    validateRoot(direct)
    return handle
  }
  try {
    return await handle.getDirectoryHandle(DIRECTORY_NAME)
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return null
    throw error
  }
}
export async function inspectRoot(handle: FileSystemDirectoryHandle): Promise<RootManifest | null> {
  const root = await locateRoot(handle)
  if (!root) return null
  return validateRoot(await readJson(root, '存档信息.json'))
}
export async function backupRoot(config: BackupConfig): Promise<FileSystemDirectoryHandle> {
  if (!config.handle) throw new Error('请先选择备份目录')
  if (!(await permission(config.handle))) throw new Error('目录授权失效，请点击重新授权')
  const root = await locateRoot(config.handle)
  if (root) {
    const marker = validateRoot(await readJson(root, '存档信息.json'))
    if (
      marker.sourceId !== config.sourceId ||
      (config.backupId && marker.backupId !== config.backupId)
    )
      throw new Error('目录身份与绑定不符。请先预览恢复，或选择新的空目录；不会覆盖原备份。')
    if (await readBytes(root, '重建任务.json', MAX_JSON_BYTES))
      throw new Error('发现未完成的重建任务，请在完整性检查窗口点击重建完成收尾；不会覆盖原副本。')
    return root
  }
  if (config.backupId)
    throw new Error('原备份目录已移动或被删除，请重新选择目录；不会自动建立空副本。')
  const created = await config.handle.getDirectoryHandle(DIRECTORY_NAME, { create: true })
  const backupId = createUuid()
  const info: RootManifest = {
    format: FORMAT,
    version: VERSION,
    backupId,
    sourceId: config.sourceId,
    sourceOrigin: typeof location === 'undefined' ? 'test' : location.origin,
    createdAt: new Date().toISOString()
  }
  await putBytes(created, '存档信息.json', jsonBytes(info))
  validateRoot(await readJson(created, '存档信息.json'))
  await updateConfig((current) => {
    if (current.sourceId !== config.sourceId || current.binding !== config.binding)
      throw new Error('备份绑定已变化')
    current.backupId = backupId
  })
  config.backupId = backupId
  return created
}
export interface DirectoryBindingPreview {
  binding: string
  backupId?: string
  enabled: BackupConfig['enabled']
  diffs: Partial<
    Record<BackupModule, { revision: string; fingerprint: string; emptyApproved?: boolean }>
  >
}
export async function bindDirectory(
  handle: FileSystemDirectoryHandle,
  expected?: DirectoryBindingPreview
): Promise<BackupConfig> {
  return withAllBackupLocks(async () => {
    const marker = await inspectRoot(handle)
    const config = await loadConfig()
    if (marker && marker.sourceId !== config.sourceId)
      throw new Error('发现已有存档，请先从目录恢复或选择新子目录。')
    const revisions: Partial<Record<BackupModule, string>> = {}
    if (expected) {
      if (marker?.backupId !== expected.backupId) throw new Error('目录在预览后已变化，请重新预览')
      const root = await locateRoot(handle)
      for (const module of MODULES) {
        if (!expected.enabled[module]) continue
        const preview = expected.diffs[module]
        if (!preview) throw new Error('缺少模块差异预览，请重新预览')
        let fingerprint = ''
        if (root) {
          try {
            const dir = await moduleDirectory(root, module)
            const bytes = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
            if (bytes) fingerprint = await digest(bytes)
          } catch (error) {
            if ((error as DOMException).name !== 'NotFoundError') throw error
          }
        }
        if (preview.fingerprint !== fingerprint) throw new Error('目录在预览后已变化，请重新预览')
        revisions[module] = preview.revision
      }
    }
    const result = await updateConfig((current) => {
      if (
        current.sourceId !== config.sourceId ||
        (expected &&
          (current.binding !== expected.binding ||
            MODULES.some((module) => current.enabled[module] !== expected.enabled[module])))
      )
        throw new Error('备份设置在预览后已变化，请重新预览')
      current.handle = handle
      current.directoryName = handle.name
      current.binding = createUuid()
      current.backupId = marker?.backupId
      current.paused = false
      current.emptyApprovals = {}
      if (marker && expected)
        for (const module of MODULES) {
          const diff = expected.diffs[module]
          if (diff?.emptyApproved)
            current.emptyApprovals[module] = { backupId: marker.backupId, revision: diff.revision }
        }
      for (const module of MODULES) {
        current.initialized[module] = false
        current.generations[module] = createUuid()
      }
    }, revisions)
    result.handle = handle
    // 建立根身份也持有全部写盘锁，防止其他标签页同时初始化同一个目录。
    // 选择目录不启用任何模块，不写业务数据；正常编辑不被这里的写盘锁阻塞。
    await backupRoot(result)
    return result
  })
}
function stopped() {
  return new Error('备份设置已改变，旧任务已停止')
}

/** 不以空表作为删除意图：必须有同事务的确认记录，或用户重新绑定时的明确空库覆盖授权。 */
async function guardUnexpectedEmpty(
  config: BackupConfig,
  dir: FileSystemDirectoryHandle,
  module: BackupModule
) {
  const bytes = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
  if (!bytes) return
  const manifest = await readModuleManifest(dir, module)
  if (!manifest.count || (await countBrowserRecords(module)) !== 0) return
  const approval = config.emptyApprovals?.[module]
  if (
    approval &&
    approval.backupId === config.backupId &&
    approval.revision === (await readRevision(module))
  )
    return
  const confirmed = await confirmedDeletionKeys(module)
  let authorized = confirmed.reset
  if (!authorized && confirmed.ids.length >= manifest.count) {
    // 不能只按删除数量推断意图：逐个索引桶核对被删 ID，避免不相关的已确认删除掩盖异常丢失。
    const hashes = new Set(await Promise.all(confirmed.ids.map(keyHash)))
    let covered = 0
    authorized = true
    for (const [bucket, sha] of Object.entries(manifest.indexes.record)) {
      const entries = await readIndex(dir, 'record', bucket, sha)
      for (const hash of Object.keys(entries)) {
        covered++
        if (!hashes.has(hash)) authorized = false
      }
    }
    authorized = authorized && covered === manifest.count
  }
  if (!authorized)
    throw new Error(
      `检测到${MODULE_LABELS[module]}数据异常归零，已停止该模块自动备份以保留电脑副本。请检查浏览器数据，或从目录恢复；只有确认删除或明确重建才能清空副本。`
    )
}
async function ensureActive(config: BackupConfig, module: BackupModule) {
  const guard = rebuildGuards.get(config)
  if (!(guard ? await guard() : await active(config, module))) throw stopped()
}
async function trackedManifest(
  config: BackupConfig,
  dir: FileSystemDirectoryHandle,
  module: BackupModule
) {
  const bytes = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
  const saved = await checkpoint(config, module)
  if (saved && (!bytes || (await digest(bytes)) !== saved.digest))
    throw new Error('模块信息被外部修改或删除。已暂停写入，请进行完整性检查或显式重建。')
  if (!bytes) {
    if (config.initialized[module]) throw new Error('已备份模块的信息丢失，禁止按空模块覆盖')
    // 仅第一次创建允许枚举，拒绝覆盖无法识别的旧目录。
    for await (const [name] of dir.entries())
      if (name !== '.写入中') throw new Error('模块目录存在无法识别的文件，禁止覆盖')
    return defaultManifest(module)
  }
  return readModuleManifest(dir, module)
}
async function commitDisk(
  config: BackupConfig,
  dir: FileSystemDirectoryHandle,
  module: BackupModule,
  operations: DiskOperation[],
  changes: DirtyChange[] = []
) {
  await ensureActive(config, module)
  const id = await stageAndApply(
    dir,
    module,
    operations,
    undefined,
    { sourceId: config.sourceId, binding: config.generations[module], changes },
    true
  )
  const bytes = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
  if (!bytes) throw new Error('批次提交后模块信息丢失')
  const stage = await validateStage(dir, id, module)
  if (!stage) throw new Error('批次确认信息丢失')
  await acknowledgeStage(config, module, stage, await digest(bytes))
  try {
    await finishStage(dir, id)
  } catch {
    throw new Error('数据已写盘，但临时批次清理失败；请重试以完成清理。')
  }
}
async function resumePending(
  config: BackupConfig,
  dir: FileSystemDirectoryHandle,
  module: BackupModule
) {
  const stages = await discoverStages(dir)
  // 所有暂存先只读检查，避免前一个已写、后一个才发现恶意路径。
  const verified = await Promise.all(stages.map((id) => validateStage(dir, id, module)))
  if (verified.filter(Boolean).length > 1) throw new Error('存在多个已准备批次，不能猜测应用顺序')
  for (const [i, id] of stages.entries()) {
    await ensureActive(config, module)
    if (!verified[i]) {
      await finishStage(dir, id)
      continue
    }
    if (verified[i]!.receipt?.sourceId !== config.sourceId)
      throw new Error('待续写批次不属于当前存档')
    const stage = await applyStage(dir, id, module, false)
    const bytes = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
    if (!bytes) throw new Error('续写后模块信息丢失')
    await acknowledgeStage(config, module, stage, await digest(bytes))
    await finishStage(dir, id)
  }
}
interface Task {
  ids: string[]
  images: Set<string>
  ignored: string[]
  changes: DirtyChange[]
  forceImages?: boolean
}
const taskFor = (changes: DirtyChange[]): Task => ({
  ids: [
    ...new Set(
      changes.filter((x) => x.key[1] === 'record' || x.key[1] === 'image').map((x) => x.key[2])
    )
  ],
  images: new Set(changes.filter((x) => x.key[1] === 'image').map((x) => x.key[2])),
  ignored: changes.filter((x) => x.key[1] === 'ignored').map((x) => x.key[2]),
  changes
})
/** 正常批次不读整库、不遍历业务目录、不碰未改变图片；只更新受影响的桶。 */
async function applyChanges(
  config: BackupConfig,
  dir: FileSystemDirectoryHandle,
  module: BackupModule,
  task: Task
) {
  const manifest = await trackedManifest(config, dir, module)
  const next = structuredClone(manifest)
  const indexes = new Map<string, Record<string, string>>()
  const index = async (kind: IndexKind, bucket: string) => {
    const token = `${kind}/${bucket}`
    if (!indexes.has(token))
      indexes.set(token, await readIndex(dir, kind, bucket, manifest.indexes[kind][bucket]))
    return indexes.get(token)!
  }
  const previous = new Map<string, Entry | null>()
  for (const id of task.ids) {
    const hash = await keyHash(id)
    const list = await index('record', hash.slice(0, 2))
    const bytes = await readBytes(dir, recordPath(hash), MAX_JSON_BYTES)
    if (Boolean(bytes) !== Boolean(list[hash]) || (bytes && (await digest(bytes)) !== list[hash]))
      throw new Error(`备份记录丢失或已被外部修改：${id}`)
    const entry = bytes ? parseJson<Entry>(bytes) : null
    if (entry && (entry.id !== id || entry.module !== module || entry.version !== 1))
      throw new Error('备份记录身份不符')
    previous.set(id, entry)
  }
  const tagsOnDisk = await readBytes(dir, '标签.json', MAX_JSON_BYTES)
  if (
    Boolean(tagsOnDisk) !== Boolean(manifest.tagDigest) ||
    (tagsOnDisk && (await digest(tagsOnDisk)) !== manifest.tagDigest)
  )
    throw new Error('标签文件被修改或丢失')
  const snapshot = await captureBatch(
    module,
    task.ids,
    task.ignored,
    previous,
    task.images,
    task.forceImages
  )
  if (manifest.count && snapshot.records.some((item) => !item.record))
    await guardUnexpectedEmpty(config, dir, module)
  const operations: DiskOperation[] = []
  const consumed = new Set(snapshot.records.map((item) => item.id))
  for (const { id, record, image: rawImage } of snapshot.records) {
    const hash = await keyHash(id),
      bucket = hash.slice(0, 2),
      path = recordPath(hash)
    const list = await index('record', bucket)
    const prior = previous.get(id)
    if (!record) {
      if (prior) {
        operations.push({ path })
        if (prior.image) operations.push({ path: prior.image.path })
        delete list[hash]
        next.count--
        next.imageBytes -= prior.image?.size ?? 0
      }
      continue
    }
    let image = prior?.image ?? null
    if (!presentImage(module, record)) image = null
    else if (rawImage !== undefined) {
      const checked = await checkedImage(module, record, rawImage)
      image = {
        path: `图片/${bucket}/${hash}/${checked.sha256}.${checked.extension}`,
        sha256: checked.sha256,
        size: checked.size,
        type: checked.type
      }
      if (prior?.image?.path !== image.path)
        operations.push({ path: image.path, data: checked.blob })
      else if (task.forceImages) {
        const bytes = await readBytes(dir, image.path)
        if (!bytes || (await digest(bytes)) !== image.sha256)
          throw new Error(`已备份图片缺失或被修改：${id}`)
      }
    }
    if (presentImage(module, record) && !image) throw new Error(`记录缺少图片：${id}`)
    const revision = await digest(jsonBytes({ value: record, image }).buffer as ArrayBuffer)
    const entry: Entry = { version: 1, module, id, revision, value: record, image }
    const data = jsonBytes(entry),
      sha = await digest(data.buffer as ArrayBuffer)
    if (list[hash] !== sha) {
      operations.push({ path, data })
      if (!prior) next.count++
      next.imageBytes += (image?.size ?? 0) - (prior?.image?.size ?? 0)
      list[hash] = sha
    }
    if (prior?.image && prior.image.path !== image?.path)
      operations.push({ path: prior.image.path })
  }
  for (const [code, raw] of snapshot.ignored) {
    const hash = await keyHash(code),
      list = await index('ignored', hash.slice(0, 2)),
      path = ignoredPath(hash)
    const old = await readBytes(dir, path, MAX_JSON_BYTES)
    if (Boolean(old) !== Boolean(list[hash]) || (old && (await digest(old)) !== list[hash]))
      throw new Error('忽略搭配码文件被修改或丢失')
    if (raw !== undefined) {
      if ((raw as { code?: unknown }).code !== code || !code || code.length > 30 || /\s/.test(code))
        throw new Error('忽略搭配码无效')
      const data = jsonBytes(raw),
        sha = await digest(data.buffer as ArrayBuffer)
      if (list[hash] !== sha) {
        operations.push({ path, data })
        list[hash] = sha
      }
    } else if (list[hash]) {
      operations.push({ path })
      delete list[hash]
    }
  }
  const tags = jsonBytes(snapshot.tags),
    tagDigest = await digest(tags.buffer as ArrayBuffer)
  if (manifest.tagDigest !== tagDigest) {
    operations.push({ path: '标签.json', data: tags })
    next.tagDigest = tagDigest
  }
  for (const [token, content] of indexes) {
    const [kind, bucket] = token.split('/') as [IndexKind, string]
    const data = jsonBytes(content),
      sha = Object.keys(content).length ? await digest(data.buffer as ArrayBuffer) : null
    if (sha === (manifest.indexes[kind][bucket] ?? null)) continue
    operations.push({ path: indexPath(kind, bucket), ...(sha ? { data } : {}) })
    if (sha) next.indexes[kind][bucket] = sha
    else delete next.indexes[kind][bucket]
  }
  if (next.count < 0 || next.imageBytes < 0) throw new Error('备份计数异常')
  const changes = snapshot.changes
  if (operations.length) {
    operations.push({ path: '模块信息.json', data: jsonBytes(next) })
    await commitDisk(config, dir, module, operations, changes)
  } else await acknowledgeUnchanged(config, module, changes)
  return { ids: [...consumed], bytes: snapshot.imageBytes }
}
async function reconcile(
  config: BackupConfig,
  dir: FileSystemDirectoryHandle,
  module: BackupModule,
  report: (scan: ScanProgress) => void,
  restart = false
) {
  let scan = restart ? undefined : await scanProgress(config, module)
  const baselineManifest = !scan ? await trackedManifest(config, dir, module) : undefined
  if (!scan)
    scan = {
      key: `scan:${module}`,
      binding: config.binding,
      generation: config.generations[module],
      phase: 'records',
      processed: 0,
      total: await countBrowserRecords(module),
      bytes: 0,
      cleanStart: Boolean(
        baselineManifest &&
        !baselineManifest.initialized &&
        !baselineManifest.count &&
        !Object.keys(baselineManifest.indexes.ignored).length &&
        !restart
      )
    }
  while (scan.phase === 'records' || scan.phase === 'ignored') {
    await ensureActive(config, module)
    const records = scan.phase === 'records'
    const keys = await currentKeys(
      records ? ADAPTERS[module].records : OUTFIT_IGNORED_CODES_STORE,
      scan.after
    )
    if (!keys.length) {
      scan.phase = records && module === 'outfits' ? 'ignored' : 'cleanup'
      scan.after = undefined
    } else {
      const result = await applyChanges(config, dir, module, {
        ids: records ? keys : [],
        images: new Set(),
        ignored: records ? [] : keys,
        changes: [],
        forceImages: true
      })
      scan.after = records ? result.ids.at(-1) : keys.at(-1)
      if (!scan.after) throw new Error('首次备份未取得扫描进展')
      if (records) {
        scan.processed += result.ids.length
        scan.bytes += result.bytes
        scan.total = Math.max(scan.total, scan.processed)
      }
    }
    await saveScan(config, module, scan)
    report(scan)
  }
  if (scan.phase === 'cleanup') {
    // 明确的首次/重新开启核对允许全量扫描；按桶与小批处理，不装入整库图片。
    for (const kind of (scan.cleanStart ? [] : ['record', 'ignored']) as IndexKind[]) {
      if (kind === 'ignored' && module !== 'outfits') continue
      const manifest = await trackedManifest(config, dir, module)
      for (const bucket of Object.keys(manifest.indexes[kind])) {
        const hashes = Object.keys(
          await readIndex(dir, kind, bucket, manifest.indexes[kind][bucket])
        )
        for (let offset = 0; offset < hashes.length; offset += BATCH_RECORDS) {
          await ensureActive(config, module)
          const ids: string[] = []
          for (const hash of hashes.slice(offset, offset + BATCH_RECORDS)) {
            const value = await readJson<Entry | { code: string }>(
              dir,
              kind === 'record' ? recordPath(hash) : ignoredPath(hash)
            )
            if (!value) throw new Error('清理核对发现记录缺失')
            ids.push(kind === 'record' ? (value as Entry).id : (value as { code: string }).code)
          }
          await applyChanges(config, dir, module, {
            ids: kind === 'record' ? ids : [],
            images: new Set(),
            ignored: kind === 'ignored' ? ids : [],
            changes: []
          })
        }
      }
    }
    // 空库也需要真实写入标签和模块信息，不能跳过并显示成功。
    await applyChanges(config, dir, module, {
      ids: [],
      images: new Set(),
      ignored: [],
      changes: []
    })
    scan.phase = 'done'
    await saveScan(config, module, scan)
  }
}
function messageFor(error: unknown): string {
  const name = (error as DOMException)?.name
  if (name === 'QuotaExceededError')
    return '磁盘或浏览器空间不足。浏览器已有数据未删除；释放空间后重试。'
  if (name === 'NotFoundError') return '备份目录或文件不可访问，可能已被移动、删除或设备已断开。'
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return '目录权限失效，请点击重新授权。'
  return error instanceof Error ? error.message : String(error)
}
export async function syncModule(
  config: BackupConfig,
  module: BackupModule,
  progress: ModuleProgress,
  onProgress: () => void
): Promise<void> {
  if (!config.enabled[module] || config.paused) return
  if (!config.handle) {
    progress.state = 'not-set'
    onProgress()
    return
  }
  const previousProtection = await setting<{
    binding: string
    message: string
    state: string
  }>(`error:${module}`)
  const approval = config.emptyApprovals?.[module]
  if (
    previousProtection?.binding === config.binding &&
    previousProtection.state === 'protected' &&
    (await countBrowserRecords(module)) === 0 &&
    !(
      approval &&
      approval.backupId === config.backupId &&
      approval.revision === (await readRevision(module))
    )
  ) {
    // 保持保护状态，不重复尝试写盘；浏览器数据恢复或明确确认空库覆盖后才能继续。
    progress.state = 'protected'
    progress.error = previousProtection.message
    onProgress()
    return
  }
  await locked(module, async () => {
    if (!(await active(config, module))) return
    progress.state = config.initialized[module] ? 'syncing' : 'initializing'
    onProgress()
    try {
      const root = await backupRoot(config)
      const exists = await checkpoint(config, module)
      const dir = await moduleDirectory(root, module, !exists && !config.initialized[module])
      await guardUnexpectedEmpty(config, dir, module)
      await resumePending(config, dir, module)
      if (!config.initialized[module])
        await reconcile(config, dir, module, (scan) => {
          progress.processed = scan.processed
          progress.total = scan.total
          progress.bytes = scan.bytes
          onProgress()
        })
      for (let iteration = 0; iteration < 10000; iteration++) {
        await ensureActive(config, module)
        const pending = await dirtyChanges(module)
        if (!pending.length) break
        if (pending.some((x) => x.key[1] === 'reset')) {
          await reconcile(config, dir, module, () => undefined, true)
          await acknowledgeUnchanged(
            config,
            module,
            pending.filter((x) => x.key[1] === 'reset')
          )
        } else await applyChanges(config, dir, module, taskFor(pending))
      }
      await ensureActive(config, module)
      if ((await dirtyChanges(module, 1)).length) {
        progress.state = 'waiting'
        onProgress()
        return
      }
      const revision = await idleRevision(module)
      if (revision === null) {
        progress.state = 'waiting'
        onProgress()
        return
      }
      const manifest = await trackedManifest(config, dir, module)
      if (!manifest.initialized || manifest.sourceRevision !== revision || !manifest.lastSuccess) {
        manifest.initialized = true
        manifest.sourceRevision = revision
        manifest.lastSuccess = new Date().toISOString()
        await commitDisk(config, dir, module, [
          { path: '模块信息.json', data: jsonBytes(manifest) }
        ])
      }
      const final = await readModuleManifest(dir, module)
      await recordSuccess(config, module, final)
      config.initialized[module] = true
      progress.count = final.count
      progress.lastSuccess = final.lastSuccess
      progress.bytes = final.imageBytes
      progress.state =
        (await readRevision(module)) === final.sourceRevision &&
        !(await dirtyChanges(module, 1)).length
          ? 'synced'
          : 'waiting'
      progress.error = undefined
      await runStoreRequest(BACKUP_SETTINGS_STORE, 'readwrite', (store) =>
        store.delete(`error:${module}`)
      )
    } catch (error) {
      if (!(await active(config, module))) {
        progress.state = 'disabled'
        progress.error = undefined
      } else {
        progress.error = messageFor(error)
        progress.state = progress.error.includes('数据异常归零')
          ? 'protected'
          : /权限|授权/.test(progress.error)
            ? 'permission'
            : 'error'
        await runStoreRequest(BACKUP_SETTINGS_STORE, 'readwrite', (store) =>
          store.put({
            key: `error:${module}`,
            binding: config.binding,
            message: progress.error,
            state: progress.state
          })
        ).catch(() => undefined)
      }
    }
    onProgress()
  })
}
export async function readModuleStatus(
  config: BackupConfig,
  module: BackupModule
): Promise<ModuleProgress> {
  const receipt = await setting<SuccessReceipt>(`success:${module}`)
  const saved = receipt?.binding === config.binding ? receipt : undefined
  const status: ModuleProgress = {
    enabled: config.enabled[module],
    count: saved?.count ?? 0,
    lastSuccess: saved?.at ?? null,
    bytes: saved?.bytes ?? 0,
    state: 'disabled'
  }
  if (!status.enabled) return status
  if (!config.handle) {
    status.state = 'not-set'
    return status
  }
  if (config.paused) {
    status.state = 'paused'
    return status
  }
  if (!(await permission(config.handle))) {
    status.state = 'permission'
    return status
  }
  const error = await setting<{
    binding: string
    message: string
    state: 'error' | 'permission' | 'protected'
  }>(`error:${module}`)
  if (error?.binding === config.binding) {
    status.state = error.state
    status.error = error.message
    return status
  }
  // 仅在曾成功备份了非空数据、而浏览器记录突然归零时核验磁盘。
  // 日常状态刷新不枚举记录/图片，也不访问磁盘；这里全程只读。
  if (saved && saved.count > 0 && (await countBrowserRecords(module)) === 0) {
    try {
      const root = await locateRoot(config.handle)
      if (!root) throw new Error('原备份目录已移动或被删除，请重新选择目录。')
      const marker = validateRoot(await readJson(root, '存档信息.json'))
      if (
        marker.sourceId !== config.sourceId ||
        (config.backupId && marker.backupId !== config.backupId)
      )
        throw new Error('目录身份与绑定不符，请检查备份目录。')
      const dir = await moduleDirectory(root, module)
      await guardUnexpectedEmpty(config, dir, module)
    } catch (cause) {
      status.error = messageFor(cause)
      status.state = status.error.includes('数据异常归零') ? 'protected' : 'error'
      return status
    }
  }
  const scan = await scanProgress(config, module)
  if (!config.initialized[module]) {
    status.state = 'initializing'
    status.processed = scan?.processed
    status.total = scan?.total
    status.bytes = scan?.bytes
  } else
    status.state =
      saved?.revision === (await readRevision(module)) && !(await dirtyChanges(module, 1)).length
        ? 'synced'
        : 'waiting'
  return status
}
export async function setModuleEnabled(
  module: BackupModule,
  enabled: boolean
): Promise<BackupConfig> {
  const config = await updateConfig((current) => {
    current.enabled[module] = enabled
    current.generations[module] = createUuid()
    if (enabled) current.initialized[module] = false
  })
  // 停止操作返回前等待当前有限批次结束，此后绝不继续写盘。
  if (!enabled) await locked(module, async () => undefined)
  return config
}
export async function pendingEnabledBackups(): Promise<boolean> {
  const config = await loadConfig()
  for (const module of MODULES)
    if (config.enabled[module]) {
      const saved = await setting<SuccessReceipt>(`success:${module}`)
      if (
        !config.initialized[module] ||
        (await dirtyChanges(module, 1)).length ||
        saved?.revision !== (await readRevision(module))
      )
        return true
    }
  return false
}
export async function flushBackupsBeforeReset(): Promise<boolean> {
  const config = await loadConfig()
  if (config.paused) return !(await pendingEnabledBackups())
  for (const module of MODULES)
    if (config.enabled[module]) {
      const status = defaultStates()[module]
      await syncModule(config, module, status, () => undefined)
      if (status.state !== 'synced') return false
    }
  return !(await pendingEnabledBackups())
}
export async function pauseBackupsForBrowserReset(action: () => Promise<void>): Promise<void> {
  const previous = await loadConfig()
  await updateConfig((current) => {
    current.paused = true
  })
  try {
    await withAllBackupLocks(() => withExclusiveBusiness(MODULES, action))
  } finally {
    const remaining = await setting<BackupConfig>('config')
    if (remaining?.sourceId === previous.sourceId)
      await updateConfig((current) => {
        current.paused = previous.paused
      })
    announceBackupChange()
  }
}
export async function pauseForSafeCopy(): Promise<void> {
  await updateConfig((current) => {
    current.paused = true
  })
  await withAllBackupLocks(async () => {
    const config = await loadConfig()
    if (!config.handle) return
    const root = await backupRoot(config)
    for (const module of MODULES) {
      try {
        const dir = await moduleDirectory(root, module)
        if ((await discoverStages(dir)).length)
          throw new Error('已暂停，但目录仍有未完成批次。请恢复备份并重试后再复制。')
      } catch (error) {
        if ((error as DOMException).name !== 'NotFoundError') throw error
      }
    }
  })
}
export async function backupDeleteWarning(
  module: BackupModule,
  language: 'zh' | 'en' = 'zh'
): Promise<string> {
  let enabled = false
  try {
    enabled = (await setting<BackupConfig>('config'))?.enabled[module] ?? false
  } catch {
    return language === 'zh'
      ? '\n\n暂时无法读取备份设置。如已开启自动备份，删除也会同步到电脑副本，且不能撤销。'
      : '\n\nBackup settings are temporarily unavailable. Enabled auto backups also mirror deletions, which cannot be undone.'
  }
  return enabled
    ? language === 'zh'
      ? `\n\n已开启${MODULE_LABELS[module]}自动备份：删除同步后，电脑副本中的这些记录和图片也会删除，不能通过自动备份撤销。`
      : '\n\nAutomatic backup is enabled: these records and images will also be removed from the computer copy. This cannot be undone by auto backup.'
    : ''
}

const rebuildGuards = new WeakMap<BackupConfig, () => Promise<boolean>>()
/** 显式重建复用同一增量序列化/批次协议，在未发布的新目录内生成完整副本。 */
export async function buildModuleCopy(
  config: BackupConfig,
  dir: FileSystemDirectoryHandle,
  module: BackupModule,
  baseline: string,
  guard: () => Promise<boolean>,
  progress: (processed: number, total: number) => void
): Promise<import('./disk').ModuleManifest> {
  rebuildGuards.set(config, guard)
  try {
    const total = await countBrowserRecords(module)
    let after: string | undefined,
      processed = 0
    while (true) {
      await ensureActive(config, module)
      const keys = await currentKeys(ADAPTERS[module].records, after)
      if (!keys.length) break
      const result = await applyChanges(config, dir, module, {
        ids: keys,
        images: new Set(),
        ignored: [],
        changes: [],
        forceImages: true
      })
      after = result.ids.at(-1)
      if (!after) throw new Error('重建没有取得扫描进展')
      processed += result.ids.length
      progress(processed, total)
    }
    if (module === 'outfits') {
      after = undefined
      while (true) {
        const codes = await currentKeys(OUTFIT_IGNORED_CODES_STORE, after)
        if (!codes.length) break
        await applyChanges(config, dir, module, {
          ids: [],
          images: new Set(),
          ignored: codes,
          changes: []
        })
        after = codes.at(-1)
      }
    }
    await applyChanges(config, dir, module, {
      ids: [],
      images: new Set(),
      ignored: [],
      changes: []
    })
    const manifest = await readModuleManifest(dir, module)
    manifest.initialized = true
    manifest.sourceRevision = baseline
    manifest.lastSuccess = new Date().toISOString()
    await commitDisk(config, dir, module, [{ path: '模块信息.json', data: jsonBytes(manifest) }])
    return readModuleManifest(dir, module)
  } finally {
    rebuildGuards.delete(config)
  }
}
