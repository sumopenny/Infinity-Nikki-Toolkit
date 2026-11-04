import {
  openDb,
  runStoreRequest,
  BACKUP_DIRTY_STORE,
  BACKUP_SETTINGS_STORE,
  BACKUP_RESTORE_STORE,
  OUTFIT_IGNORED_CODES_STORE
} from '../file-system/database'
import { databaseRequest, runDatabaseTransaction } from '../file-system/transaction'
import { createUuid } from '../uuid'
import { inspectStoredImage, matchesStoredImageExtension } from '../storedImage'
import {
  announceBackupChange,
  revisionKey,
  type Revision,
  type BackupModule
} from './changeJournal'
import { ADAPTERS, assertTags, normalTags, presentImage, type StoredImage } from './adapters'
import { locked, withExclusiveBusiness } from './coordination'
import { locateRoot, permission } from './engine'
import {
  acknowledgeStage,
  setting,
  countBrowserRecords,
  readRevision,
  moduleRange,
  BATCH_IMAGE_BYTES,
  BATCH_RECORDS,
  type BackupConfig
} from './repository'
import {
  MODULES,
  MODULE_LABELS,
  type Entry,
  type ModuleManifest,
  type RootManifest,
  HASH,
  digest,
  keyHash,
  jsonBytes,
  parseJson,
  readBytes,
  readIndex,
  readModuleManifest,
  indexPath,
  recordPath,
  ignoredPath,
  discoverStages,
  validateStage,
  applyStage,
  finishStage,
  moduleDirectory,
  validateRoot,
  MAX_JSON_BYTES
} from './disk'

export interface ModulePreview {
  module: BackupModule
  title: string
  browserCount: number
  backupCount: number
  lastSuccess: string | null
  ready: boolean
  message: string
  fingerprint: string
  browserFingerprint: string
  imageBytes: number
  staged: number
  canResume: boolean
  missing?: boolean
}
export interface RestorePreview {
  backupId: string
  rootFingerprint: string
  modules: ModulePreview[]
}
interface StagingItem {
  module: BackupModule
  kind: 'record' | 'image' | 'tags' | 'ignored' | 'meta'
  id: string
  token: string
  value: unknown
}
interface RestoreMeta {
  token: string
  baseline: string
  fingerprint: string
  count: number
  ready: true
}
export async function sourceRoot(handle: FileSystemDirectoryHandle) {
  if (!(await permission(handle, false, true))) throw new Error('没有备份目录读取权限')
  const root = await locateRoot(handle)
  if (!root) throw new Error('没有找到暖立方备份目录')
  const bytes = await readBytes(root, '存档信息.json', MAX_JSON_BYTES)
  if (!bytes) throw new Error('存档信息缺失')
  return {
    root,
    info: validateRoot(parseJson<RootManifest>(bytes)),
    fingerprint: await digest(bytes)
  }
}
async function* filesBelow(dir: FileSystemDirectoryHandle, prefix: string): AsyncGenerator<string> {
  let base: FileSystemDirectoryHandle
  try {
    base = await dir.getDirectoryHandle(prefix)
  } catch (error) {
    if ((error as DOMException).name === 'NotFoundError') return
    throw error
  }
  async function* scan(
    current: FileSystemDirectoryHandle,
    at: string,
    depth: number
  ): AsyncGenerator<string> {
    if (depth > 5) throw new Error('备份目录层级异常')
    for await (const [name, handle] of current.entries()) {
      if (handle.kind === 'directory')
        yield* scan(handle as FileSystemDirectoryHandle, at + name + '/', depth + 1)
      else yield at + name
    }
  }
  yield* scan(base, prefix + '/', 0)
}
export interface Verification {
  manifest: ModuleManifest
  fingerprint: string
  images: number
}
/** 每次只持有一张图片；完整检查枚举实际文件，识别漏桶、等数量替换和多余文件。 */
export async function verifyModule(
  root: FileSystemDirectoryHandle,
  module: BackupModule,
  collect?: (kind: StagingItem['kind'], id: string, value: unknown) => Promise<void>
): Promise<Verification> {
  const dir = await moduleDirectory(root, module)
  if ((await discoverStages(dir)).length) throw new Error('目录存在未完成批次，请先预览并确认续写')
  const manifestBytes = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
  if (!manifestBytes) throw new Error('模块信息缺失')
  const manifest = await readModuleManifest(dir, module)
  const fingerprint = await digest(manifestBytes)
  if (!manifest.initialized || !manifest.lastSuccess)
    throw new Error('首次备份尚未完整完成，不能按完整模块恢复')
  const tagsBytes = await readBytes(dir, '标签.json', MAX_JSON_BYTES)
  if (!tagsBytes || (await digest(tagsBytes)) !== manifest.tagDigest)
    throw new Error('标签文件丢失或摘要不符')
  const tags = normalTags(module, parseJson(tagsBytes))
  await collect?.('tags', 'list', tags)
  const expected = new Set<string>(),
    expectedImages = new Set<string>(),
    expectedIndexes = new Set<string>()
  const codes = new Set<string>()
  let count = 0,
    images = 0
  for (const kind of ['record', 'ignored'] as const) {
    for (const [bucket, checksum] of Object.entries(manifest.indexes[kind])) {
      const index = await readIndex(dir, kind, bucket, checksum)
      expectedIndexes.add(indexPath(kind, bucket))
      for (const [hash, sha] of Object.entries(index)) {
        const path = kind === 'record' ? recordPath(hash) : ignoredPath(hash)
        expected.add(path)
        const bytes = await readBytes(dir, path, MAX_JSON_BYTES)
        if (!bytes || (await digest(bytes)) !== sha) throw new Error(`文件缺失或摘要不符：${path}`)
        if (kind === 'ignored') {
          const entry = parseJson<{ code: string; deletedAt?: string }>(bytes)
          if (
            !entry ||
            typeof entry.code !== 'string' ||
            !entry.code ||
            entry.code.length > 30 ||
            /\s/.test(entry.code) ||
            (entry.deletedAt !== undefined && !Number.isFinite(Date.parse(entry.deletedAt))) ||
            (await keyHash(entry.code)) !== hash
          )
            throw new Error('忽略搭配码无效或索引不匹配')
          await collect?.('ignored', entry.code, entry)
          continue
        }
        const entry = parseJson<Entry>(bytes)
        if (
          !entry ||
          entry.version !== 1 ||
          entry.module !== module ||
          typeof entry.id !== 'string' ||
          !HASH.test(entry.revision) ||
          (await keyHash(entry.id)) !== hash ||
          (await digest(
            jsonBytes({ value: entry.value, image: entry.image }).buffer as ArrayBuffer
          )) !== entry.revision
        )
          throw new Error('记录 ID、版本、修订或路径不匹配')
        const record = ADAPTERS[module].validate(entry.value)
        if (record.id !== entry.id) throw new Error('记录主键不匹配')
        assertTags(record, tags)
        if (record.code) {
          if (codes.has(record.code)) throw new Error('重复的业务码')
          codes.add(record.code)
        }
        if (presentImage(module, record) !== Boolean(entry.image))
          throw new Error('业务记录与图片引用不一致')
        let imageValue: Blob | StoredImage | undefined
        if (entry.image) {
          const image = entry.image
          const suffix = image.path.split('.').pop()!
          if (
            !['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(suffix) ||
            image.path !== `图片/${bucket}/${hash}/${image.sha256}.${suffix}` ||
            !HASH.test(image.sha256) ||
            !Number.isSafeInteger(image.size) ||
            image.size <= 0 ||
            typeof image.type !== 'string'
          )
            throw new Error('图片路径、类型或大小不合法')
          if (expectedImages.has(image.path)) throw new Error('意外的跨记录图片引用')
          expectedImages.add(image.path)
          const file = await readBytes(dir, image.path)
          if (!file || file.byteLength !== image.size || (await digest(file)) !== image.sha256)
            throw new Error(`图片缺失或摘要不符：${image.path}`)
          const blob = new Blob([file], { type: image.type })
          const inspected = await inspectStoredImage(blob, typeof createImageBitmap === 'function')
          if (
            !matchesStoredImageExtension(image.path, inspected.extension) ||
            inspected.blob.type !== image.type ||
            (module !== 'camera' &&
              !matchesStoredImageExtension(record.image!, inspected.extension)) ||
            (record.imageSize !== undefined && record.imageSize !== file.byteLength) ||
            (module === 'camera' &&
              (record.cover?.sha256 !== image.sha256 || record.cover.size !== file.byteLength))
          )
            throw new Error('图片真实类型或业务图片信息不匹配')
          imageValue =
            module === 'camera'
              ? blob
              : {
                  id: entry.id,
                  blob,
                  size: blob.size,
                  sha256: image.sha256,
                  extension: inspected.extension
                }
          images += blob.size
        }
        await collect?.('record', entry.id, record)
        if (imageValue) await collect?.('image', entry.id, imageValue)
        count++
      }
    }
  }
  if (count !== manifest.count || images !== manifest.imageBytes)
    throw new Error('模块记录数或图片字节数不匹配')
  for (const [prefix, paths] of [
    ['当前记录', expected],
    ['忽略搭配码', expected],
    ['图片', expectedImages],
    ['索引', expectedIndexes]
  ] as [string, Set<string>][]) {
    for await (const path of filesBelow(dir, prefix))
      if (!paths.has(path)) throw new Error(`发现未登记文件：${path}`)
  }
  const final = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
  if (!final || (await digest(final)) !== fingerprint)
    throw new Error('校验期间目录发生变化，请重新预览')
  return { manifest, fingerprint, images }
}
export async function previewRestore(handle: FileSystemDirectoryHandle): Promise<RestorePreview> {
  const { root, info, fingerprint: rootFingerprint } = await sourceRoot(handle)
  const modules: ModulePreview[] = []
  for (const module of MODULES) {
    const item: ModulePreview = {
      module,
      title: MODULE_LABELS[module],
      browserCount: 0,
      backupCount: 0,
      lastSuccess: null,
      ready: false,
      message: '未发现模块备份',
      fingerprint: '',
      browserFingerprint: '',
      imageBytes: 0,
      staged: 0,
      canResume: false
    }
    try {
      item.browserCount = await countBrowserRecords(module)
      item.browserFingerprint = await readRevision(module)
      const dir = await moduleDirectory(root, module)
      const stages = await discoverStages(dir)
      item.staged = stages.length
      if (stages.length) {
        const checked = await Promise.all(stages.map((id) => validateStage(dir, id, module)))
        if (checked.filter(Boolean).length > 1) throw new Error('多个已准备批次，应用顺序无法确认')
        if (checked.some((stage) => stage && stage.receipt?.sourceId !== info.sourceId))
          throw new Error('待续写批次不属于此来源存档，禁止修改目录')
        item.canResume = true
        item.message = checked.some(Boolean)
          ? '发现有效待续写批次，需同意修改来源目录后继续'
          : '发现未完成的暂存包；正式文件未应用，可确认清理后重新检查'
      } else {
        const result = await verifyModule(root, module)
        item.backupCount = result.manifest.count
        item.lastSuccess = result.manifest.lastSuccess
        item.fingerprint = result.fingerprint
        item.imageBytes = result.images
        item.ready = true
        item.message = '完整性校验通过'
      }
    } catch (error) {
      item.canResume = false
      item.missing = (error as DOMException).name === 'NotFoundError'
      item.message =
        (error as DOMException).name === 'NotFoundError'
          ? '未发现此模块备份'
          : error instanceof Error
            ? error.message
            : String(error)
    }
    modules.push(item)
  }
  if ((await sourceRoot(handle)).fingerprint !== rootFingerprint)
    throw new Error('来源目录身份已变化，请重新预览')
  return { backupId: info.backupId, rootFingerprint, modules }
}
async function deleteTemp(module: BackupModule) {
  await runStoreRequest(BACKUP_RESTORE_STORE, 'readwrite', (store) =>
    store.delete(moduleRange(module))
  )
}
async function saveStaged(items: StagingItem[]) {
  await runDatabaseTransaction([BACKUP_RESTORE_STORE], 'readwrite', async (tx) => {
    for (const item of items) tx.objectStore(BACKUP_RESTORE_STORE).put(item)
  })
}
async function stageModule(
  root: FileSystemDirectoryHandle,
  module: BackupModule,
  token: string,
  baseline: string,
  expected: string,
  progress: (value: string) => void
) {
  let items: StagingItem[] = [],
    bytes = 0,
    count = 0
  const flush = async () => {
    if (!items.length) return
    await saveStaged(items)
    items = []
    bytes = 0
    progress(`正在暂存${MODULE_LABELS[module]} · ${count} 条（正式数据尚未替换）`)
  }
  const result = await verifyModule(root, module, async (kind, id, value) => {
    const blob =
      kind === 'image' ? (value instanceof Blob ? value : (value as StoredImage).blob) : undefined
    if (
      items.length &&
      (items.length >= BATCH_RECORDS * 2 || bytes + (blob?.size ?? 0) > BATCH_IMAGE_BYTES)
    )
      await flush()
    items.push({ module, kind, id, value, token })
    bytes += blob?.size ?? 0
    if (kind === 'record') count++
    if (bytes >= BATCH_IMAGE_BYTES) await flush()
  })
  await flush()
  if (result.fingerprint !== expected) throw new Error('暂存过程中来源发生变化，请重新预览')
  await saveStaged([
    {
      module,
      kind: 'meta',
      id: 'commit',
      token,
      value: {
        token,
        baseline,
        fingerprint: expected,
        count,
        ready: true
      } satisfies RestoreMeta
    }
  ])
}
/** 唯一修改正式表的位置。修订核对、清空、游标复制、停用旧任务在同一个原子事务。 */
async function commitRestore(
  module: BackupModule,
  token: string,
  expectedBaseline: string
): Promise<void> {
  const a = ADAPTERS[module]
  const stores = [
    a.records,
    a.images,
    a.tags,
    BACKUP_RESTORE_STORE,
    BACKUP_DIRTY_STORE,
    BACKUP_SETTINGS_STORE,
    ...(module === 'outfits' ? [OUTFIT_IGNORED_CODES_STORE] : [])
  ]
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    let failure: unknown
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onabort = () => {
      db.close()
      reject(failure ?? tx.error ?? new Error('恢复最终提交失败，原数据已保留'))
    }
    tx.onerror = () => {
      /* handled by onabort */
    }
    const execute = async () => {
      const settings = tx.objectStore(BACKUP_SETTINGS_STORE),
        staged = tx.objectStore(BACKUP_RESTORE_STORE)
      const revision =
        (await databaseRequest<Revision | undefined>(settings.get(revisionKey(module))))
          ?.revision ?? ''
      const meta = (
        await databaseRequest<StagingItem | undefined>(staged.get([module, 'meta', 'commit']))
      )?.value as RestoreMeta | undefined
      if (
        !meta?.ready ||
        meta.token !== token ||
        meta.baseline !== expectedBaseline ||
        revision !== expectedBaseline
      )
        throw new Error('正式数据或恢复暂存已变化，请重新预览；原数据未清空')
      tx.objectStore(a.records).clear()
      tx.objectStore(a.images).clear()
      tx.objectStore(a.tags).clear()
      if (module === 'outfits') tx.objectStore(OUTFIT_IGNORED_CODES_STORE).clear()
      let count = 0
      // 分页读取元数据，图片每次仅取一条。避免一万次 cursor.continue 的跨进程往返，
      // 也不把所有 Blob 同时装入内存；下面仍只等待 IDB 请求，属于同一个原子事务。
      for (const kind of ['record', 'image', 'tags', 'ignored'] as const) {
        let after: string | undefined
        while (true) {
          const lower = after === undefined ? [module, kind] : [module, kind, after]
          const range = IDBKeyRange.bound(lower, [module, kind, []], after !== undefined)
          const page = await databaseRequest<StagingItem[]>(
            staged.getAll(range, kind === 'image' ? 1 : BATCH_RECORDS)
          )
          if (!page.length) break
          for (const item of page) {
            if (item.token !== token || item.module !== module || item.kind !== kind)
              throw new Error('暂存区包含其他恢复任务的数据')
            if (kind === 'record') {
              tx.objectStore(a.records).put(item.value)
              count++
            } else if (kind === 'image') {
              if (a.imageValue === 'blob') tx.objectStore(a.images).put(item.value, item.id)
              else tx.objectStore(a.images).put(item.value)
            } else if (kind === 'tags') tx.objectStore(a.tags).put(item.value, a.tagKey)
            else if (module === 'outfits')
              tx.objectStore(OUTFIT_IGNORED_CODES_STORE).put(item.value)
            else throw new Error('恢复暂存区包含意外的忽略码')
          }
          after = page.at(-1)!.id
        }
      }
      if (count !== meta.count) throw new Error('恢复暂存记录数不符')
      staged.delete(moduleRange(module))
      const config = await databaseRequest<BackupConfig | undefined>(settings.get('config'))
      if (config) {
        config.enabled[module] = false
        config.initialized[module] = false
        config.generations[module] = createUuid()
        settings.put(config) // 其他模块的目录和开关取本事务中的最新值。
      }
      settings.put({ key: revisionKey(module), revision: createUuid() } satisfies Revision)
      settings.delete(`scan:${module}`)
      settings.delete(`error:${module}`)
      tx.objectStore(BACKUP_DIRTY_STORE).delete(moduleRange(module))
    }
    void execute().catch((error) => {
      failure = error
      try {
        tx.abort()
      } catch {
        db.close()
        reject(error)
      }
    })
  })
}
export async function resumeSource(handle: FileSystemDirectoryHandle, module: BackupModule) {
  if (!MODULES.includes(module)) throw new Error('未知模块')
  if (!(await permission(handle))) throw new Error('请先授权对恢复来源目录的写入权限')
  return locked(module, async () => {
    const { root, info } = await sourceRoot(handle),
      dir = await moduleDirectory(root, module)
    const ids = await discoverStages(dir)
    const checked = await Promise.all(ids.map((id) => validateStage(dir, id, module)))
    if (checked.filter(Boolean).length > 1) throw new Error('存在多个已准备批次，不能自动续写')
    if (checked.some((stage) => stage && stage.receipt?.sourceId !== info.sourceId))
      throw new Error('待续写批次不属于此来源存档，禁止修改目录')
    for (const [i, id] of ids.entries()) {
      if (checked[i]) {
        const stage = await applyStage(dir, id, module, false)
        const current = await setting<BackupConfig>('config')
        if (current?.sourceId === info.sourceId && current.backupId === info.backupId) {
          const bytes = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
          if (!bytes) throw new Error('续写后模块信息丢失，暂存批次已保留，请重试')
          await acknowledgeStage(current, module, stage, await digest(bytes))
        }
      }
      await finishStage(dir, id)
    }
  })
}
export async function restoreSelected(
  handle: FileSystemDirectoryHandle,
  preview: RestorePreview,
  selected: BackupModule[],
  progress: (value: string) => void,
  onCommitted?: (module: BackupModule) => void
): Promise<string[]> {
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((module) => !MODULES.includes(module))
  )
    throw new Error('请选择有效且不重复的模块')
  const restored: string[] = []
  for (const module of MODULES.filter((value) => selected.includes(value))) {
    const expected = preview.modules.find((value) => value.module === module)
    if (!expected?.ready) throw new Error(`${MODULE_LABELS[module]}未通过完整性检查`)
    try {
      await locked(module, () =>
        withExclusiveBusiness([module], async () => {
          const { root, info, fingerprint } = await sourceRoot(handle)
          if (info.backupId !== preview.backupId || fingerprint !== preview.rootFingerprint)
            throw new Error('恢复来源身份已变化，请重新预览')
          const baseline = await readRevision(module)
          if (baseline !== expected.browserFingerprint)
            throw new Error('浏览器数据在预览后发生变化，请重新预览')
          const token = createUuid()
          await deleteTemp(module)
          try {
            await stageModule(root, module, token, baseline, expected.fingerprint, progress)
            // 全量复核源文件，不只比较记录总数。正式数据此时仍保持原状。
            const checked = await verifyModule(root, module)
            if (
              checked.fingerprint !== expected.fingerprint ||
              (await sourceRoot(handle)).fingerprint !== preview.rootFingerprint
            )
              throw new Error('来源在恢复期间发生变化，请重新预览')
            progress(`正在提交${MODULE_LABELS[module]}……`)
            await commitRestore(module, token, baseline)
            restored.push(MODULE_LABELS[module])
            onCommitted?.(module)
          } finally {
            await deleteTemp(module)
          }
        })
      )
    } catch (error) {
      announceBackupChange()
      const text = error instanceof Error ? error.message : String(error)
      throw new Error(
        restored.length ? `已完成：${restored.join('、')}。其余模块未替换：${text}` : text
      )
    }
  }
  announceBackupChange()
  return restored
}
