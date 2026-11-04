import { BACKUP_SETTINGS_STORE, BACKUP_DIRTY_STORE } from '../file-system/database'
import { databaseRequest, runDatabaseTransaction } from '../file-system/transaction'
import { createUuid } from '../uuid'
import { withAllBackupLocks } from './coordination'
import {
  announceBackupChange,
  revisionKey,
  type BackupModule,
  type Revision
} from './changeJournal'
import { buildModuleCopy, locateRoot, permission } from './engine'
import {
  browserBaseline,
  assertBrowserBaseline,
  type BrowserBaseline,
  loadConfig,
  moduleRange,
  readRevision,
  setting,
  type BackupConfig
} from './repository'
import { verifyModule } from './restore'
import {
  FORMAT,
  VERSION,
  UUID,
  MODULES,
  MODULE_NAMES,
  MODULE_LABELS,
  type RootManifest,
  type ModuleManifest,
  directoryAt,
  readBytes,
  readJson,
  putBytes,
  jsonBytes,
  digest,
  parseJson,
  validateRoot,
  discoverStages,
  validateStage,
  moduleDirectory,
  MAX_JSON_BYTES
} from './disk'

const JOURNAL = '重建任务.json'
interface RebuildJournal {
  format: typeof FORMAT
  version: 1
  sourceId: string
  generation: string
  nextBackupId: string
  baseDigest: string
  previous: RootManifest
}
function validateJournal(raw: unknown): RebuildJournal {
  const value = raw as RebuildJournal | null
  if (
    !value ||
    value.format !== FORMAT ||
    value.version !== VERSION ||
    !UUID.test(value.sourceId) ||
    !UUID.test(value.generation) ||
    !UUID.test(value.nextBackupId) ||
    !/^[a-f0-9]{64}$/.test(value.baseDigest)
  )
    throw new Error('重建任务清单损坏，禁止自动清理或覆盖')
  validateRoot(value.previous)
  return value
}
async function removeDirectory(root: FileSystemDirectoryHandle, path: string) {
  const current = await rootBytes(root)
  const activePaths = MODULES.map(
    (module) => current.info.modulePaths?.[module] ?? MODULE_NAMES[module]
  )
  if (activePaths.some((active) => active === path || active.startsWith(path + '/')))
    throw new Error('拒绝删除当前根清单仍在使用的模块目录')
  const parts = path.split('/'),
    name = parts.pop()!
  try {
    const parent = parts.length ? await directoryAt(root, parts.join('/')) : root
    await parent.removeEntry(name, { recursive: true })
  } catch (error) {
    if ((error as DOMException).name !== 'NotFoundError') throw error
  }
}
async function deleteJournal(root: FileSystemDirectoryHandle) {
  try {
    await root.removeEntry(JOURNAL)
  } catch (error) {
    if ((error as DOMException).name !== 'NotFoundError') throw error
  }
}
async function cleanupPrevious(root: FileSystemDirectoryHandle, journal: RebuildJournal) {
  for (const module of MODULES) {
    const oldPath = journal.previous.modulePaths?.[module] ?? MODULE_NAMES[module]
    if (oldPath === `模块数据/${journal.generation}/${MODULE_NAMES[module]}`)
      throw new Error('拒绝清理当前有效模块')
    await removeDirectory(root, oldPath)
  }
  // 旧代次留下的空壳和元信息一并移除；路径来自已严格验证的根清单。
  const generations = new Set(
    Object.values(journal.previous.modulePaths ?? {}).map((value) => value!.split('/')[1])
  )
  for (const generation of generations)
    if (generation !== journal.generation) await removeDirectory(root, `模块数据/${generation}`)
  await deleteJournal(root)
}
async function rootBytes(root: FileSystemDirectoryHandle) {
  const bytes = await readBytes(root, '存档信息.json', MAX_JSON_BYTES)
  if (!bytes) throw new Error('原存档信息缺失，禁止继续重建')
  return { bytes, info: validateRoot(parseJson<RootManifest>(bytes)), sha: await digest(bytes) }
}
async function publishBinding(
  handle: FileSystemDirectoryHandle,
  root: FileSystemDirectoryHandle,
  info: RootManifest,
  expectedSource: string
): Promise<void> {
  const prepared: { module: BackupModule; manifest: ModuleManifest; sha: string }[] = []
  for (const module of MODULES) {
    const verified = await verifyModule(root, module)
    prepared.push({ module, manifest: verified.manifest, sha: verified.fingerprint })
  }
  await runDatabaseTransaction(
    [BACKUP_SETTINGS_STORE, BACKUP_DIRTY_STORE],
    'readwrite',
    async (tx) => {
      const settings = tx.objectStore(BACKUP_SETTINGS_STORE)
      const current = await databaseRequest<BackupConfig | undefined>(settings.get('config'))
      if (!current || current.sourceId !== expectedSource)
        throw new Error('浏览器身份已改变；新磁盘副本已保留，请重新选择目录')
      const binding = createUuid()
      current.handle = handle
      current.directoryName = handle.name
      current.binding = binding
      current.backupId = info.backupId
      // 保留最新的模块开关和暂停设置；不重置其他窗口在重建期间调整的偏好。
      for (const { module, manifest, sha } of prepared) {
        const generation = createUuid()
        current.generations[module] = generation
        current.initialized[module] = true
        settings.put({ key: `checkpoint:${module}`, binding, generation, digest: sha })
        settings.put({
          key: `success:${module}`,
          binding,
          count: manifest.count,
          bytes: manifest.imageBytes,
          at: manifest.lastSuccess,
          revision: manifest.sourceRevision
        })
        settings.delete(`scan:${module}`)
        settings.delete(`error:${module}`)
        const revision =
          (await databaseRequest<Revision | undefined>(settings.get(revisionKey(module))))
            ?.revision ?? ''
        if (revision === manifest.sourceRevision)
          tx.objectStore(BACKUP_DIRTY_STORE).delete(moduleRange(module))
      }
      settings.put(current)
    }
  )
}
/**
 * 仅由双重确认的“以当前数据重建”入口调用。
 * 完整新副本写入独立代次，全部校验通过后，只替换一个根指针文件；原副本随后清理。
 * 构建期间允许编辑；基线变化则停止发布并保留原副本。最终发布后的新变更保留在队列。
 */
export async function rebuildBackupDirectory(
  handle: FileSystemDirectoryHandle,
  progress: (text: string) => void,
  expected?: BrowserBaseline
): Promise<void> {
  if (!(await permission(handle))) throw new Error('重建需要用户授予目录写入权限')
  const baseline = expected ?? (await browserBaseline())
  await withAllBackupLocks(async () => {
    await assertBrowserBaseline(baseline)
    const config = await loadConfig(),
      root = await locateRoot(handle)
    if (!root) throw new Error('没有可识别的旧备份，请直接选择新目录')
    let original = await rootBytes(root)
    const interrupted = await readJson<RebuildJournal>(root, JOURNAL)
    if (interrupted) {
      const journal = validateJournal(interrupted)
      if (journal.sourceId !== config.sourceId)
        throw new Error('此未完成重建属于其他浏览器存档，请先恢复或使用新子目录')
      if (original.info.backupId === journal.nextBackupId) {
        if (original.info.sourceId !== journal.sourceId) throw new Error('已发布重建的身份不符')
        for (const module of MODULES)
          if (
            original.info.modulePaths?.[module] !==
            `模块数据/${journal.generation}/${MODULE_NAMES[module]}`
          )
            throw new Error('已发布重建的模块指针不符')
        progress('正在校验已发布副本，并完成上次重建的绑定和清理……')
        await publishBinding(handle, root, original.info, config.sourceId)
        await cleanupPrevious(root, journal)
        announceBackupChange()
        return
      }
      if (original.sha !== journal.baseDigest)
        throw new Error('原副本在重建中断后已变化，禁止猜测清理目标')
      // 尚未发布，只删除本任务自己生成的临时代次；旧副本不动。
      await removeDirectory(root, `模块数据/${journal.generation}`)
      await deleteJournal(root)
      original = await rootBytes(root)
    }
    const oldDigests = new Map<BackupModule, string | null>()
    for (const module of MODULES) {
      try {
        const dir = await moduleDirectory(root, module)
        for (const id of await discoverStages(dir)) await validateStage(dir, id, module)
        const bytes = await readBytes(dir, '模块信息.json', MAX_JSON_BYTES)
        oldDigests.set(module, bytes ? await digest(bytes) : null)
      } catch (error) {
        if ((error as DOMException).name !== 'NotFoundError') throw error
        oldDigests.set(module, null)
      }
    }
    await assertBrowserBaseline(baseline)
    const baselines = baseline.revisions
    const journal: RebuildJournal = {
      format: FORMAT,
      version: VERSION,
      sourceId: config.sourceId,
      generation: createUuid(),
      nextBackupId: createUuid(),
      baseDigest: original.sha,
      previous: original.info
    }
    await putBytes(root, JOURNAL, jsonBytes(journal))
    const nextInfo: RootManifest = {
      format: FORMAT,
      version: VERSION,
      backupId: journal.nextBackupId,
      sourceId: config.sourceId,
      sourceOrigin: typeof location === 'undefined' ? 'test' : location.origin,
      createdAt: new Date().toISOString()
    }
    let switched = false
    try {
      const temporary = await directoryAt(root, `模块数据/${journal.generation}`, true)
      await putBytes(temporary, '存档信息.json', jsonBytes(nextInfo))
      const scratch: BackupConfig = {
        ...config,
        binding: createUuid(),
        backupId: nextInfo.backupId,
        initialized: { outfits: false, home: false, camera: false },
        generations: { outfits: createUuid(), home: createUuid(), camera: createUuid() }
      }
      for (const module of MODULES) {
        const guard = async () => {
          const current = await setting<BackupConfig>('config')
          return Boolean(
            current &&
            current.sourceId === config.sourceId &&
            current.binding === config.binding &&
            current.paused === config.paused &&
            (await readRevision(module)) === baselines[module]
          )
        }
        await buildModuleCopy(
          scratch,
          await moduleDirectory(temporary, module, true),
          module,
          baselines[module],
          guard,
          (done, total) =>
            progress(`正在重建${MODULE_LABELS[module]} · ${done}/${total} 条；旧副本仍保留`)
        )
      }
      for (const module of MODULES) {
        await verifyModule(temporary, module)
        if ((await readRevision(module)) !== baselines[module])
          throw new Error('重建期间浏览器数据有修改。已保留旧副本，请停止编辑后重试。')
        let sha: string | null = null
        try {
          const bytes = await readBytes(
            await moduleDirectory(root, module),
            '模块信息.json',
            MAX_JSON_BYTES
          )
          sha = bytes ? await digest(bytes) : null
        } catch (error) {
          if ((error as DOMException).name !== 'NotFoundError') throw error
        }
        if (sha !== oldDigests.get(module))
          throw new Error('旧电脑副本被其他写入方修改，已停止切换。')
      }
      await assertBrowserBaseline(baseline)
      if ((await rootBytes(root)).sha !== journal.baseDigest)
        throw new Error('根目录身份在重建期间发生变化')
      nextInfo.modulePaths = Object.fromEntries(
        MODULES.map((module) => [module, `模块数据/${journal.generation}/${MODULE_NAMES[module]}`])
      )
      progress('完整新副本已校验，正在切换目录指针……')
      await putBytes(root, '存档信息.json', jsonBytes(nextInfo))
      const published = await rootBytes(root)
      if (published.info.backupId !== nextInfo.backupId) throw new Error('根指针切换验证失败')
      switched = true
      await publishBinding(handle, root, nextInfo, config.sourceId)
      await cleanupPrevious(root, journal)
      announceBackupChange()
    } catch (error) {
      const current = await rootBytes(root).catch(() => null)
      if (current?.info.backupId === journal.nextBackupId) switched = true
      if (!switched && current?.sha === journal.baseDigest) {
        try {
          await removeDirectory(root, `模块数据/${journal.generation}`)
          await deleteJournal(root)
        } catch {
          /* 保留清单，以便下次准确清理。 */
        }
      }
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(
        switched
          ? `新副本已发布，但绑定或清理尚未完成。请再次点击重建完成收尾：${reason}`
          : `重建未发布，原有副本未被替换：${reason}`
      )
    }
  })
}
