import resourceNetwork from './resource-network.cjs'
const { fetchResource } = resourceNetwork
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_BASE_URL =
  'https://raw.githubusercontent.com/dastrokes/gongeo.us-nikki-tracker/master'
const FILES = ['items', 'outfits', 'outfitItems', 'makeupItems', 'makeupOutfits', 'palettes']
const LOCALES = ['zh', 'en']
const SOURCE_FILE = 'catalogSource.json'
const FILTER_METADATA_FILE = 'filterMetadata.json'
const MAX_REMOVED_RATIO = 0.02

const problem = (message, code = 'GONGEO_INVALID') => Object.assign(new Error(message), { code })
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const serialize = (value) => JSON.stringify(value, null, 2) + '\n'
const sourceLabel = (value) => {
  const url = new URL(value)
  return url.origin + url.pathname
}

const parseArgs = (argv) => {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i]
    if (!name.startsWith('--')) continue
    const value = argv[i + 1]
    args[name.slice(2)] = value && !value.startsWith('--') ? ((i += 1), value) : true
  }
  return args
}

export function compareGameVersions(left, right) {
  const parse = (value) => {
    if (typeof value !== 'string' || !/^\d+(?:\.\d+){1,3}$/u.test(value)) {
      throw problem('Gongeo 游戏版本无效: ' + String(value))
    }
    const parts = value.split('.').map(Number)
    if (!parts.every(Number.isSafeInteger)) throw problem('Gongeo 游戏版本无效: ' + value)
    return parts
  }
  const a = parse(left)
  const b = parse(right)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0)
    if (difference) return Math.sign(difference)
  }
  return 0
}

async function fetchText(url, timeoutMs) {
  try {
    return await fetchResource(url, { timeoutMs, headers: { Accept: 'application/json' } })
  } catch (error) {
    const cause = error?.cause
    const detail = cause?.code ? ' [' + cause.code + ': ' + cause.message + ']' : ''
    throw problem(
      (error instanceof Error ? error.message : String(error)) + detail + ': ' + sourceLabel(url),
      'GONGEO_FETCH'
    )
  }
}

const parseJson = (text, source) => {
  try {
    return JSON.parse(text)
  } catch {
    throw problem('Gongeo JSON 无效: ' + source)
  }
}

const validateIndex = (index) => {
  if (!isObject(index) || !isObject(index.files)) throw problem('Gongeo 索引结构无效')
  compareGameVersions(index.gameVersion, index.gameVersion)
  if (typeof index.generatedAt !== 'string' || !Number.isFinite(Date.parse(index.generatedAt))) {
    throw problem('Gongeo 索引缺少有效生成时间')
  }
  for (const name of [...FILES, ...(index.files.banners ? ['banners'] : [])]) {
    const entry = index.files[name]
    if (
      !isObject(entry) ||
      typeof entry.path !== 'string' ||
      !/^\/catalog\/[\w.-]+\.json$/u.test(entry.path)
    ) {
      throw problem('Gongeo 索引缺少有效文件路径: ' + name)
    }
    if (
      typeof entry.hash !== 'string' ||
      !/^[a-f0-9]{12,64}$/u.test(entry.hash) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes <= 0
    ) {
      throw problem('Gongeo 索引缺少有效文件校验信息: ' + name)
    }
  }
}

const validId = (value) => Number.isSafeInteger(value) && value > 0
const validIds = (value) =>
  validId(value) || (Array.isArray(value) && value.length > 0 && value.every(validId))
const validate = (name, value) => {
  if (name === 'palettes') {
    if (
      !isObject(value) ||
      !Array.isArray(value.items) ||
      !value.items.length ||
      !isObject(value.palettes) ||
      !Object.keys(value.palettes).length ||
      !value.items.every((row) => Array.isArray(row) && validIds(row[0]))
    ) {
      throw problem('Gongeo palettes 结构无效')
    }
    return
  }
  if (!Array.isArray(value) || value.length === 0)
    throw problem('Gongeo ' + name + ' 目录为空或结构无效')
  if (name === 'banners') {
    if (
      value.length < 70 ||
      !value.every(
        (row) =>
          isObject(row) &&
          validId(row.bannerId) &&
          validId(row.bannerType) &&
          typeof row.name === 'string' &&
          row.name.trim() &&
          Array.isArray(row.outfit4StarId) &&
          Array.isArray(row.outfit5StarId) &&
          Array.isArray(row.runs) &&
          (row.rewardIds === undefined ||
            (Array.isArray(row.rewardIds) &&
              row.rewardIds.every((id) => /^[1-9]\d*$/u.test(String(id)) && validId(Number(id)))))
      )
    ) {
      throw problem('Gongeo banners 记录不完整')
    }
  } else if (name === 'items' || name === 'outfits') {
    if (!value.every((row) => Array.isArray(row) && validIds(row[0]) && validId(row[1]))) {
      throw problem('Gongeo ' + name + ' 记录结构无效')
    }
  } else if (
    !value.every(
      (row) =>
        Array.isArray(row) && validId(row[0]) && Array.isArray(row[1]) && row[1].every(validId)
    )
  ) {
    throw problem('Gongeo ' + name + ' 关联记录结构无效')
  }
}

/** Parse upstream banner runs, including the permanent banner's dynamic end date. */
export function parseGongeoBanners(
  source,
  bannerNames = {},
  today = new Date().toISOString().slice(0, 10)
) {
  const matches = [
    ...source.matchAll(
      /\b(\d+):\s*\{\s*bannerId:\s*(\d+),\s*bannerType:\s*(\d+),\s*outfit4StarId:\s*(\[[^\]]*\]),\s*outfit5StarId:\s*(\[[^\]]*\]),\s*runs:\s*\[([\s\S]*?)\]\s*,[\s\S]*?\n\s*\},/gu
    )
  ]
  return matches.map((match) => {
    const runs = [
      ...match[6].matchAll(
        /\{\s*version:\s*'([^']+)',\s*start:\s*'([^']+)',\s*end:\s*([^,}]+),?\s*\}/gu
      )
    ].map((run) => ({
      version: run[1],
      start: run[2],
      end: run[3].trim().startsWith('new Date()') ? today : run[3].trim().replace(/^'|'$/gu, '')
    }))
    const rewardIds = match[0].match(/\brewardIds:\s*(\[[^\]]*\])/u)?.[1]
    return {
      bannerId: Number(match[2]),
      bannerType: Number(match[3]),
      name: bannerNames['banner.' + match[2] + '.name'] ?? String(match[2]),
      outfit4StarId: JSON.parse(match[4].replace(/'/gu, '"')),
      outfit5StarId: JSON.parse(match[5].replace(/'/gu, '"')),
      ...(rewardIds ? { rewardIds: JSON.parse(rewardIds.replace(/'/gu, '"')) } : {}),
      runs
    }
  })
}

export function buildWardrobeFilterMetadata({ sources, locales, banners, items }) {
  if (
    !Array.isArray(sources) ||
    !sources.length ||
    !sources.every(
      (source) =>
        isObject(source) &&
        typeof source.key === 'string' &&
        /^[a-z0-9-]+$/u.test(source.key) &&
        typeof source.labelKey === 'string' &&
        source.labelKey.trim() &&
        Array.isArray(source.ids) &&
        source.ids.length > 0 &&
        source.ids.every(validId) &&
        new Set(source.ids).size === source.ids.length &&
        (source.outfit === undefined || typeof source.outfit === 'boolean')
    ) ||
    new Set(sources.map((source) => source.key)).size !== sources.length
  ) {
    throw problem('Gongeo 衣橱来源分组结构无效')
  }
  if (!Array.isArray(items) || !items.every((row) => Array.isArray(row) && validIds(row[0]))) {
    throw problem('Gongeo 衣橱部件索引结构无效')
  }
  if (
    !Array.isArray(banners) ||
    !banners.every(
      (banner) =>
        isObject(banner) &&
        validId(banner.bannerType) &&
        (banner.rewardIds === undefined ||
          (Array.isArray(banner.rewardIds) &&
            banner.rewardIds.every((id) => /^[1-9]\d*$/u.test(String(id)) && validId(Number(id)))))
    )
  ) {
    throw problem('Gongeo 衣橱卡池奖励结构无效')
  }
  for (const language of LOCALES) {
    if (!isObject(locales?.[language]?.misc) || !isObject(locales?.[language]?.common)) {
      throw problem('Gongeo 衣橱筛选翻译结构无效: ' + language)
    }
  }
  const translate = (language, key) => {
    const locale = locales[language]
    const value =
      locale.misc[key] ?? key.split('.').reduce((entry, part) => entry?.[part], locale.common)
    if (typeof value !== 'string' || !value.trim()) {
      throw problem('Gongeo 衣橱筛选缺少翻译: ' + language + '/' + key)
    }
    return value
  }
  const label = (key) =>
    Object.fromEntries(LOCALES.map((language) => [language, translate(language, key)]))
  const tags = Object.keys(locales.zh.misc)
    .filter((key) => /^label\.\d+\.name$/u.test(key))
    .map((key) => ({ id: Number(key.split('.')[1]), label: label(key) }))
    .sort((a, b) => a.id - b.id)
  const versions = Object.keys(locales.zh.misc)
    .filter((key) => /^version\.\d+\.(?:\d+|x)$/u.test(key))
    .map((key) => ({ value: key.slice(8), label: label(key) }))
  if (!tags.length || !versions.some(({ value }) => /^\d+\.\d+$/u.test(value))) {
    throw problem('Gongeo 衣橱标签或游戏版本为空')
  }
  const itemIds = new Set(items.flatMap((row) => row[0]).map(String))
  const deepEchoRewardIds = [
    ...new Set(
      banners
        .filter((banner) => banner.bannerType !== 1 && banner.bannerType !== 2)
        .flatMap((banner) => banner.rewardIds ?? [])
        .map(String)
        .filter((id) => itemIds.has(id))
    )
  ].sort((a, b) => Number(a) - Number(b))
  return {
    sources: sources.map((source) => ({
      key: source.key,
      label: label(source.labelKey),
      ids: source.ids,
      outfit: source.outfit !== false
    })),
    tags,
    versions,
    deepEchoRewardIds
  }
}

const validateLocale = (language, name, value) => {
  const prefix = name + '.'
  if (
    !isObject(value) ||
    !Object.values(value).every((entry) => typeof entry === 'string') ||
    !Object.entries(value).some(
      ([key, entry]) => key.startsWith(prefix) && key.endsWith('.name') && entry.trim()
    )
  ) {
    throw problem('Gongeo ' + language + '/' + name + ' 翻译为空或结构无效')
  }
}

async function readOptional(file) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function readCurrentSource(outputDir) {
  const text = await readOptional(resolve(outputDir, SOURCE_FILE))
  if (text !== null) {
    const source = parseJson(text, SOURCE_FILE)
    compareGameVersions(source.gameVersion, source.gameVersion)
    if (!Number.isFinite(Date.parse(source.generatedAt)))
      throw problem('Gongeo 本地快照生成时间无效')
    return source
  }
  // Older checkouts already document the bundled snapshot version.
  const readme = await readOptional(resolve(outputDir, 'README.md'))
  const version = readme?.match(/\bgame version\s+(\d+(?:\.\d+){1,3})/iu)?.[1]
  return version ? { gameVersion: version } : null
}

const guardVersion = (index, current) => {
  if (!current) return
  const comparison = compareGameVersions(index.gameVersion, current.gameVersion)
  if (comparison < 0) {
    throw problem(
      '远程版本 ' + index.gameVersion + ' 低于项目快照 ' + current.gameVersion,
      'GONGEO_OLD_VERSION'
    )
  }
  if (
    comparison === 0 &&
    current.generatedAt &&
    Date.parse(index.generatedAt) < Date.parse(current.generatedAt)
  ) {
    throw problem('同版本远程快照的生成时间早于项目快照', 'GONGEO_OLD_VERSION')
  }
}

const entryKeys = (relative, value) => {
  if (relative.startsWith('locales/')) return Object.keys(value)
  if (relative === FILTER_METADATA_FILE) {
    return [
      ...value.sources.map((source) => 'source.' + source.key),
      ...new Set(value.sources.flatMap((source) => source.ids.map((id) => 'obtain.' + id))),
      ...value.tags.map((tag) => 'tag.' + tag.id),
      ...value.versions.map((version) => 'version.' + version.value),
      ...value.deepEchoRewardIds.map((id) => 'deep-echo.' + id)
    ]
  }
  if (relative === 'banners.json') return value.map((row) => row.bannerId)
  if (relative === 'palettes.json') return value.items.flatMap((row) => row[0])
  if (relative === 'items.json' || relative === 'outfits.json')
    return value.flatMap((row) => row[0])
  return value.map((row) => row[0])
}

const guardExistingEntries = (relative, current, next) => {
  const newKeys = entryKeys(relative, next)
  const newIds = new Set(newKeys)
  if (newIds.size !== newKeys.length) throw problem('Gongeo ID 重复: ' + relative)
  if (!current) return
  const oldIds = new Set(entryKeys(relative, current))
  const removed = [...oldIds].filter((id) => !newIds.has(id)).length
  if (oldIds.size && removed / oldIds.size > MAX_REMOVED_RATIO) {
    throw problem(
      relative + ' 丢失 ' + removed + '/' + oldIds.size + ' 个现有条目，超过 2% 上限',
      'GONGEO_INCOMPLETE'
    )
  }
}

const writeIfChanged = async (file, content) => {
  const current = await readOptional(file)
  if (current === content || current?.replace(/\r\n/gu, '\n') === content) return false
  await mkdir(dirname(file), { recursive: true })
  const temporary = file + '.' + process.pid + '.tmp'
  try {
    await writeFile(temporary, content, 'utf8')
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
  return true
}

export async function updateGongeoCatalog(options = {}) {
  const root = String(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/u, '')
  const outputDir = options.outputDir ?? resolve('src/data/gongeo')
  const timeoutMs = Number(options.timeoutMs ?? 15000)
  if (!/^https?:\/\//u.test(root) || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw problem('Gongeo 来源地址或超时时间无效')
  }
  const indexUrl = root + '/public/catalog/index.json'
  const index = parseJson(await fetchText(indexUrl, timeoutMs), indexUrl)
  validateIndex(index)
  guardVersion(index, await readCurrentSource(outputDir))
  const entries = new Map()
  for (const name of [...FILES, ...(index.files.banners ? ['banners'] : [])]) {
    const entry = index.files[name]
    const text = await fetchText(root + '/public' + entry.path, timeoutMs)
    const hash = createHash('sha256').update(text).digest('hex')
    if (Buffer.byteLength(text, 'utf8') !== entry.bytes || !hash.startsWith(entry.hash)) {
      throw problem('Gongeo 文件校验失败: ' + name)
    }
    const value = parseJson(text, entry.path)
    validate(name, value)
    entries.set(name + '.json', value)
  }
  for (const language of LOCALES) {
    for (const name of ['item', 'outfit', 'banner']) {
      const path = 'app/locales/' + language + '/' + name + '.json'
      const value = parseJson(await fetchText(root + '/' + path, timeoutMs), path)
      validateLocale(language, name, value)
      entries.set('locales/' + language + '/' + name + '.json', value)
    }
  }
  if (!entries.has('banners.json')) {
    const source = await fetchText(root + '/data/banners.ts', timeoutMs)
    const bannerNames = entries.get('locales/zh/banner.json')
    const value = parseGongeoBanners(source, bannerNames)
    validate('banners', value)
    entries.set('banners.json', value)
  }
  const sourcePath = 'data/source.json'
  const filterSources = parseJson(await fetchText(root + '/' + sourcePath, timeoutMs), sourcePath)
  const filterLocales = {}
  for (const language of LOCALES) {
    filterLocales[language] = {}
    for (const name of ['misc', 'common']) {
      const path = 'app/locales/' + language + '/' + name + '.json'
      filterLocales[language][name] = parseJson(await fetchText(root + '/' + path, timeoutMs), path)
    }
  }
  entries.set(
    FILTER_METADATA_FILE,
    buildWardrobeFilterMetadata({
      sources: filterSources,
      locales: filterLocales,
      banners: entries.get('banners.json'),
      items: entries.get('items.json')
    })
  )
  // Every download and check completes before the first project file is written.
  for (const [relative, value] of entries) {
    const text = await readOptional(resolve(outputDir, relative))
    if (text !== null) guardExistingEntries(relative, parseJson(text, relative), value)
    else guardExistingEntries(relative, null, value)
  }
  const latestIndex = parseJson(await fetchText(indexUrl, timeoutMs), indexUrl)
  if (JSON.stringify(latestIndex) !== JSON.stringify(index)) {
    throw problem('Gongeo 索引在同步过程中发生变化，已取消写入', 'GONGEO_INCOMPLETE')
  }
  let updated = 0
  for (const [relative, value] of entries) {
    if (await writeIfChanged(resolve(outputDir, relative), serialize(value))) updated += 1
  }
  const source = {
    source: sourceLabel(root),
    gameVersion: index.gameVersion,
    generatedAt: index.generatedAt
  }
  await writeIfChanged(resolve(outputDir, SOURCE_FILE), serialize(source))
  return {
    updated,
    total: entries.size,
    version: index.gameVersion,
    generatedAt: index.generatedAt,
    source: source.source
  }
}

export function formatGongeoResult(result) {
  const status = result.updated ? '远程同步成功' : '远程检查完成，无需更新'
  return (
    'Gongeo ' +
    status +
    ': ' +
    result.updated +
    '/' +
    result.total +
    ' 个文件更新，游戏版本 ' +
    result.version +
    '，来源: ' +
    result.source
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const baseUrl = args['base-url'] ?? process.env.GONGEO_CATALOG_BASE_URL ?? DEFAULT_BASE_URL
  try {
    const result = await updateGongeoCatalog({
      baseUrl,
      outputDir: resolve(args.output ?? 'src/data/gongeo'),
      timeoutMs: Number(args.timeout ?? process.env.GONGEO_CATALOG_TIMEOUT_MS ?? 15000)
    })
    console.log(formatGongeoResult(result))
  } catch (error) {
    const status =
      error.code === 'GONGEO_OLD_VERSION'
        ? '拒绝旧版本覆盖'
        : error.code === 'GONGEO_INVALID' || error.code === 'GONGEO_INCOMPLETE'
          ? '拒绝不完整数据'
          : error.code === 'GONGEO_FETCH'
            ? '远程同步失败'
            : '同步失败'
    const keptSnapshot = [
      'GONGEO_OLD_VERSION',
      'GONGEO_INVALID',
      'GONGEO_INCOMPLETE',
      'GONGEO_FETCH'
    ].includes(error.code)
    console.warn(
      'Gongeo ' +
        status +
        (keptSnapshot ? '，保留项目现有目录' : '') +
        '（未读取旁边仓库）: ' +
        (error instanceof Error ? error.message : String(error))
    )
    if (args.strict === true) throw error
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === entryUrl)
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
