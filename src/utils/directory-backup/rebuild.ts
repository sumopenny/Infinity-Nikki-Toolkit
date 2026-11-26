import { BACKUP_SETTINGS_STORE, BACKUP_DIRTY_STORE } from '../file-system/database'
import { runDatabaseTransaction } from '../file-system/transaction'
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
  type BackupConfig
} from './repository'
import { verifyModule } from './restore'
import {
  MODULES,
  MODULE_NAMES,
  MODULE_LABELS,
  UUID,
  type RootManifest,
  type ModuleManifest,
  directoryAt,
  deleteFile,
  readBytes,
  readJson,
  putBytes,
  jsonBytes,
  digest,
  readRoot,
  readModuleManifest,
  validateRoot,
  validatePath
} from './disk'

async function publishBinding(
  handle: FileSystemDirectoryHandle,
  root: FileSystemDirectoryHandle,
  info: RootManifest,
  expectedSource: string
): Promise<void> {
  const prepared: { module: BackupModule; manifest: ModuleManifest; sha: string }[] = []
  for (const module of MODULES) {
    const verified = await verifyModule(
      root,
      module,
      undefined,
      await directoryAt(root, MODULE_NAMES[module])
    )
    prepared.push({ module, manifest: verified.manifest, sha: verified.fingerprint })
  }
  await runDatabaseTransaction(
    [BACKUP_SETTINGS_STORE, BACKUP_DIRTY_STORE],
    'readwrite',
    async (tx) => {
      const settings = tx.objectStore(BACKUP_SETTINGS_STORE)
      const current = await (settings.get('config') as Promise<BackupConfig | undefined>)
      if (!current || current.sourceId !== expectedSource)
        throw new Error('浏览器身份已改变；新磁盘副本已保留，请重新选择目录')
      const binding = createUuid()
      current.handle = handle
      current.directoryName = handle.name
      current.binding = binding
      current.backupId = info.backupId
      delete current.directorySourceId
      // 保留最新的模块开关和暂停设置；不重置其他窗口在重建期间调整的偏好。
      for (const { module, manifest, sha } of prepared) {
        const generation = createUuid()
        current.generations[module] = generation
        current.initialized[module] = true
        await settings.put({ key: `checkpoint:${module}`, binding, generation, digest: sha })
        await settings.put({
          key: `success:${module}`,
          binding,
          count: manifest.count,
          bytes: manifest.imageBytes,
          at: manifest.lastSuccess,
          revision: manifest.sourceRevision
        })
        await settings.delete(`scan:${module}`)
        await settings.delete(`error:${module}`)
        const revision =
          (await (settings.get(revisionKey(module)) as Promise<Revision | undefined>))?.revision ??
          ''
        if (revision === manifest.sourceRevision)
          await tx.objectStore(BACKUP_DIRTY_STORE).delete(moduleRange(module))
      }
      await settings.put(current)
    }
  )
}

interface Task {
  id: string
  sourceId: string
  phase: 'building' | 'ready' | 'published'
  baseline: BrowserBaseline
  files: { path: string; digest: string }[]
  old: string[]
}
async function files(dir: FileSystemDirectoryHandle, prefix = ''): Promise<string[]> {
  const result: string[] = []
  for await (const [name, handle] of dir.entries()) {
    const path = prefix + name
    if (path === '_系统/重建中') continue
    if (handle.kind === 'directory')
      result.push(...(await files(handle as FileSystemDirectoryHandle, path + '/')))
    else result.push(path)
  }
  return result
}
function owned(path: string) {
  validatePath(path)
  if (
    !/^(记录\/[^/]+\.json|图片\/[^/]+\.(png|webp|jpe?g|gif|bmp|avif)|标签\.json|忽略搭配码\.json|_系统\/(备份信息|校验索引)\.json)$/.test(
      path
    )
  )
    throw new Error('重建包含未知路径，已停止：' + path)
}
export async function rebuildBackupDirectory(
  handle: FileSystemDirectoryHandle,
  progress: (text: string) => void,
  expected?: BrowserBaseline
): Promise<void> {
  if (!(await permission(handle))) throw new Error('重建需要目录写入权限')
  await withAllBackupLocks(async () => {
    const config = await loadConfig()
    let root: FileSystemDirectoryHandle | null
    let identity: RootManifest
    try {
      root = await locateRoot(handle)
      if (!root) throw new Error('未找到可识别备份')
      identity = await readRoot(root)
    } catch (error) {
      // A source-identity publication may have stopped between module commits.
      // Only fully published tasks owned by this browser permit finishing it.
      root = handle
      const identities: RootManifest[] = []
      for (const module of MODULES) {
        const dir = await directoryAt(root, MODULE_NAMES[module])
        const entries = await directoryAt(dir, '_系统/重建中')
        const tasks: Task[] = []
        for await (const [id, entry] of entries.entries()) {
          if (!UUID.test(id) || entry.kind !== 'directory') throw error
          const task = await readJson<Task>(entries, `${id}/重建清单.json`)
          if (
            !task ||
            task.id !== id ||
            task.sourceId !== config.sourceId ||
            task.phase !== 'published'
          )
            throw error
          tasks.push(task)
        }
        if (tasks.length !== 1) throw error
        identities.push(validateRoot((await readModuleManifest(dir, module)).identity))
      }
      if (new Set(identities.map((value) => value.backupId)).size !== 1) throw error
      identity = identities[0]
    }
    const baseline = expected ?? (await browserBaseline())
    await assertBrowserBaseline(baseline)
    const cleanup: Array<() => Promise<void>> = []
    for (const module of MODULES) {
      const dir = await directoryAt(root, MODULE_NAMES[module])
      const tasks = await directoryAt(dir, '_系统/重建中', true)
      const names: string[] = []
      for await (const [name, entry] of tasks.entries()) {
        if (!UUID.test(name) || entry.kind !== 'directory')
          throw new Error('未知重建目录，禁止清理')
        names.push(name)
      }
      if (names.length > 1) throw new Error('发现多个重建任务，禁止自动覆盖')
      const id = names[0] ?? createUuid(),
        base = await tasks.getDirectoryHandle(id, { create: true })
      let task = await readJson<Task>(base, '重建清单.json')
      if (
        task &&
        (task.id !== id ||
          task.sourceId !== config.sourceId ||
          !['building', 'ready', 'published'].includes(task.phase) ||
          !Array.isArray(task.files) ||
          !Array.isArray(task.old))
      )
        throw new Error('重建清单无效')
      const save = () => putBytes(base, '重建清单.json', jsonBytes(task))
      if (!task || task.phase === 'building') {
        await assertBrowserBaseline(baseline)
        if (task) {
          try {
            await base.removeEntry('新副本', { recursive: true })
          } catch (error) {
            if ((error as DOMException).name !== 'NotFoundError') throw error
          }
        }
        const newDir = await base.getDirectoryHandle('新副本', { create: true })
        const oldFiles = await files(dir)
        oldFiles.forEach(owned)
        task = {
          id,
          sourceId: config.sourceId,
          phase: 'building',
          baseline,
          files: [],
          old: oldFiles
        }
        await save()
        const initial = await readModuleManifest(dir, module)
        await putBytes(
          newDir,
          '_系统/备份信息.json',
          jsonBytes({
            ...initial,
            count: 0,
            imageBytes: 0,
            initialized: false,
            sourceRevision: '',
            lastSuccess: null,
            lastBatch: '',
            indexes: { record: {}, ignored: {} },
            tagDigest: null,
            ignoredDigest: undefined
          })
        )
        const scratch = {
          ...config,
          directorySourceId: identity.sourceId,
          binding: createUuid(),
          initialized: { ...config.initialized, [module]: false }
        }
        await buildModuleCopy(
          scratch,
          newDir,
          module,
          baseline.revisions[module],
          async () => {
            await assertBrowserBaseline(baseline)
            return true
          },
          (done, total) => progress(`正在重建${MODULE_LABELS[module]}：${done}/${total}`)
        )
        await verifyModule(root, module, undefined, newDir)
        for (const path of await files(newDir)) {
          owned(path)
          task.files.push({ path, digest: await digest((await readBytes(newDir, path))!) })
        }
        const oldDir = await base.getDirectoryHandle('旧副本', { create: true })
        for (const path of oldFiles) {
          const bytes = (await readBytes(dir, path))!
          await putBytes(oldDir, path, bytes)
          const written = await readBytes(oldDir, path)
          if (!written || (await digest(written)) !== (await digest(bytes)))
            throw new Error('旧副本复制校验失败，未替换正式文件')
        }
        await assertBrowserBaseline(baseline)
        task.phase = 'ready'
        await save()
      }
      task.files.forEach((file) => {
        owned(file.path)
        if (!/^[a-f0-9]{64}$/.test(file.digest)) throw new Error('重建摘要无效')
      })
      task.old.forEach(owned)
      if (task.phase === 'ready') {
        await assertBrowserBaseline(task.baseline)
        const newDir = await base.getDirectoryHandle('新副本')
        await verifyModule(root, module, undefined, newDir)
        const oldPaths = await files(await base.getDirectoryHandle('旧副本'))
        if (
          oldPaths.length !== task.old.length ||
          oldPaths.some((path) => !task!.old.includes(path))
        )
          throw new Error('旧副本路径与任务不符，禁止清理')
        // Verify every payload before touching any formal file; replay is idempotent.
        for (const file of task.files) {
          const bytes = await readBytes(newDir, file.path)
          if (!bytes || (await digest(bytes)) !== file.digest)
            throw new Error('重建新副本已损坏，旧副本保留')
        }
        const ordered = [...task.files].sort(
          (a, b) =>
            Number(a.path === '_系统/备份信息.json') - Number(b.path === '_系统/备份信息.json')
        )
        for (const file of ordered) {
          const bytes = (await readBytes(newDir, file.path))!
          await putBytes(dir, file.path, bytes)
          if ((await digest((await readBytes(dir, file.path))!)) !== file.digest)
            throw new Error('重建写入验证失败')
        }
        for (const path of task.old.filter(
          (path) => !task!.files.some((file) => file.path === path)
        )) {
          await deleteFile(dir, path)
        }
        await verifyModule(root, module, undefined, dir)
        task.phase = 'published'
        await save()
      }
      await verifyModule(root, module, undefined, dir)
      cleanup.push(() => tasks.removeEntry(id, { recursive: true }))
    }
    const nextIdentity = { ...identity, sourceId: config.sourceId }
    for (const module of MODULES) {
      const dir = await directoryAt(root, MODULE_NAMES[module])
      const manifest = await readModuleManifest(dir, module)
      await putBytes(dir, '_系统/备份信息.json', jsonBytes({ ...manifest, identity: nextIdentity }))
    }
    await readRoot(root)
    await publishBinding(handle, root, nextIdentity, config.sourceId)
    for (const finish of cleanup) await finish()
    announceBackupChange()
  })
}
