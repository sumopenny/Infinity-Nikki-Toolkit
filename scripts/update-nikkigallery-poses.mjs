import resourceNetwork from './resource-network.cjs'
const { fetchResource } = resourceNetwork
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_GALLERY_API = 'https://www.nikkigallery.vip/api/v1'
export const GALLERY_IMAGE_TEMPLATE = {
  baseUrl: 'https://nikkigallery.vip/static/img/photography/{}',
  replace: '{}'
}

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) continue
    const name = argument.slice(2)
    const value = argv[index + 1]
    if (value && !value.startsWith('--')) {
      result[name] = value
      index += 1
    } else {
      result[name] = true
    }
  }
  return result
}

/** 超时覆盖响应头及 JSON 正文读取，正文完成前不能清除中止定时器。 */
export async function fetchJson(url, timeoutMs) {
  return fetchResource(url, { timeoutMs }, (response) => response.json())
}

/** 严格校验外部动作记录，避免异常或不完整响应覆盖可用的静态目录。 */
export function buildGalleryPoseEntries(poses) {
  if (!Array.isArray(poses) || poses.length === 0)
    throw new Error('NikkiGallery 响应中缺少有效 pose 数组')
  const entries = new Map()
  for (const pose of poses) {
    const key = String(pose?.gid ?? '').trim()
    const name = typeof pose?.posename === 'string' ? pose.posename.trim() : ''
    const image = typeof pose?.filename === 'string' ? pose.filename.trim() : ''
    if (
      !/^\d+$/u.test(key) ||
      !name ||
      !image ||
      basename(image) !== image ||
      !image.toLowerCase().endsWith('.png')
    ) {
      throw new Error(`NikkiGallery 动作记录无效: ${key || 'unknown'}`)
    }
    if (entries.has(key)) throw new Error(`NikkiGallery 动作 ID 重复: ${key}`)
    entries.set(key, { key, aliases: [key], zh: name, en: name, image })
  }
  return [...entries.values()]
}

export async function readGalleryCatalog(
  apiBase = DEFAULT_GALLERY_API,
  timeoutMs = 10000,
  forceData = true
) {
  const baseUrl = String(apiBase).replace(/\/$/u, '')
  const versionPayload = await fetchJson(`${baseUrl}/clothes/version`, timeoutMs)
  const version = String(versionPayload?.version ?? '').trim()
  if (!version) throw new Error('NikkiGallery 版本响应无效')
  if (!forceData) return { version, poses: null }
  const data = await fetchJson(`${baseUrl}/clothes/all`, timeoutMs)
  return { version, poses: buildGalleryPoseEntries(data?.pose) }
}

export function mergePoseCatalog(catalog, gallery) {
  if (!catalog?.source || !catalog?.templates || !catalog?.resources)
    throw new Error('本地资源目录结构无效')
  if (!Array.isArray(gallery?.poses) || gallery.poses.length === 0)
    throw new Error('待写入的动作目录为空')
  return {
    ...catalog,
    source: { ...catalog.source, pose: gallery.version },
    templates: { ...catalog.templates, pose: GALLERY_IMAGE_TEMPLATE },
    resources: { ...catalog.resources, pose: gallery.poses }
  }
}

async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

export async function updateGalleryPoses({
  catalogPath,
  apiBase = DEFAULT_GALLERY_API,
  timeoutMs = 10000,
  force = false
}) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  const versionResult = await readGalleryCatalog(apiBase, timeoutMs, false)
  const hasUsablePoses =
    Array.isArray(catalog?.resources?.pose) &&
    catalog.resources.pose.length > 0 &&
    catalog?.templates?.pose
  if (!force && hasUsablePoses && String(catalog?.source?.pose ?? '') === versionResult.version) {
    return { updated: false, version: versionResult.version, count: catalog.resources.pose.length }
  }
  const gallery = await readGalleryCatalog(apiBase, timeoutMs, true)
  if (gallery.version !== versionResult.version)
    throw new Error('NikkiGallery 数据版本在同步过程中发生变化，请下次构建重试')
  const updatedCatalog = mergePoseCatalog(catalog, gallery)
  await writeJsonAtomic(catalogPath, updatedCatalog)
  return { updated: true, version: gallery.version, count: gallery.poses.length }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const catalogPath = resolve(process.cwd(), args.catalog ?? 'src/data/nuan5ResourceCatalog.json')
  const apiBase = args.api ?? process.env.NIKKIGALLERY_API_BASE ?? DEFAULT_GALLERY_API
  const timeoutMs = Number(args.timeout ?? process.env.NIKKIGALLERY_API_TIMEOUT_MS ?? 10000)
  try {
    const result = await updateGalleryPoses({
      catalogPath,
      apiBase,
      timeoutMs,
      force: args.force === true
    })
    console.log(
      result.updated
        ? `NikkiGallery 动作目录已更新: ${result.version} (${result.count})`
        : `NikkiGallery 动作目录已是最新版本: ${result.version} (${result.count})`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (args.strict === true) throw error
    console.warn(`NikkiGallery 动作同步失败，继续使用仓库内目录: ${message}`)
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === entryUrl) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
