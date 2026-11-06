import resourceNetwork from './resource-network.cjs'
const { fetchResource } = resourceNetwork
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildMappedEntries,
  categoryTranslations,
  decodeMessagePack,
  decodeNuan5Database,
  decryptNuan5File,
  resolveHotUpdateFiles
} from './generate-nuan5-resource-catalog.mjs'

export const DEFAULT_MANIFEST_URL =
  'https://raw.githubusercontent.com/RanAxro/nikki_albums/main/app_api/hot_update.json'

async function download(url, timeoutMs) {
  return fetchResource(url, { timeoutMs }, async (response) =>
    Buffer.from(await response.arrayBuffer())
  )
}

function manifestFiles(manifest) {
  if (!Array.isArray(manifest)) throw new Error('暖暖热更新清单结构无效')
  const files = [
    resolveHotUpdateFiles(manifest, 'nuan5_database', 'zh-CN'),
    resolveHotUpdateFiles(manifest, 'infinity_nikki', 'zh-CN'),
    resolveHotUpdateFiles(manifest, 'infinity_nikki', 'en-US')
  ]
  for (const file of files) {
    if (
      typeof file.versionId !== 'string' ||
      !file.versionId.trim() ||
      typeof file.source !== 'string' ||
      !/^https?:\/\//u.test(file.source)
    ) {
      throw new Error('暖暖热更新清单缺少有效版本号或下载地址')
    }
  }
  return files
}

function usableCategory(catalog, kind) {
  const entries = catalog?.resources?.[kind]
  const template = catalog?.templates?.[kind]
  return (
    Array.isArray(entries) &&
    entries.length > 0 &&
    entries.every(
      (entry) =>
        entry &&
        typeof entry.key === 'string' &&
        entry.key &&
        Array.isArray(entry.aliases) &&
        entry.aliases.length > 0 &&
        typeof entry.zh === 'string' &&
        typeof entry.en === 'string'
    ) &&
    typeof template?.baseUrl === 'string' &&
    /^https?:\/\//u.test(template.baseUrl) &&
    typeof template.replace === 'string' &&
    template.replace.length > 0
  )
}

/** 仅同步灯光、滤镜及图片模板；独立记录灯光和滤镜版本。 */
export async function updateLightFilters({
  catalogPath = resolve('src/data/nuan5ResourceCatalog.json'),
  manifestUrl = DEFAULT_MANIFEST_URL,
  timeoutMs = 15000,
  force = false
} = {}) {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  if (!catalog?.source || !catalog?.resources || !catalog?.templates)
    throw new Error('本地资源目录结构无效')
  const manifest = JSON.parse((await download(manifestUrl, timeoutMs)).toString('utf8'))
  const files = manifestFiles(manifest)
  const versions = {
    database: files[0].versionId,
    language: { zh: files[1].versionId, en: files[2].versionId }
  }
  const current = catalog.source.lightFilter ?? catalog.source
  if (
    !force &&
    usableCategory(catalog, 'light') &&
    usableCategory(catalog, 'filter') &&
    current.database === versions.database &&
    current.language?.zh === versions.language.zh &&
    current.language?.en === versions.language.en
  ) {
    return {
      updated: false,
      light: catalog.resources.light.length,
      filter: catalog.resources.filter.length
    }
  }
  const buffers = await Promise.all(files.map((file) => download(file.source, timeoutMs)))
  const database = decodeNuan5Database(decryptNuan5File(buffers[0]))
  const zh = decodeMessagePack(decryptNuan5File(buffers[1]))
  const en = decodeMessagePack(decryptNuan5File(buffers[2]))
  const updatedCatalog = {
    ...catalog,
    source: { ...catalog.source, lightFilter: versions },
    templates: {
      ...catalog.templates,
      light: database.network.light,
      filter: database.network.filter
    },
    resources: { ...catalog.resources }
  }
  for (const kind of ['light', 'filter']) {
    const namesZh = categoryTranslations(zh, kind)
    const namesEn = categoryTranslations(en, kind)
    // 少量无名称的特殊灯光允许保留；整类翻译缺失则拒绝覆盖可用快照。
    if (!Object.keys(namesZh).length || !Object.keys(namesEn).length)
      throw new Error(`暖暖 ${kind} 双语名称为空`)
    updatedCatalog.resources[kind] = buildMappedEntries(database[kind], namesZh, namesEn)
    // 移除前端旧映射后，拒绝丢失现有有效 ID 或中文名称的更新。
    const nextEntries = updatedCatalog.resources[kind]
    for (const previous of catalog.resources[kind]) {
      if (!previous.zh) continue
      for (const alias of previous.aliases) {
        if (['None', '0', 'null'].includes(alias)) continue
        if (!nextEntries.some((entry) => entry.aliases.includes(alias) && entry.zh)) {
          throw new Error('Missing existing ' + kind + ' resource: ' + alias)
        }
      }
    }
    if (
      !usableCategory(updatedCatalog, kind) ||
      !updatedCatalog.resources[kind].some((entry) => entry.zh && entry.en)
    )
      throw new Error(`暖暖 ${kind} 目录或图片模板无效`)
  }
  // 下载期间上游可能切换数据库与语言包；再次确认版本，避免写入混合快照。
  const latestFiles = manifestFiles(
    JSON.parse((await download(manifestUrl, timeoutMs)).toString('utf8'))
  )
  if (
    files.some(
      (file, index) =>
        file.versionId !== latestFiles[index].versionId || file.source !== latestFiles[index].source
    )
  ) {
    throw new Error('暖暖资源版本在同步过程中发生变化，请下次重试')
  }
  const content = `${JSON.stringify(updatedCatalog, null, 2)}\n`
  const updated = content !== `${JSON.stringify(catalog, null, 2)}\n`
  if (updated) {
    const temporary = `${catalogPath}.${process.pid}.tmp`
    try {
      await writeFile(temporary, content, 'utf8')
      await rename(temporary, catalogPath)
    } finally {
      await rm(temporary, { force: true })
    }
  }
  return {
    updated,
    light: updatedCatalog.resources.light.length,
    filter: updatedCatalog.resources.filter.length
  }
}

async function main() {
  const args = process.argv.slice(2)
  const option = (name) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : undefined
  }
  try {
    const result = await updateLightFilters({
      catalogPath: resolve(option('--catalog') ?? 'src/data/nuan5ResourceCatalog.json'),
      manifestUrl:
        option('--manifest') ?? process.env.NUAN5_HOT_UPDATE_MANIFEST ?? DEFAULT_MANIFEST_URL,
      timeoutMs: Number(option('--timeout') ?? process.env.NUAN5_HOT_UPDATE_TIMEOUT_MS ?? 15000),
      force: args.includes('--force')
    })
    console.log(
      `灯光/滤镜目录${result.updated ? '已更新' : '已是最新版本'}: light=${result.light}, filter=${result.filter}`
    )
  } catch (error) {
    if (args.includes('--strict')) throw error
    console.warn(
      `灯光/滤镜同步失败，继续使用现有目录: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === entryUrl)
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
