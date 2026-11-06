const { fetchResource } = require('./resource-network.cjs')
// 从 gongeo.us-nikki-tracker 的中英文图鉴文案提取部件/妆容名称,刷新 src/data/itemCatalog.json
// 用法: node scripts/generate-item-catalog.cjs [gongeo仓库根目录]
// 远程构建: node scripts/generate-item-catalog.cjs --remote [--strict]
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '../src/data/itemCatalog.json')
const DEFAULT_GONGEO_RAW_BASE_URL =
  'https://raw.githubusercontent.com/dastrokes/gongeo.us-nikki-tracker/master'
const DEFAULT_TIMEOUT_MS = 15000
const SOURCE_FILES = [
  ['zh', 'item'],
  ['en', 'item'],
  ['zh', 'makeup'],
  ['en', 'makeup']
]

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

// 文案文件为扁平结构: "item.{id}.name" / "makeup.{id}.name" → 名称
const collect = (lang, kind, raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`无效的 ${lang}/${kind} 图鉴 JSON`)
  }
  const map = new Map()
  for (const [key, value] of Object.entries(raw)) {
    const prefix = `${kind}.`
    if (!key.startsWith(prefix) || !key.endsWith('.name')) continue
    const id = key.slice(prefix.length, -'.name'.length)
    const name = typeof value === 'string' ? value.trim() : ''
    if (!/^\d+$/u.test(id) || !name) continue
    map.set(id, name)
  }
  if (!map.size) throw new Error(`${lang}/${kind} 图鉴没有有效名称`)
  return map
}

const build = (zhMap, enMap) => {
  const out = {}
  const ids = [...new Set([...zhMap.keys(), ...enMap.keys()])]
  for (const id of ids) {
    const zh = zhMap.get(id) ?? enMap.get(id)
    const en = enMap.get(id) ?? zh
    if (zh) out[id] = [zh, en]
  }
  return out
}

function parseOptions(argv) {
  const options = {
    source: process.env.GONGEO_ROOT || null,
    remote: false,
    strict: false,
    baseUrl: process.env.GONGEO_CATALOG_BASE_URL || DEFAULT_GONGEO_RAW_BASE_URL,
    timeoutMs: Number(process.env.GONGEO_CATALOG_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    output: OUT
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--remote') options.remote = true
    else if (argument === '--strict') options.strict = true
    else if (argument === '--base-url') options.baseUrl = argv[++index] || options.baseUrl
    else if (argument === '--timeout')
      options.timeoutMs = Number(argv[++index] || options.timeoutMs)
    else if (argument === '--out')
      options.output = path.resolve(process.cwd(), argv[++index] || options.output)
    else if (!argument.startsWith('--') && !options.source) options.source = argument
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(`图鉴同步超时时间无效: ${options.timeoutMs}`)
  }
  if (options.source && /^https?:\/\//u.test(options.source)) {
    options.remote = true
    options.baseUrl = options.source
  }
  // 本地生成必须显式指定来源，避免依赖维护者机器上的旧目录。
  if (!options.remote && !options.source)
    throw new Error(
      '请指定 Gongeo 仓库目录或使用 --remote / Specify a Gongeo directory or --remote'
    )
  return options
}

/** 所有目录更新共用网络选择和一次直连兜底，JSON 无效时不重复请求。 */
async function fetchJson(url, timeoutMs) {
  return fetchResource(
    url,
    {
      timeoutMs,
      headers: { Accept: 'application/json', 'User-Agent': 'Infinity-Nikki-Toolkit' }
    },
    async (response) => {
      try {
        return JSON.parse(await response.text())
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        throw new Error(`图鉴接口返回的 JSON 无效: ${url}`)
      }
    }
  )
}

async function readSourceJson(options, lang, kind) {
  if (options.remote) {
    const baseUrl = options.baseUrl.replace(/\/+$/u, '')
    return fetchJson(`${baseUrl}/app/locales/${lang}/${kind}.json`, options.timeoutMs)
  }
  const root = options.source
  const file = path.join(root, 'app/locales', lang, `${kind}.json`)
  return readJson(file)
}

async function buildCatalog(options) {
  const sources = await Promise.all(
    SOURCE_FILES.map(async ([lang, kind]) => [
      lang,
      kind,
      await readSourceJson(options, lang, kind)
    ])
  )
  const maps = new Map(
    sources.map(([lang, kind, raw]) => [`${lang}/${kind}`, collect(lang, kind, raw)])
  )
  return {
    items: build(maps.get('zh/item'), maps.get('en/item')),
    makeups: build(maps.get('zh/makeup'), maps.get('en/makeup'))
  }
}

async function writeJsonAtomic(output, catalog) {
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`
  let current = null
  try {
    current = fs.readFileSync(output, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (current === serialized) return false

  fs.mkdirSync(path.dirname(output), { recursive: true })
  const temporaryPath = `${output}.${process.pid}.tmp`
  try {
    fs.writeFileSync(temporaryPath, serialized, 'utf8')
    fs.renameSync(temporaryPath, output)
    return true
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch {
      /* 清理临时文件失败不覆盖原始错误。 */
    }
    throw error
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  try {
    const catalog = await buildCatalog(options)
    const updated = await writeJsonAtomic(options.output, catalog)
    const counts = {
      items: Object.keys(catalog.items).length,
      makeups: Object.keys(catalog.makeups).length
    }
    console.log(
      updated
        ? `图鉴目录已更新: items=${counts.items}, makeups=${counts.makeups} → ${options.output}`
        : `图鉴目录已是最新版本: items=${counts.items}, makeups=${counts.makeups}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (options.remote && !options.strict && fs.existsSync(options.output)) {
      console.warn(`远程图鉴同步失败，继续使用现有目录: ${message}`)
      return
    }
    throw error
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
