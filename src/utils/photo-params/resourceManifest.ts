import catalogJson from '../../data/photo/photoResourceCatalog.json'
import { encodeImagePath, optimizedImageKitUrl, isLegacyImageUrl } from '../imagekit'

type ResourceKind = 'light' | 'filter' | 'pose'
type ImageKind = ResourceKind

interface ResourceEntry {
  key: string
  aliases: string[]
  zh: string
  en: string
  image?: string
}

interface ImageTemplate {
  baseUrl: string
  replace: string
}

interface ResourceCatalog {
  source?: { pose?: string }
  resources: Record<'light' | 'filter' | 'pose', ResourceEntry[]>
  templates: Record<'light' | 'filter' | 'pose', ImageTemplate | null>
}

const catalog = catalogJson as ResourceCatalog

export const PHOTO_ACTION_CATALOG_VERSION = String(catalog.source?.pose ?? 'unknown')

function createIndex(entries: ResourceEntry[]): Map<string, ResourceEntry> {
  const index = new Map<string, ResourceEntry>()
  for (const entry of entries) {
    index.set(entry.key, entry)
    for (const alias of entry.aliases) {
      if (!index.has(alias)) index.set(alias, entry)
    }
  }
  return index
}

const indexes: Record<ResourceKind, Map<string, ResourceEntry>> = {
  light: createIndex(catalog.resources.light),
  filter: createIndex(catalog.resources.filter),
  pose: createIndex(catalog.resources.pose)
}

function isEmptyResource(id: string): boolean {
  return id.length === 0 || id === 'None' || id === '0' || id === 'null'
}

function findEntry(kind: ResourceKind, id: string | number): ResourceEntry | undefined {
  const key = String(id)
  if (isEmptyResource(key)) return undefined
  return indexes[kind].get(key)
}

/** 返回资源目录中的名称；未知 ID 显示原始值。 */
export function resourceName(
  kind: ResourceKind,
  id: string | number,
  language: 'zh' | 'en'
): string {
  const key = String(id)
  if (language === 'zh' && isEmptyResource(key)) return '无'
  if (language === 'en' && isEmptyResource(key)) return 'None'
  const entry = findEntry(kind, id)
  const translated = entry?.[language]
  if (translated) return translated
  return key
}

/** All resource kinds use explicit game filenames; missing images make no request. */
export function resourceImage(kind: ImageKind, id: string | number): string | undefined {
  const entry = findEntry(kind, id)
  const template = catalog.templates[kind]
  if (!entry || !template || !template.replace) return undefined
  const imageValue = entry.image
  if (!imageValue) return undefined
  return optimizedImageKitUrl(
    template.baseUrl.replaceAll(template.replace, encodeImagePath(imageValue))
  )
}

export function resolveResourceImage(group: {
  kind: ResourceKind
  id?: string
  imageUrl?: string
}): string | undefined {
  if (!group.imageUrl || isLegacyImageUrl(group.imageUrl))
    return group.id ? resourceImage(group.kind, group.id) : undefined
  return optimizedImageKitUrl(group.imageUrl)
}
