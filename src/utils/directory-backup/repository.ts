import {
  BACKUP_DIRTY_STORE,
  BACKUP_SETTINGS_STORE,
  OUTFIT_IGNORED_CODES_STORE,
  runStoreRequest
} from '../file-system/database'
import { databaseRequest, runDatabaseTransaction } from '../file-system/transaction'
import { createUuid } from '../uuid'
import {
  announceBackupChange,
  revisionKey,
  type Revision,
  type BackupModule,
  type DirtyChange
} from './changeJournal'
import {
  ADAPTERS,
  assertTags,
  imageBlob,
  needsImage,
  normalTags,
  presentImage,
  type BackupRecord
} from './adapters'
import { MODULES, type Entry, type ModuleManifest, type StageManifest } from './disk'

export const BATCH_RECORDS = 24
export const BATCH_IMAGE_BYTES = 16 * 1024 * 1024
export interface BackupConfig {
  key: 'config'
  sourceId: string
  binding: string
  backupId?: string
  handle?: FileSystemDirectoryHandle
  directoryName?: string
  paused: boolean
  enabled: Record<BackupModule, boolean>
  initialized: Record<BackupModule, boolean>
  generations: Record<BackupModule, string>
  /** 仅针对明确确认过的空库覆盖，绑定指定磁盘和浏览器修订号。 */
  emptyApprovals?: Partial<Record<BackupModule, { backupId: string; revision: string }>>
}
export interface ModuleProgress {
  enabled: boolean
  count: number
  lastSuccess: string | null
  state:
    | 'disabled'
    | 'not-set'
    | 'waiting'
    | 'initializing'
    | 'syncing'
    | 'synced'
    | 'error'
    | 'protected'
    | 'permission'
    | 'paused'
  processed?: number
  total?: number
  bytes?: number
  error?: string
}
export interface ScanProgress {
  key: string
  binding: string
  generation: string
  phase: 'records' | 'ignored' | 'cleanup' | 'done'
  cleanStart?: boolean
  after?: string
  processed: number
  total: number
  bytes: number
}
export interface Checkpoint {
  key: string
  binding: string
  generation: string
  digest: string
}
export interface SuccessReceipt {
  key: string
  binding: string
  count: number
  bytes: number
  at: string
  revision: string
}
const booleans = () => ({ outfits: false, home: false, camera: false })
const generations = () => ({ outfits: createUuid(), home: createUuid(), camera: createUuid() })
function newConfig(): BackupConfig {
  return {
    key: 'config',
    sourceId: createUuid(),
    binding: createUuid(),
    paused: false,
    enabled: booleans(),
    initialized: booleans(),
    generations: generations()
  }
}
export function defaultStates(): Record<BackupModule, ModuleProgress> {
  return Object.fromEntries(
    MODULES.map((module) => [
      module,
      { enabled: false, count: 0, lastSuccess: null, state: 'disabled' }
    ])
  ) as Record<BackupModule, ModuleProgress>
}
export async function setting<T>(key: string): Promise<T | undefined> {
  return runStoreRequest<T | undefined>(BACKUP_SETTINGS_STORE, 'readonly', (store) =>
    store.get(key)
  )
}
export async function loadConfig(): Promise<BackupConfig> {
  const existing = await setting<BackupConfig>('config')
  if (existing?.binding && existing.generations) return existing
  return runDatabaseTransaction([BACKUP_SETTINGS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(BACKUP_SETTINGS_STORE)
    const current = await databaseRequest<BackupConfig | undefined>(store.get('config'))
    const value = current
      ? {
          ...current,
          binding: current.binding ?? createUuid(),
          paused: current.paused ?? false,
          generations: current.generations ?? generations()
        }
      : newConfig()
    store.put(value)
    return value
  })
}
/** UI 只更新指定字段，绝不能用过期的整份配置覆盖另一标签页刚修改的模块。 */
export async function updateConfig(
  update: (current: BackupConfig) => void,
  expectedRevisions: Partial<Record<BackupModule, string>> = {}
): Promise<BackupConfig> {
  await loadConfig()
  const result = await runDatabaseTransaction([BACKUP_SETTINGS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(BACKUP_SETTINGS_STORE)
    const current = await databaseRequest<BackupConfig>(store.get('config'))
    if (!current) throw new Error('浏览器存档已重置，请重新选择目录')
    for (const module of MODULES) {
      if (expectedRevisions[module] === undefined) continue
      const revision =
        (await databaseRequest<Revision | undefined>(store.get(revisionKey(module))))?.revision ??
        ''
      if (revision !== expectedRevisions[module])
        throw new Error('浏览器数据在预览后已变化，请重新预览')
    }
    update(current)
    store.put(current)
    return current
  })
  announceBackupChange()
  return result
}
export async function readRevision(module: BackupModule): Promise<string> {
  return (await setting<Revision>(revisionKey(module)))?.revision ?? ''
}
export async function countBrowserRecords(module: BackupModule): Promise<number> {
  return runStoreRequest(ADAPTERS[module].records, 'readonly', (store) => store.count())
}
export const moduleRange = (module: BackupModule): IDBKeyRange =>
  IDBKeyRange.bound([module, ''], [module, '\uffff', '\uffff'])
export async function currentKeys(
  store: string,
  after?: string,
  size = BATCH_RECORDS
): Promise<string[]> {
  return (
    await runStoreRequest<IDBValidKey[]>(store, 'readonly', (s) =>
      s.getAllKeys(after === undefined ? undefined : IDBKeyRange.lowerBound(after, true), size)
    )
  ).map(String)
}
export async function dirtyChanges(
  module: BackupModule,
  limit = BATCH_RECORDS
): Promise<DirtyChange[]> {
  return runStoreRequest<DirtyChange[]>(BACKUP_DIRTY_STORE, 'readonly', (store) =>
    store.getAll(moduleRange(module), limit)
  )
}

/** 异常归零时才扫描操作凭证；日常增量仍是 O(受影响记录数)。 */
export async function confirmedDeletionKeys(
  module: BackupModule
): Promise<{ ids: string[]; reset: boolean }> {
  return runDatabaseTransaction(
    [BACKUP_DIRTY_STORE],
    'readonly',
    (tx) =>
      new Promise((resolve, reject) => {
        const ids: string[] = []
        let reset = false
        const request = tx.objectStore(BACKUP_DIRTY_STORE).openCursor(moduleRange(module))
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {
            resolve({ ids, reset })
            return
          }
          const change = cursor.value as DirtyChange
          if (change.intent === 'confirmed-delete') {
            if (change.key[1] === 'reset') reset = true
            if (change.key[1] === 'record') ids.push(change.key[2])
          }
          cursor.continue()
        }
        request.onerror = () => reject(request.error)
      })
  )
}
export async function active(config: BackupConfig, module: BackupModule): Promise<boolean> {
  // 不调用 loadConfig：站点数据被清理后不能自动创建身份，更不能创建一个空备份。
  const fresh = await setting<BackupConfig>('config')
  return Boolean(
    fresh &&
    fresh.sourceId === config.sourceId &&
    fresh.binding === config.binding &&
    fresh.generations[module] === config.generations[module] &&
    fresh.enabled[module] &&
    !fresh.paused
  )
}
export async function checkpoint(
  config: BackupConfig,
  module: BackupModule
): Promise<Checkpoint | undefined> {
  const value = await setting<Checkpoint>(`checkpoint:${module}`)
  return value?.binding === config.binding ? value : undefined
}
export async function scanProgress(
  config: BackupConfig,
  module: BackupModule
): Promise<ScanProgress | undefined> {
  const value = await setting<ScanProgress>(`scan:${module}`)
  return value?.binding === config.binding && value.generation === config.generations[module]
    ? value
    : undefined
}
export async function saveScan(config: BackupConfig, module: BackupModule, scan: ScanProgress) {
  await runDatabaseTransaction([BACKUP_SETTINGS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(BACKUP_SETTINGS_STORE)
    const current = await databaseRequest<BackupConfig | undefined>(store.get('config'))
    if (
      !current ||
      current.binding !== config.binding ||
      current.generations[module] !== config.generations[module]
    )
      throw new Error('备份设置已改变，已停止旧扫描')
    store.put(scan)
  })
}
/** 只确认仍对应本批修订的脏项；恢复、关闭、换目录之后的旧批次不能确认新任务。 */
export async function acknowledgeStage(
  config: BackupConfig,
  module: BackupModule,
  stage: StageManifest,
  manifestDigest: string
): Promise<void> {
  await runDatabaseTransaction(
    [BACKUP_SETTINGS_STORE, BACKUP_DIRTY_STORE],
    'readwrite',
    async (tx) => {
      const settings = tx.objectStore(BACKUP_SETTINGS_STORE)
      const current = await databaseRequest<BackupConfig | undefined>(settings.get('config'))
      if (!current || current.sourceId !== config.sourceId || current.binding !== config.binding)
        return
      settings.put({
        key: `checkpoint:${module}`,
        binding: config.binding,
        generation: current.generations[module],
        digest: manifestDigest
      } satisfies Checkpoint)
      if (
        stage.receipt?.sourceId !== config.sourceId ||
        stage.receipt.binding !== current.generations[module]
      )
        return
      const dirty = tx.objectStore(BACKUP_DIRTY_STORE)
      for (const change of stage.receipt.changes) {
        const latest = await databaseRequest<DirtyChange | undefined>(dirty.get(change.key))
        if (latest?.revision === change.revision) dirty.delete(change.key)
      }
    }
  )
}
export async function acknowledgeUnchanged(
  config: BackupConfig,
  module: BackupModule,
  changes: DirtyChange[]
) {
  await runDatabaseTransaction(
    [BACKUP_SETTINGS_STORE, BACKUP_DIRTY_STORE],
    'readwrite',
    async (tx) => {
      const current = await databaseRequest<BackupConfig | undefined>(
        tx.objectStore(BACKUP_SETTINGS_STORE).get('config')
      )
      if (
        !current ||
        current.binding !== config.binding ||
        current.generations[module] !== config.generations[module]
      )
        return
      const store = tx.objectStore(BACKUP_DIRTY_STORE)
      for (const change of changes) {
        const item = await databaseRequest<DirtyChange | undefined>(store.get(change.key))
        if (item?.revision === change.revision) store.delete(change.key)
      }
    }
  )
}
export async function recordSuccess(
  config: BackupConfig,
  module: BackupModule,
  manifest: ModuleManifest
) {
  await runDatabaseTransaction([BACKUP_SETTINGS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(BACKUP_SETTINGS_STORE)
    const current = await databaseRequest<BackupConfig | undefined>(store.get('config'))
    if (
      !current ||
      current.binding !== config.binding ||
      current.generations[module] !== config.generations[module]
    )
      return
    current.initialized[module] = true
    if (current.emptyApprovals) delete current.emptyApprovals[module]
    store.put(current)
    store.put({
      key: `success:${module}`,
      binding: config.binding,
      count: manifest.count,
      bytes: manifest.imageBytes,
      at: manifest.lastSuccess!,
      revision: manifest.sourceRevision
    } satisfies SuccessReceipt)
  })
}
export interface CapturedRecord {
  id: string
  record?: BackupRecord
  image?: unknown
}
export interface Snapshot {
  records: CapturedRecord[]
  ignored: Map<string, unknown>
  tags: string[]
  imageBytes: number
  changes: DirtyChange[]
}
/** 一个只读事务固定记录、图片、标签和修订。图片按条数与字节限制，哈希在事务外算。 */
export async function captureBatch(
  module: BackupModule,
  ids: string[],
  ignored: string[],
  previous: Map<string, Entry | null>,
  changedImages: Set<string>,
  forceImages = false
): Promise<Snapshot> {
  const a = ADAPTERS[module]
  return runDatabaseTransaction(
    [
      a.records,
      a.images,
      a.tags,
      BACKUP_DIRTY_STORE,
      ...(module === 'outfits' ? [OUTFIT_IGNORED_CODES_STORE] : [])
    ],
    'readonly',
    async (tx) => {
      const tags = normalTags(module, await databaseRequest(tx.objectStore(a.tags).get(a.tagKey)))
      const captured: CapturedRecord[] = []
      const changes: DirtyChange[] = []
      const dirty = tx.objectStore(BACKUP_DIRTY_STORE)
      const tagsChanged = await databaseRequest<DirtyChange | undefined>(
        dirty.get([module, 'tags', 'default'])
      )
      if (tagsChanged) changes.push(tagsChanged)
      let imageBytes = 0
      for (const id of ids) {
        const [raw, recordChanged, imageChanged] = await Promise.all([
          databaseRequest(tx.objectStore(a.records).get(id)),
          databaseRequest<DirtyChange | undefined>(dirty.get([module, 'record', id])),
          databaseRequest<DirtyChange | undefined>(dirty.get([module, 'image', id]))
        ])
        const pending = [recordChanged, imageChanged].filter((value): value is DirtyChange =>
          Boolean(value)
        )
        if (raw === undefined) {
          captured.push({ id })
          changes.push(...pending)
          continue
        }
        const record = a.validate(raw)
        if (record.id !== id) throw new Error(`记录主键与内容不符：${id}`)
        assertTags(record, tags)
        let image: unknown
        const prev = previous.get(id)
        if (
          presentImage(module, record) &&
          (forceImages ||
            imageChanged ||
            changedImages.has(id) ||
            !prev?.image ||
            needsImage(module, prev.value as BackupRecord, record))
        ) {
          image = await databaseRequest(tx.objectStore(a.images).get(id))
          const size = imageBlob(module, image).size
          if (captured.length && imageBytes + size > BATCH_IMAGE_BYTES) break
          imageBytes += size
        }
        captured.push({ id, record, image })
        changes.push(...pending)
        if (imageBytes >= BATCH_IMAGE_BYTES) break
      }
      const values = new Map<string, unknown>()
      if (module === 'outfits')
        for (const code of ignored) {
          values.set(
            code,
            await databaseRequest(tx.objectStore(OUTFIT_IGNORED_CODES_STORE).get(code))
          )
          const change = await databaseRequest<DirtyChange | undefined>(
            dirty.get([module, 'ignored', code])
          )
          if (change) changes.push(change)
        }
      return { records: captured, ignored: values, tags, imageBytes, changes }
    }
  )
}

/** 队列为空与对应业务修订必须在同一个事务中观察，防止发布一个尚未写盘的新修订。 */
export async function idleRevision(module: BackupModule): Promise<string | null> {
  return runDatabaseTransaction(
    [BACKUP_SETTINGS_STORE, BACKUP_DIRTY_STORE],
    'readonly',
    async (tx) => {
      const [pending, revision] = await Promise.all([
        databaseRequest(tx.objectStore(BACKUP_DIRTY_STORE).count(moduleRange(module))),
        databaseRequest<Revision | undefined>(
          tx.objectStore(BACKUP_SETTINGS_STORE).get(revisionKey(module))
        )
      ])
      return pending ? null : (revision?.revision ?? '')
    }
  )
}

export interface BrowserBaseline {
  revisions: Record<BackupModule, string>
  counts: Record<BackupModule, number>
}
export async function browserBaseline(): Promise<BrowserBaseline> {
  return runDatabaseTransaction(
    [BACKUP_SETTINGS_STORE, ...MODULES.map((module) => ADAPTERS[module].records)],
    'readonly',
    async (tx) => {
      const revisions = {} as BrowserBaseline['revisions']
      const counts = {} as BrowserBaseline['counts']
      for (const module of MODULES) {
        revisions[module] =
          (
            await databaseRequest<Revision | undefined>(
              tx.objectStore(BACKUP_SETTINGS_STORE).get(revisionKey(module))
            )
          )?.revision ?? ''
        counts[module] = await databaseRequest(tx.objectStore(ADAPTERS[module].records).count())
      }
      return { revisions, counts }
    }
  )
}
export async function assertBrowserBaseline(expected: BrowserBaseline): Promise<void> {
  if (JSON.stringify(await browserBaseline()) !== JSON.stringify(expected))
    throw new Error('浏览器数据在确认后已变化，请重新确认')
}
