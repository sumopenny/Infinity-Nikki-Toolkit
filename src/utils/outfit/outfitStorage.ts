import {
  databaseRequest as outfitRequest,
  runDatabaseTransaction as outfitTransaction
} from '../file-system/transaction'
import {
  runStoreRequest,
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  OUTFIT_TAGS_STORE,
  OUTFIT_IGNORED_CODES_STORE
} from '../file-system/database'
import { convertImageForStorage, inspectStoredImage } from '../storedImage'
import { displayOutfit } from './outfitImageLoader'
import { sha256Hex } from '../sha256'
import {
  createOutfitId,
  DEFAULT_OUTFIT_TAGS,
  DuplicateOutfitCodeError,
  normalizeOutfitCode,
  normalizeOutfitRecord,
  normalizeOutfitTagList,
  type OutfitRecord,
  type OutfitItem,
  type SaveOutfitInput,
  type OutfitDeleteResult
} from './outfitTypes'

export interface OutfitImage {
  id: string
  blob: Blob
  size: number
  sha256: string
  extension?: string
}
/** 新校验结果必有真实扩展名；旧数据库记录继续允许缺少该字段。 */
export interface PreparedOutfitImage extends OutfitImage {
  extension: string
}
export interface OutfitSnapshot {
  records: OutfitRecord[]
  images: Map<string, OutfitImage>
  tags: string[]
  ignoredCodes: string[]
}
export {
  databaseRequest as outfitRequest,
  runDatabaseTransaction as outfitTransaction
} from '../file-system/transaction'
export async function hashOutfitBlob(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer())
}
export async function prepareOutfitImage(
  blob: Blob,
  id: string,
  decode = true
): Promise<PreparedOutfitImage> {
  const checked = await inspectStoredImage(blob, decode)
  return {
    id,
    blob: checked.blob,
    size: checked.bytes.byteLength,
    sha256: await sha256Hex(checked.bytes),
    extension: checked.extension
  }
}

/** 搭配上传复用通用的 WebP 优先与原图兜底策略。 */
export async function prepareOutfitUpload(file: File, id: string): Promise<PreparedOutfitImage> {
  return prepareOutfitImage(await convertImageForStorage(file), id, false)
}

export async function initializeOutfitTags(): Promise<void> {
  await outfitTransaction([OUTFIT_TAGS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(OUTFIT_TAGS_STORE)
    if ((await outfitRequest(store.get('default'))) === undefined)
      store.put([...DEFAULT_OUTFIT_TAGS], 'default')
  })
}
export async function readOutfitImage(id: string): Promise<Blob> {
  const image = await runStoreRequest<OutfitImage | undefined>(
    OUTFIT_IMAGES_STORE,
    'readonly',
    (store) => store.get(id)
  )
  if (!image?.blob || !image.size || image.blob.size !== image.size)
    throw new Error('outfit_image_missing')
  return image.blob
}
export async function readOutfitRecords(): Promise<{
  records: OutfitRecord[]
  tags: string[]
  sizes: Map<string, number>
  unreadableCount: number
}> {
  await initializeOutfitTags()
  return outfitTransaction(
    [OUTFITS_STORE, OUTFIT_IMAGES_STORE, OUTFIT_TAGS_STORE],
    'readonly',
    async (tx) => {
      const [rawRecords, rawTags, imageKeys] = await Promise.all([
        outfitRequest(tx.objectStore(OUTFITS_STORE).getAll()),
        outfitRequest(tx.objectStore(OUTFIT_TAGS_STORE).get('default')),
        outfitRequest(tx.objectStore(OUTFIT_IMAGES_STORE).getAllKeys())
      ])
      const records: OutfitRecord[] = []
      const tags = normalizeOutfitTagList(rawTags)
      const sizes = new Map<string, number>()
      const availableImages = new Set(imageKeys)
      for (const raw of rawRecords) {
        let record: OutfitRecord
        try {
          record = normalizeOutfitRecord(raw)
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('outfit_')) continue
          throw error
        }
        if (record.tags.some((tag) => !tags.includes(tag))) continue
        if (record.image && !availableImages.has(record.id)) continue
        records.push(record)
        sizes.set(record.id, record.imageSize ?? 0)
      }
      records.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      return { records, tags, sizes, unreadableCount: rawRecords.length - records.length }
    }
  )
}
export async function readOutfitCollection(): Promise<{ outfits: OutfitItem[]; tags: string[]; unreadableCount: number }> {
  const { records, tags, sizes, unreadableCount } = await readOutfitRecords()
  return {
    outfits: records.map((record) =>
      displayOutfit(record, sizes.get(record.id)!, () => readOutfitImage(record.id))
    ),
    tags,
    unreadableCount
  }
}
export async function readOutfitSnapshot(): Promise<OutfitSnapshot> {
  await initializeOutfitTags()
  return outfitTransaction(
    [OUTFITS_STORE, OUTFIT_IMAGES_STORE, OUTFIT_TAGS_STORE, OUTFIT_IGNORED_CODES_STORE],
    'readonly',
    async (tx) => {
      const [raw, images, tags, ignored] = await Promise.all([
        outfitRequest(tx.objectStore(OUTFITS_STORE).getAll()),
        outfitRequest(tx.objectStore(OUTFIT_IMAGES_STORE).getAll()),
        outfitRequest(tx.objectStore(OUTFIT_TAGS_STORE).get('default')),
        outfitRequest(tx.objectStore(OUTFIT_IGNORED_CODES_STORE).getAllKeys())
      ])
      const records = raw
        .map(normalizeOutfitRecord)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      const imageMap = new Map<string, OutfitImage>(
        images.map((image: OutfitImage) => [image.id, image])
      )
      const normalizedTags = normalizeOutfitTagList(tags)
      for (const record of records) {
        const image = imageMap.get(record.id)
        if (record.image && (!image?.blob || !image.size || image.size !== image.blob.size))
          throw new Error('outfit_image_missing')
        if (record.tags.some((tag) => !normalizedTags.includes(tag)))
          throw new Error('outfit_tag_missing')
      }
      return { records, images: imageMap, tags: normalizedTags, ignoredCodes: ignored.map(String) }
    }
  )
}
export async function saveOutfit(input: SaveOutfitInput): Promise<OutfitItem> {
  const code = normalizeOutfitCode(input.code)
  if (!input.outfit?.image && !input.imageFile && !code) throw new Error('outfit_image_required')
  const prepared = input.imageFile
    ? await prepareOutfitUpload(input.imageFile, input.outfit?.id ?? createOutfitId())
    : null
  await initializeOutfitTags()
  const saved = await outfitTransaction(
    [OUTFITS_STORE, OUTFIT_IMAGES_STORE, OUTFIT_TAGS_STORE, OUTFIT_IGNORED_CODES_STORE],
    'readwrite',
    async (tx) => {
      const records = tx.objectStore(OUTFITS_STORE),
        images = tx.objectStore(OUTFIT_IMAGES_STORE)
      const previous = input.outfit
        ? ((await outfitRequest(records.get(input.outfit.id))) as OutfitRecord | undefined)
        : undefined
      if (
        input.outfit &&
        (!previous ||
          JSON.stringify(normalizeOutfitRecord(previous)) !==
            JSON.stringify(normalizeOutfitRecord(input.outfit)))
      )
        throw new Error('outfit_record_changed')
      const id = previous?.id ?? prepared?.id ?? createOutfitId()
      const duplicate = code
        ? ((await outfitRequest(records.index('code').get(code))) as OutfitRecord | undefined)
        : undefined
      if (duplicate && duplicate.id !== id) throw new DuplicateOutfitCodeError()
      const tags = normalizeOutfitTagList(
        await outfitRequest(tx.objectStore(OUTFIT_TAGS_STORE).get('default'))
      )
      const tag = input.tag?.trim()
      if (tag && !tags.includes(tag)) throw new Error('outfit_tag_missing')
      const record = normalizeOutfitRecord({
        ...previous,
        version: 1,
        id,
        image: prepared ? `${id}.${prepared.extension}` : (previous?.image ?? ''),
        imageSize: prepared?.size ?? previous?.imageSize,
        code,
        tags: tag ? [tag] : [],
        note: input.note?.trim() ?? '',
        createdAt: previous?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      const image = prepared
        ? { ...prepared, id }
        : ((await outfitRequest(images.get(id))) as OutfitImage | undefined)
      if (record.image && (!image?.blob || image.size !== image.blob.size))
        throw new Error('outfit_image_missing')
      records.put(record)
      if (prepared) images.put(image)
      if (code) tx.objectStore(OUTFIT_IGNORED_CODES_STORE).delete(code)
      return { record, size: image?.size ?? 0 }
    }
  )
  return displayOutfit(saved.record, saved.size, () => readOutfitImage(saved.record.id))
}
export async function saveOutfitTags(values: string[], expected?: string[]): Promise<string[]> {
  const tags = normalizeOutfitTagList(values)
  return outfitTransaction([OUTFITS_STORE, OUTFIT_TAGS_STORE], 'readwrite', async (tx) => {
    if (
      expected &&
      JSON.stringify(await outfitRequest(tx.objectStore(OUTFIT_TAGS_STORE).get('default'))) !==
        JSON.stringify(expected)
    )
      throw new Error('outfit_tags_changed')
    const records = (await outfitRequest(tx.objectStore(OUTFITS_STORE).getAll())) as OutfitRecord[]
    if (records.some((record) => record.tags.some((tag) => !tags.includes(tag))))
      throw new Error('outfit_tag_in_use')
    tx.objectStore(OUTFIT_TAGS_STORE).put(tags, 'default')
    return tags
  })
}
export async function deleteOutfitTag(
  removedTag: string
): Promise<{ tags: string[]; updatedCount: number }> {
  return outfitTransaction([OUTFITS_STORE, OUTFIT_TAGS_STORE], 'readwrite', async (tx) => {
    const store = tx.objectStore(OUTFITS_STORE)
    const [records, rawTags] = await Promise.all([
      outfitRequest(store.getAll()),
      outfitRequest(tx.objectStore(OUTFIT_TAGS_STORE).get('default'))
    ])
    const tags = normalizeOutfitTagList(rawTags).filter((tag) => tag !== removedTag)
    let updatedCount = 0
    for (const raw of records) {
      const record = normalizeOutfitRecord(raw)
      if (!record.tags.includes(removedTag)) continue
      store.put({ ...record, tags: [], updatedAt: new Date().toISOString() })
      updatedCount++
    }
    tx.objectStore(OUTFIT_TAGS_STORE).put(tags, 'default')
    return { tags, updatedCount }
  })
}
export async function deleteOutfits(outfits: OutfitItem[]): Promise<OutfitDeleteResult> {
  return outfitTransaction(
    [OUTFITS_STORE, OUTFIT_IMAGES_STORE, OUTFIT_IGNORED_CODES_STORE],
    'readwrite',
    async (tx) => {
      const records = tx.objectStore(OUTFITS_STORE),
        deleted: OutfitItem[] = [],
        failedNames: string[] = []
      for (const item of outfits) {
        const current = (await outfitRequest(records.get(item.id))) as OutfitRecord | undefined
        if (
          !current ||
          JSON.stringify(normalizeOutfitRecord(current)) !==
            JSON.stringify(normalizeOutfitRecord(item))
        ) {
          failedNames.push(item.code || item.name)
          continue
        }
        records.delete(item.id)
        tx.objectStore(OUTFIT_IMAGES_STORE).delete(item.id)
        if (current.code)
          tx.objectStore(OUTFIT_IGNORED_CODES_STORE).put({
            code: current.code,
            deletedAt: new Date().toISOString()
          })
        deleted.push(item)
      }
      return { deleted, failedNames }
    }
  )
}
export async function deleteOutfit(item: OutfitItem): Promise<void> {
  const result = await deleteOutfits([item])
  if (result.failedNames.length) throw new Error('outfit_record_changed')
}

let pending: Promise<unknown> = Promise.resolve()
export function withOutfitImportLock<T>(action: () => Promise<T>): Promise<T> {
  const run = () =>
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('infinity-nikki-outfit-import', action)
      : action()
  const next = pending.then(run, run)
  pending = next.catch(() => undefined)
  return next
}
