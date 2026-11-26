import type { DatabaseStore } from '../file-system/database'
import {
  runStoreRequest,
  CAMERA_PARAMS_STORE as RECORDS,
  CAMERA_COVERS_STORE as COVERS,
  CAMERA_TAGS_STORE as TAGS
} from '../file-system/database'
import { markConfirmedDeletion } from '../directory-backup/changeJournal'
import { runDatabaseTransaction } from '../file-system/transaction'
import type { PhotoParamsResult } from './types'
import { sha256Hex } from '../sha256'

export type FavoriteSource = 'album' | 'tool' | 'manual'
export const MAX_CAMERA_FAVORITE_TAG_LENGTH = 5
// 仅供历史记录读取和旧备份格式校验，不能用于新增标签。
export const LEGACY_CAMERA_FAVORITE_TAG_LENGTH = 60

/** 新增标签按字符计数限制为五字；历史记录及备份仍沿用原有兼容校验。 */
export function isValidNewCameraFavoriteTag(tag: string): boolean {
  return (
    typeof tag === 'string' &&
    tag === tag.trim() &&
    [...tag].length > 0 &&
    [...tag].length <= MAX_CAMERA_FAVORITE_TAG_LENGTH &&
    !/[,，]/.test(tag)
  )
}
export interface CameraFavorite {
  id: string
  version: 1
  name: string
  tag: string
  code: string
  source: FavoriteSource
  result: PhotoParamsResult
  cover: { name: string; type: string; size: number; sha256: string } | null
  createdAt: string
  updatedAt: string
}
export interface FavoriteLibrary {
  records: CameraFavorite[]
  covers: Map<string, Blob>
  tags?: string[]
}
export const normalizeCameraCode = (code: string) => code.replace(/\s/g, '')
export class DuplicateCameraCodeError extends Error {
  constructor() {
    super('该参数已保存')
    this.name = 'DuplicateCameraCodeError'
  }
}
export const cloneFavorite = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

async function transact<T>(
  mode: 'readwrite',
  action: (
    records: DatabaseStore<'readwrite', typeof RECORDS>,
    covers: DatabaseStore<'readwrite', typeof COVERS>,
    tags: DatabaseStore<'readwrite', typeof TAGS>
  ) => Promise<T>
): Promise<T> {
  try {
    return await runDatabaseTransaction([RECORDS, COVERS, TAGS], mode, (tx) =>
      action(tx.objectStore(RECORDS), tx.objectStore(COVERS), tx.objectStore(TAGS))
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError')
      throw new DuplicateCameraCodeError()
    throw error
  }
}

export function cameraFavoriteTags(library: Pick<FavoriteLibrary, 'records' | 'tags'>): string[] {
  return [
    ...new Set([...(library.tags ?? []), ...library.records.map((record) => record.tag)])
  ].filter(
    (tag) =>
      typeof tag === 'string' && !!tag.trim() && tag.length <= LEGACY_CAMERA_FAVORITE_TAG_LENGTH
  )
}
/** 列表可跳过封面；导入导出仍按默认参数读取完整快照。 */
export async function readCameraFavorites(includeCovers = true): Promise<FavoriteLibrary> {
  return runDatabaseTransaction([RECORDS, COVERS, TAGS], 'readonly', async (tx) => {
    const records = tx.objectStore(RECORDS),
      covers = tx.objectStore(COVERS),
      tags = tx.objectStore(TAGS)
    const [list, images, keys, order] = await Promise.all([
      records.getAll(),
      includeCovers ? covers.getAll() : [],
      includeCovers ? covers.getAllKeys() : [],
      tags.get('order')
    ])
    return {
      records: (list as CameraFavorite[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      covers: new Map(keys.map((key, i) => [String(key), images[i] as Blob])),
      tags: cameraFavoriteTags({ records: list, tags: order ?? [] })
    }
  })
}

/** 可见卡片和编辑器独立读取所需封面，不保留整库图片。 */
export async function readCameraFavoriteCover(id: string): Promise<Blob> {
  const blob = await runStoreRequest<Blob | undefined>(COVERS, 'readonly', (store) => store.get(id))
  if (!blob?.size) throw new Error('Camera cover is missing')
  return blob
}
export async function saveCameraFavoriteTags(next: string[]): Promise<string[]> {
  // 排序时允许保留已有长标签，新增的超长标签不得写入。
  if (next.some((tag) => !isValidNewCameraFavoriteTag(tag))) {
    const existing = new Set((await readCameraFavorites(false)).tags)
    if (next.some((tag) => !isValidNewCameraFavoriteTag(tag) && !existing.has(tag)))
      throw new Error('新增标签最多5个字符，不能包含逗号')
  }
  return transact('readwrite', async (records, _covers, tags) => {
    const [list, current] = await Promise.all([records.getAll(), tags.get('order')])
    const order = cameraFavoriteTags({ records: list, tags: [...next, ...(current ?? [])] })
    await tags.put(order, 'order')
    return order
  })
}

export async function coverMetadata(
  file: Blob,
  name = 'cover'
): Promise<NonNullable<CameraFavorite['cover']>> {
  return {
    name,
    type: file.type,
    size: file.size,
    sha256: await sha256Hex(await file.arrayBuffer())
  }
}

export async function saveCameraFavorite(
  record: CameraFavorite,
  cover: Blob | null,
  expected?: CameraFavorite
): Promise<void> {
  const clean = cloneFavorite(record)
  clean.code = normalizeCameraCode(clean.result.rawCameraParams)
  if (!clean.code || !clean.name.trim()) throw new Error('请填写名称并解析参数')
  validateFavorite(clean)
  // 已有长标签可继续选用或编辑，手工写入新标签仍须遵守五字限制。
  if (
    clean.tag &&
    !isValidNewCameraFavoriteTag(clean.tag) &&
    !(await readCameraFavorites(false)).tags?.includes(clean.tag)
  )
    throw new Error('新增标签最多5个字符，不能包含逗号')
  if (Boolean(clean.cover) !== Boolean(cover)) throw new Error('封面不完整')
  await transact('readwrite', async (records, covers, tags) => {
    const current = await records.get(clean.id)
    if (JSON.stringify(current) !== JSON.stringify(expected))
      throw new Error('相机参数已变化，请刷新后重试')
    await records.put(clean)
    const order = await tags.get('order')
    await tags.put(cameraFavoriteTags({ records: [clean], tags: order ?? [] }), 'order')
    if (JSON.stringify(expected?.cover ?? null) !== JSON.stringify(clean.cover)) {
      if (cover) await covers.put(cover, clean.id)
      else await covers.delete(clean.id)
    }
  })
}

export async function deleteCameraFavorite(id: string, confirmed = false): Promise<void> {
  await deleteCameraFavorites([id], confirmed)
}

export function validateFavorite(value: unknown): CameraFavorite {
  if (!value || typeof value !== 'object') throw new Error('无效的参数记录')
  const r = value as CameraFavorite
  const string = (v: unknown): v is string => typeof v === 'string'
  const fields = (v: unknown) =>
    Array.isArray(v) &&
    v.length <= 100 &&
    v.every(
      (f) =>
        f &&
        string(f.label) &&
        string(f.value) &&
        (f.position === undefined ||
          (typeof f.position === 'number' && Number.isFinite(f.position)))
    )
  if (
    r.version !== 1 ||
    !string(r.id) ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(r.id) ||
    !string(r.name) ||
    !r.name.trim() ||
    r.name.length > 200 ||
    !string(r.tag) ||
    r.tag.length > LEGACY_CAMERA_FAVORITE_TAG_LENGTH ||
    r.tag !== r.tag.trim() ||
    /[,，]/.test(r.tag) ||
    !['album', 'tool', 'manual'].includes(r.source) ||
    !string(r.createdAt) ||
    !Number.isFinite(Date.parse(r.createdAt)) ||
    !string(r.updatedAt) ||
    !Number.isFinite(Date.parse(r.updatedAt)) ||
    !r.result ||
    !string(r.result.rawCameraParams) ||
    !r.result.rawCameraParams.trim() ||
    r.result.rawCameraParams.length > 100000 ||
    !string(r.code) ||
    r.code !== normalizeCameraCode(r.result.rawCameraParams) ||
    !fields(r.result.environmentFields) ||
    !fields(r.result.cameraFields) ||
    !fields(r.result.imageFields) ||
    !Array.isArray(r.result.resourceGroups) ||
    r.result.resourceGroups.length > 20 ||
    !r.result.resourceGroups.every(
      (g) =>
        g &&
        string(g.title) &&
        string(g.name) &&
        (g.value === undefined || string(g.value)) &&
        (g.imageUrl === undefined ||
          (string(g.imageUrl) && /^(https?:\/\/|\/[^/])/.test(g.imageUrl))) &&
        ['pose', 'light', 'filter'].includes(g.kind) &&
        (g.id === undefined || string(g.id))
    ) ||
    (r.cover !== null &&
      (!r.cover ||
        !string(r.cover.name) ||
        !string(r.cover.type) ||
        !Number.isSafeInteger(r.cover.size) ||
        r.cover.size < 0 ||
        !/^[a-f0-9]{64}$/.test(r.cover.sha256)))
  ) {
    throw new Error('参数数据损坏或格式不支持')
  }
  return cloneFavorite(r)
}

export interface ImportPlan {
  base: CameraFavorite[]
  baseTags: string[]
  incoming: FavoriteLibrary
  conflicts: CameraFavorite[]
  skipped: number
}
export function planCameraImport(local: FavoriteLibrary, incoming: FavoriteLibrary): ImportPlan {
  const conflicts: CameraFavorite[] = []
  let skipped = 0
  const seen = new Set<string>()
  const accepted: CameraFavorite[] = []
  const localById = new Map<string, CameraFavorite>()
  const localIdsByCode = new Map<string, Set<string>>()
  for (const record of local.records) {
    if (!localById.has(record.id)) localById.set(record.id, record)
    const ids = localIdsByCode.get(record.code) ?? new Set<string>()
    ids.add(record.id)
    localIdsByCode.set(record.code, ids)
  }
  for (const record of incoming.records) {
    const localIds = localIdsByCode.get(record.code)
    if (seen.has(record.code) || (localIds && (localIds.size > 1 || !localIds.has(record.id)))) {
      skipped++
      continue
    }
    seen.add(record.code)
    const old = localById.get(record.id)
    if (old && JSON.stringify(old) === JSON.stringify(record)) {
      skipped++
      continue
    }
    if (old) conflicts.push(record)
    accepted.push(record)
  }
  return {
    base: local.records,
    baseTags: cameraFavoriteTags(local),
    incoming: { records: accepted, covers: incoming.covers, tags: cameraFavoriteTags(incoming) },
    conflicts,
    skipped
  }
}
export async function applyCameraImport(
  plan: ImportPlan,
  choices: Record<string, 'local' | 'incoming'>
): Promise<number> {
  const conflictIds = new Set(plan.conflicts.map((record) => record.id))
  return transact('readwrite', async (records, covers, tags) => {
    const [current, order] = await Promise.all([records.getAll(), tags.get('order')])
    const stable = (items: CameraFavorite[]) =>
      JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)))
    if (
      stable(current) !== stable(plan.base) ||
      JSON.stringify(cameraFavoriteTags({ records: current, tags: order ?? [] })) !==
        JSON.stringify(plan.baseTags)
    )
      throw new Error('相机参数已变化，请重新预览导入')
    let count = 0
    for (const record of plan.incoming.records) {
      if (conflictIds.has(record.id) && choices[record.id] !== 'incoming') continue
      await records.put(record)
      const cover = plan.incoming.covers.get(record.id)
      if (cover) await covers.put(cover, record.id)
      else await covers.delete(record.id)
      count++
    }
    await tags.put(
      cameraFavoriteTags({
        records: current,
        tags: [...(plan.incoming.tags ?? []), ...plan.baseTags]
      }),
      'order'
    )
    return count
  })
}

export async function clearCameraFavorites(confirmed = false): Promise<void> {
  await transact('readwrite', async (records, covers, tags) => {
    if (confirmed) markConfirmedDeletion(records.transaction, 'camera')
    await Promise.all([records.clear(), covers.clear(), tags.put([], 'order')])
  })
}

/** Delete parameter records and their covers together, preserving original photos. */
export async function deleteCameraFavorites(ids: string[], confirmed = false): Promise<void> {
  await transact('readwrite', async (records, covers) => {
    if (confirmed) markConfirmedDeletion(records.transaction, 'camera')
    for (const id of new Set(ids)) await Promise.all([records.delete(id), covers.delete(id)])
  })
}

export async function deleteCameraFavoriteTag(tag: string): Promise<void> {
  await transact('readwrite', async (records, _covers, tags) => {
    const order = await tags.get('order')
    await tags.put(
      (order ?? []).filter((value: string) => value !== tag),
      'order'
    )
    let cursor = await records.openCursor()
    while (cursor) {
      const record = cursor.value as CameraFavorite
      if (record.tag === tag)
        await records.put({ ...record, tag: '', updatedAt: new Date().toISOString() })
      cursor = await cursor.continue()
    }
  })
}
