import { homeCoverForDisplay } from '../../communityResources'
import {
  databaseRequest as homeRequest,
  runDatabaseTransaction as homeTransaction
} from '../file-system/transaction'
import {
  runStoreRequest,
  HOME_SCHEMES_STORE,
  HOME_IMAGES_STORE,
  HOME_TAGS_STORE
} from '../file-system/database'
import { markConfirmedDeletion } from '../directory-backup/changeJournal'
import { convertImageForStorage, inspectStoredImage } from '../storedImage'
import { sha256Hex } from '../sha256'
import {
  createHomeSchemeId,
  normalizeHomeSchemeRecord,
  isValidHomeSchemeTag,
  normalizeHomeSchemeTag,
  MAX_HOME_SCHEME_TAGS,
  type HomeSchemeItem,
  type HomeSchemeRecord,
  type SaveHomeSchemeInput
} from './homeSchemeTypes'

export interface HomeSchemeImage {
  id: string
  blob: Blob
  size: number
  sha256: string
  extension?: string
}
/** 新校验结果必有真实扩展名；旧数据库记录继续允许缺少该字段。 */
export interface PreparedHomeSchemeImage extends HomeSchemeImage {
  extension: string
}
export interface HomeSchemeSnapshot {
  records: HomeSchemeRecord[]
  images: Map<string, HomeSchemeImage>
  tags: string[]
}

export {
  databaseRequest as homeRequest,
  runDatabaseTransaction as homeTransaction
} from '../file-system/transaction'

export async function prepareHomeSchemeImage(
  blob: Blob,
  id: string
): Promise<PreparedHomeSchemeImage> {
  const checked = await inspectStoredImage(blob)
  return {
    id,
    blob: checked.blob,
    size: checked.bytes.byteLength,
    sha256: await sha256Hex(checked.bytes),
    extension: checked.extension
  }
}

export function normalizeHomeSchemeTags(values: unknown): string[] {
  if (!Array.isArray(values)) throw new Error('home_scheme_tags_invalid')
  const tags = [...new Set(values.map(normalizeHomeSchemeTag))]
  if (tags.length > MAX_HOME_SCHEME_TAGS || tags.some((tag) => !isValidHomeSchemeTag(tag)))
    throw new Error('home_scheme_tags_invalid')
  return tags
}

export async function readHomeSchemeSnapshot(): Promise<HomeSchemeSnapshot> {
  return homeTransaction(
    [HOME_SCHEMES_STORE, HOME_IMAGES_STORE, HOME_TAGS_STORE],
    'readonly',
    async (tx) => {
      const [rawRecords, rawImages, rawTags] = await Promise.all([
        homeRequest(tx.objectStore(HOME_SCHEMES_STORE).getAll()),
        homeRequest(tx.objectStore(HOME_IMAGES_STORE).getAll()),
        homeRequest(tx.objectStore(HOME_TAGS_STORE).get('default'))
      ])
      const records = rawRecords
        .map(normalizeHomeSchemeRecord)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const tags = normalizeHomeSchemeTags(rawTags ?? [])
      const images = new Map<string, HomeSchemeImage>(
        rawImages.map((image: HomeSchemeImage) => [image.id, image])
      )
      for (const record of records) {
        if (record.tags.some((tag) => !tags.includes(tag)))
          throw new Error('home_scheme_tag_missing')
        const image = images.get(record.id)
        if (record.image && (!image?.blob || image.blob.size !== image.size || !image.size))
          throw new Error('home_scheme_image_missing')
      }
      return { records, images, tags }
    }
  )
}

/** 列表只提供元数据，本地图片由可见卡片或编辑器按 ID 读取。 */
function displayHomeScheme(record: HomeSchemeRecord): HomeSchemeItem {
  return {
    ...record,
    imageUrl: record.image ? null : homeCoverForDisplay(record.metadata.coverImageUrl)
  }
}

/** 按需读取单张封面，保留缺图和大小校验。 */
export async function readHomeSchemeImage(id: string): Promise<Blob> {
  const image = await runStoreRequest<HomeSchemeImage | undefined>(
    HOME_IMAGES_STORE,
    'readonly',
    (store) => store.get(id)
  )
  if (!image?.blob || !image.size || image.blob.size !== image.size)
    throw new Error('home_scheme_image_missing')
  return image.blob
}

/** 列表读取不进入图片表；完整备份继续使用 readHomeSchemeSnapshot。 */
export async function readHomeSchemeLibrary(): Promise<{
  schemes: HomeSchemeItem[]
  tags: string[]
}> {
  return homeTransaction([HOME_SCHEMES_STORE, HOME_TAGS_STORE], 'readonly', async (tx) => {
    const [rawRecords, rawTags] = await Promise.all([
      homeRequest(tx.objectStore(HOME_SCHEMES_STORE).getAll()),
      homeRequest(tx.objectStore(HOME_TAGS_STORE).get('default'))
    ])
    const records = rawRecords
      .map(normalizeHomeSchemeRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const tags = normalizeHomeSchemeTags(rawTags ?? [])
    if (records.some((record) => record.tags.some((tag) => !tags.includes(tag))))
      throw new Error('home_scheme_tag_missing')
    return { schemes: records.map(displayHomeScheme), tags }
  })
}

export async function countHomeSchemes(): Promise<number> {
  return runStoreRequest(HOME_SCHEMES_STORE, 'readonly', (store) => store.count())
}

export function releaseHomeSchemeUrls(schemes: HomeSchemeItem[]): void {
  for (const scheme of schemes)
    if (scheme.image && scheme.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(scheme.imageUrl)
}

/** 在写入事务中核对编辑基线，防止旧窗口覆盖已保存的记录或标签变更。 */
export async function saveHomeScheme(input: SaveHomeSchemeInput): Promise<HomeSchemeItem> {
  const prepared =
    input.imageFile && !input.removeImage
      ? await prepareHomeSchemeImage(
          await convertImageForStorage(input.imageFile),
          input.item?.id ?? input.id ?? createHomeSchemeId()
        )
      : null
  const saved = await homeTransaction(
    [HOME_SCHEMES_STORE, HOME_IMAGES_STORE, HOME_TAGS_STORE],
    'readwrite',
    async (tx) => {
      const records = tx.objectStore(HOME_SCHEMES_STORE),
        images = tx.objectStore(HOME_IMAGES_STORE)
      const tags = normalizeHomeSchemeTags(
        (await homeRequest(tx.objectStore(HOME_TAGS_STORE).get('default'))) ?? []
      )
      const previous = input.item
        ? ((await homeRequest(records.get(input.item.id))) as HomeSchemeRecord | undefined)
        : undefined
      if (input.item && !previous) throw new Error('home_scheme_record_missing')
      if (
        input.item &&
        JSON.stringify(normalizeHomeSchemeRecord(previous)) !==
          JSON.stringify(normalizeHomeSchemeRecord(input.item))
      ) {
        throw new Error('home_scheme_record_changed')
      }
      let id = previous?.id ?? input.id ?? prepared?.id ?? createHomeSchemeId()
      if (!previous && (await homeRequest(records.get(id)))) id = createHomeSchemeId()
      const record = normalizeHomeSchemeRecord({
        version: 1,
        id,
        image: input.removeImage
          ? null
          : prepared
            ? `${id}.${prepared.extension}`
            : (previous?.image ?? null),
        code: input.code,
        name: input.name,
        schemeType: input.schemeType,
        metadata: input.metadata,
        tags: input.tags
          .map(normalizeHomeSchemeTag)
          .filter((tag) => tags.includes(tag))
          .slice(0, 1),
        note: input.note.trim(),
        createdAt: input.createdAt ?? previous?.createdAt ?? new Date().toISOString(),
        // 即使同一毫秒内只更换图片，也必须推进版本时间以识别旧编辑。
        updatedAt: previous
          ? new Date(Math.max(Date.now(), Date.parse(previous.updatedAt) + 1)).toISOString()
          : (input.updatedAt ?? new Date().toISOString())
      })
      const duplicate = (await homeRequest(records.index('code').get(record.code))) as
        HomeSchemeRecord | undefined
      if (duplicate && duplicate.id !== id) throw new Error('home_scheme_code_duplicate')
      // 名称、备注、方案码和标签变更只写记录；图片仅在更换/移除时发生 IO。
      if (
        record.image &&
        !prepared &&
        (!previous?.image || (await homeRequest(images.getKey(id))) === undefined)
      )
        throw new Error('home_scheme_image_missing')
      if (prepared) images.put({ ...prepared, id })
      else if (previous?.image && !record.image) images.delete(id)
      records.put(record)
      return { record }
    }
  )
  return displayHomeScheme(saved.record)
}

export async function deleteHomeScheme(
  item: Pick<HomeSchemeItem, 'id'>,
  confirmed = false
): Promise<void> {
  await homeTransaction([HOME_SCHEMES_STORE, HOME_IMAGES_STORE], 'readwrite', async (tx) => {
    if (confirmed) markConfirmedDeletion(tx, 'home')
    tx.objectStore(HOME_SCHEMES_STORE).delete(item.id)
    tx.objectStore(HOME_IMAGES_STORE).delete(item.id)
  })
}

export async function saveHomeSchemeTags(values: string[]): Promise<string[]> {
  const tags = normalizeHomeSchemeTags(values)
  return homeTransaction([HOME_SCHEMES_STORE, HOME_TAGS_STORE], 'readwrite', async (tx) => {
    const records = (await homeRequest(
      tx.objectStore(HOME_SCHEMES_STORE).getAll()
    )) as HomeSchemeRecord[]
    if (records.some((record) => record.tags.some((tag) => !tags.includes(tag))))
      throw new Error('home_scheme_tag_in_use')
    tx.objectStore(HOME_TAGS_STORE).put(tags, 'default')
    return tags
  })
}

/** 新增标签时读取事务中的最新列表，保留其他页面刚添加的未使用标签。 */
export async function addHomeSchemeTag(value: string): Promise<string[]> {
  return homeTransaction([HOME_TAGS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(HOME_TAGS_STORE)
    const actual = normalizeHomeSchemeTags((await homeRequest(store.get('default'))) ?? [])
    const tags = normalizeHomeSchemeTags([value, ...actual])
    store.put(tags, 'default')
    return tags
  })
}

export async function deleteHomeSchemeTag(
  removedTag: string
): Promise<{ tags: string[]; updatedCount: number; updatedRecords: HomeSchemeRecord[] }> {
  return homeTransaction([HOME_SCHEMES_STORE, HOME_TAGS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(HOME_SCHEMES_STORE)
    const [records, rawTags] = await Promise.all([
      homeRequest(store.getAll()),
      homeRequest(tx.objectStore(HOME_TAGS_STORE).get('default'))
    ])
    const tags = normalizeHomeSchemeTags(rawTags ?? []).filter((tag) => tag !== removedTag)
    const updatedRecords: HomeSchemeRecord[] = []
    for (const raw of records) {
      const record = normalizeHomeSchemeRecord(raw)
      if (!record.tags.includes(removedTag)) continue
      const updated = {
        ...record,
        tags: [],
        updatedAt: new Date(Math.max(Date.now(), Date.parse(record.updatedAt) + 1)).toISOString()
      }
      store.put(updated)
      updatedRecords.push(updated)
    }
    tx.objectStore(HOME_TAGS_STORE).put(tags, 'default')
    return { tags, updatedCount: updatedRecords.length, updatedRecords }
  })
}

export async function reorderHomeSchemeTags(
  current: string[],
  reordered: string[]
): Promise<string[]> {
  return homeTransaction([HOME_TAGS_STORE], 'readwrite', async (tx) => {
    const actual = normalizeHomeSchemeTags(
      (await homeRequest(tx.objectStore(HOME_TAGS_STORE).get('default'))) ?? []
    )
    if (
      JSON.stringify(actual) !== JSON.stringify(current) ||
      reordered.length !== actual.length ||
      new Set(reordered).size !== actual.length ||
      reordered.some((tag) => !actual.includes(tag))
    )
      throw new Error('home_scheme_tag_order_invalid')
    tx.objectStore(HOME_TAGS_STORE).put(reordered, 'default')
    return reordered
  })
}
