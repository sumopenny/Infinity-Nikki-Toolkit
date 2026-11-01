export { hasAllBackupData } from './backupAvailability'
import { backupBaseName } from './backupName'
import {
  createWardrobeBackup,
  loadWardrobe,
  mergeWardrobe,
  parseWardrobeBackup,
  readWardrobeSnapshot,
  type WardrobeSnapshot
} from '../wardrobe/wardrobeStorage'
import { wardrobeRegionScope, type WardrobeRegionScope } from '../wardrobe/wardrobeRegion'
import { hasWardrobeSnapshot } from '../wardrobe/wardrobeOwnership'
import { strToU8, unzip } from 'fflate'
import { backupPartBlob, downloadBackupBlob, type BackupDownload } from './zipBackup'
import { exportOutfitBackup, importOutfitBackup, inspectOutfitBackup } from '../outfit/outfitBackup'
import { hashOutfitBlob } from '../outfit/outfitStorage'
import {
  exportHomeSchemeBackup,
  importHomeSchemeBackup,
  prepareHomeSchemeBackup
} from '../homeBuild/homeSchemeBackup'
import { releaseHomeSchemeUrls } from '../homeBuild/homeSchemeStorage'
import { exportCameraBackup, readCameraBackup } from '../photo-params/favoritesBackup'
import {
  readCameraFavorites,
  planCameraImport,
  applyCameraImport,
  type ImportPlan,
  type FavoriteLibrary
} from '../photo-params/favorites'
import { createResonanceExport, parseResonanceFile } from '../resonance/resonanceFile'
import { loadResonanceRecords, mergeResonanceRecords } from '../resonance/resonanceStorage'
import type { ResonanceRecord } from '../resonance/resonanceTypes'
import { releasePhotoUrls } from '../file-system/photoUrl'

const FORMAT = 'infinity-nikki-all-data-backup'
const MAX_BYTES = 2 * 1024 ** 3
const MAX_MANIFEST = 4 * 1024 ** 2
const MODULES = ['outfits', 'home', 'camera', 'resonance', 'wardrobe'] as const
export type BackupModule = (typeof MODULES)[number]
interface BundleEntry {
  module: BackupModule
  path: string
  size: number
  sha256: string
}
interface BundleManifest {
  format: typeof FORMAT
  version: 1 | 2
  exportedAt: string
  entries: BundleEntry[]
}
export interface AllDataPlan {
  files: Map<BackupModule, File[]>
  camera: FavoriteLibrary
  resonance: ResonanceRecord[]
  wardrobe: WardrobeSnapshot | null
}
export interface ModuleImportResult {
  module: BackupModule
  saved: number
  skipped: number
  failed: number
  rejectedTags?: number
  error?: string
}
export type CameraChoices = Record<string, 'local' | 'incoming'>
export type ResolveCameraConflict = (plan: ImportPlan) => Promise<CameraChoices | null>
export interface WardrobeRegionConflict {
  local: WardrobeRegionScope
  incoming: WardrobeRegionScope
}
export type ResolveWardrobeRegion = (
  conflict: WardrobeRegionConflict
) => Promise<WardrobeRegionScope | null>

/** Keep the original module archives intact so they can also be restored separately. */
export async function exportAllDataBackup(
  download: BackupDownload = (name, blob) => downloadBackupBlob(name, blob, 'all-data')
): Promise<string> {
  const files: Array<{ name: string; blob: Blob }> = []
  const entries: BundleEntry[] = []
  let total = 0
  async function collect(module: BackupModule, blob: Blob) {
    total += blob.size
    if (!blob.size || total > MAX_BYTES - MAX_MANIFEST)
      throw new Error(
        '总备份过大，请使用各模块单独导出 / Backup too large; export modules separately'
      )
    const path =
      module +
      '/' +
      (entries.filter((entry) => entry.module === module).length + 1) +
      (module === 'resonance' || module === 'wardrobe' ? '.json' : '.zip')
    files.push({ name: path, blob })
    entries.push({ module, path, size: blob.size, sha256: await hashOutfitBlob(blob) })
  }
  await exportOutfitBackup((_name, blob) => collect('outfits', blob))
  await exportHomeSchemeBackup((_name, blob) => collect('home', blob))
  for await (const part of exportCameraBackup(await readCameraFavorites()))
    await collect('camera', part.blob)
  const resonance = createResonanceExport(await loadResonanceRecords())
  await parseResonanceFile(resonance, true)
  await collect('resonance', new Blob([JSON.stringify(resonance)], { type: 'application/json' }))
  await collect(
    'wardrobe',
    new Blob([createWardrobeBackup(await loadWardrobe())], { type: 'application/json' })
  )
  const manifest: BundleManifest = {
    format: FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    entries
  }
  const blob = await backupPartBlob(
    { manifest: strToU8(JSON.stringify(manifest)), files, count: entries.length },
    'backup.json',
    { bytes: MAX_BYTES, entries: 10000, records: 10000, manifest: MAX_MANIFEST, image: 1024 ** 3 }
  )
  const name = backupBaseName('全部数据') + '.zip'
  await download(name, blob)
  return name
}

/** Read the ZIP directory so nested module ZIP headers are never treated as outer entries. */
async function readBundle(file: File): Promise<Map<string, Blob>> {
  if (!file.size || file.size > MAX_BYTES)
    throw new Error('总备份为空或过大 / Backup is empty or too large')
  // Inspect content rather than MIME or extension: browser ZIP labels vary.
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (
    header[0] !== 0x50 ||
    header[1] !== 0x4b ||
    !((header[2] === 3 && header[3] === 4) || (header[2] === 5 && header[3] === 6))
  )
    throw new Error('backup_file_not_zip')
  const names = new Set<string>()
  let expanded = 0,
    failure: Error | null = null
  const input = new Uint8Array(await file.arrayBuffer())
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(
      input,
      {
        filter: (entry) => {
          const limit = entry.name === 'backup.json' ? MAX_MANIFEST : 1024 ** 3
          if (
            names.has(entry.name) ||
            names.size >= 10000 ||
            !/^(backup\.json|(outfits|home|camera)\/[1-9]\d*\.zip|(resonance|wardrobe)\/1\.json)$/.test(
              entry.name
            )
          ) {
            failure = new Error('总备份包含重复或不支持的文件 / Invalid backup entry')
          }
          names.add(entry.name)
          expanded += entry.originalSize
          if (
            !Number.isSafeInteger(entry.originalSize) ||
            entry.originalSize < 0 ||
            entry.originalSize > limit ||
            expanded > MAX_BYTES
          )
            failure = new Error('解压后的备份过大 / Expanded backup too large')
          return !failure
        }
      },
      (error, files) =>
        error
          ? reject(new Error('无法读取总 ZIP / Unable to read backup ZIP', { cause: error }))
          : resolve(files)
    )
  })
  if (failure) throw failure
  if (Object.keys(entries).length !== names.size)
    throw new Error('总备份不完整 / Incomplete backup')
  const files = new Map<string, Blob>()
  let actualSize = 0
  for (const [name, bytes] of Object.entries(entries)) {
    actualSize += bytes.length
    if (
      actualSize > MAX_BYTES ||
      bytes.length > (name === 'backup.json' ? MAX_MANIFEST : 1024 ** 3)
    )
      throw new Error('解压后的备份过大 / Expanded backup too large')
    files.set(
      name,
      new Blob([bytes], { type: name.endsWith('.json') ? 'application/json' : 'application/zip' })
    )
  }
  return files
}

/** No database writes: every module is inspected before restoration can start. */
export async function prepareAllDataBackup(file: File): Promise<AllDataPlan> {
  const blobs = await readBundle(file),
    manifestBlob = blobs.get('backup.json')
  if (!manifestBlob) throw new Error('缺少总备份清单 / Missing backup manifest')
  const manifest = JSON.parse(await manifestBlob.text()) as BundleManifest
  if (
    !manifest ||
    manifest.format !== FORMAT ||
    ![1, 2].includes(manifest.version) ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length !== blobs.size - 1
  )
    throw new Error('不支持此总备份格式 / Unsupported backup format')
  const files = new Map<BackupModule, File[]>(MODULES.map((module) => [module, []]))
  const used = new Set<string>()
  for (const entry of manifest.entries) {
    if (
      !entry ||
      !MODULES.includes(entry.module) ||
      typeof entry.path !== 'string' ||
      used.has(entry.path) ||
      !entry.path.startsWith(entry.module + '/') ||
      !Number.isSafeInteger(entry.size) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error('总备份清单损坏 / Invalid backup manifest')
    const blob = blobs.get(entry.path)
    if (!blob || blob.size !== entry.size || (await hashOutfitBlob(blob)) !== entry.sha256)
      throw new Error('总备份文件缺失或校验失败 / Backup file verification failed')
    used.add(entry.path)
    files.get(entry.module)!.push(new File([blob], entry.path, { type: blob.type }))
  }
  if (
    MODULES.some(
      (module) => !(module === 'wardrobe' && manifest.version === 1) && !files.get(module)!.length
    ) ||
    files.get('resonance')!.length !== 1 ||
    files.get('wardrobe')!.length > 1
  )
    throw new Error('总备份缺少模块 / Missing backup module')
  for (const file of files.get('outfits')!) await inspectOutfitBackup(file)
  for (const file of files.get('home')!) await prepareHomeSchemeBackup(file)
  const camera: FavoriteLibrary = { records: [], covers: new Map(), tags: [] }
  const ids = new Set<string>()
  for (const file of files.get('camera')!) {
    const part = await readCameraBackup(file)
    for (const record of part.records) {
      if (ids.has(record.id)) throw new Error('总备份包含重复参数记录 / Duplicate camera record')
      ids.add(record.id)
      camera.records.push(record)
    }
    for (const [id, blob] of part.covers) camera.covers.set(id, blob)
    camera.tags = [...new Set([...camera.tags!, ...part.tags!])]
  }
  const resonance = (
    await parseResonanceFile(JSON.parse(await files.get('resonance')![0].text()), true)
  ).records
  const wardrobeFile = files.get('wardrobe')![0]
  const wardrobe = wardrobeFile ? parseWardrobeBackup(await wardrobeFile.text()) : null
  return { files, camera, resonance, wardrobe }
}

export async function applyAllDataBackup(
  plan: AllDataPlan,
  resolveConflict: ResolveCameraConflict,
  onModule?: (module: BackupModule) => void,
  resolveWardrobeRegion?: ResolveWardrobeRegion
): Promise<ModuleImportResult[] | null> {
  // Resolve interactive choices before saving any module; cancel leaves all data unchanged.
  const cameraPlan = planCameraImport(await readCameraFavorites(), plan.camera)
  const choices = cameraPlan.conflicts.length ? await resolveConflict(cameraPlan) : {}
  if (choices === null) return null
  const localWardrobe = plan.wardrobe ? await readWardrobeSnapshot() : null
  let finalRegion: WardrobeRegionScope | undefined
  if (plan.wardrobe && hasWardrobeSnapshot(plan.wardrobe)) {
    const incoming = wardrobeRegionScope(plan.wardrobe)
    const local = wardrobeRegionScope(localWardrobe!)
    finalRegion = hasWardrobeSnapshot(localWardrobe!) ? local : incoming
    if (hasWardrobeSnapshot(localWardrobe!) && local !== incoming) {
      if (!resolveWardrobeRegion) throw new Error('WARDROBE_REGION_CONFIRMATION_REQUIRED')
      const selected = await resolveWardrobeRegion({ local, incoming })
      if (selected === null) return null
      if (selected !== 'cn' && selected !== 'global') throw new Error('INVALID_WARDROBE_REGION')
      finalRegion = selected
    }
    // 等待选择期间其他标签页可能导入新衣橱；在任何模块写入前拒绝过期确认。
    if (JSON.stringify(await readWardrobeSnapshot()) !== JSON.stringify(localWardrobe))
      throw new Error('WARDROBE_CHANGED')
  }
  const results: ModuleImportResult[] = []
  for (const module of MODULES) {
    if (module === 'wardrobe' && !plan.wardrobe) continue
    onModule?.(module)
    const result: ModuleImportResult = { module, saved: 0, skipped: 0, failed: 0 }
    try {
      if (module === 'outfits') {
        for (const file of plan.files.get(module)!) {
          const imported = await importOutfitBackup(file)
          result.saved += imported.addedCount
          result.skipped += imported.duplicateCount
          result.failed += imported.failedCount
          result.rejectedTags = (result.rejectedTags ?? 0) + imported.rejectedTagCount
          releasePhotoUrls(imported.library.outfits)
        }
      } else if (module === 'home') {
        for (const file of plan.files.get(module)!) {
          const imported = await importHomeSchemeBackup(file)
          result.saved += imported.addedCount
          result.skipped += imported.duplicateCount
          result.failed += imported.failedCount
          releaseHomeSchemeUrls(imported.schemes)
        }
      } else if (module === 'camera') {
        result.saved = await applyCameraImport(cameraPlan, choices)
        result.skipped = cameraPlan.incoming.records.length + cameraPlan.skipped - result.saved
      } else if (module === 'wardrobe') {
        Object.assign(
          result,
          await mergeWardrobe(
            plan.wardrobe!,
            finalRegion === undefined
              ? undefined
              : {
                  regionScope: finalRegion,
                  expectedRegionScope: wardrobeRegionScope(localWardrobe!)
                }
          )
        )
      } else {
        // 与普通导入共用事务合并，保留恢复期间其他窗口新增的共鸣记录。
        if (plan.resonance.length) await mergeResonanceRecords(plan.resonance)
        result.saved = plan.resonance.length
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
    }
    results.push(result)
  }
  return results
}
