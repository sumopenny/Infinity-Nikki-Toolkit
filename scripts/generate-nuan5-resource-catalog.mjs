import resourceNetwork from './resource-network.cjs'
const { fetchResource } = resourceNetwork
import { createDecipheriv, hkdfSync } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  DEFAULT_GALLERY_API,
  GALLERY_IMAGE_TEMPLATE,
  readGalleryCatalog
} from './update-nikkigallery-poses.mjs'

const DEFAULT_MANIFEST_PATH = resolve(process.cwd(), '../nikki_albums/app_api/hot_update.json')
const DATABASE_KEY = Buffer.from('9C46C6BF431F5AFFF97A2002AEDFA8B7', 'utf8')
const HKDF_INFO = Buffer.from('aes-gcm-filebox', 'utf8')

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

function sourceToPathOrUrl(source) {
  if (!source) return null
  if (/^https?:\/\//u.test(source)) return source
  return isAbsolute(source) ? source : resolve(process.cwd(), source)
}

async function readSource(source) {
  const normalized = sourceToPathOrUrl(source)
  if (!normalized) throw new Error('缺少资源输入路径或 URL')
  if (/^https?:\/\//u.test(normalized)) {
    return fetchResource(normalized, {}, async (response) =>
      Buffer.from(await response.arrayBuffer())
    )
  }
  return readFile(normalized)
}

async function readJsonSource(source) {
  return JSON.parse((await readSource(source)).toString('utf8'))
}

/** 解密上游共用的带盐值、随机数和认证标签的资源文件。 */
export function decryptNuan5File(encrypted) {
  if (encrypted.length < 16 + 12 + 16) throw new Error('暖暖资源文件长度无效')
  const salt = encrypted.subarray(0, 16)
  const nonce = encrypted.subarray(16, 28)
  const payload = encrypted.subarray(28)
  const authTag = payload.subarray(payload.length - 16)
  const ciphertext = payload.subarray(0, payload.length - 16)
  const key = Buffer.from(hkdfSync('sha256', DATABASE_KEY, salt, HKDF_INFO, 32))
  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

function readVarint(bytes, state) {
  let value = 0
  let shift = 0
  while (state.offset < bytes.length) {
    const part = bytes[state.offset++]
    value += (part & 0x7f) * 2 ** shift
    if ((part & 0x80) === 0) return value
    shift += 7
    if (shift > 49) throw new Error('protobuf varint 超出安全整数范围')
  }
  throw new Error('protobuf varint 截断')
}

function readProtoFields(input) {
  const bytes = Buffer.from(input)
  const state = { offset: 0 }
  const fields = []
  while (state.offset < bytes.length) {
    const tag = readVarint(bytes, state)
    const field = Math.floor(tag / 8)
    const wire = tag & 7
    if (field <= 0) throw new Error('protobuf 字段编号无效')
    if (wire === 0) {
      fields.push({ field, wire, value: readVarint(bytes, state) })
    } else if (wire === 1) {
      if (state.offset + 8 > bytes.length) throw new Error('protobuf fixed64 截断')
      fields.push({ field, wire, value: bytes.subarray(state.offset, state.offset + 8) })
      state.offset += 8
    } else if (wire === 2) {
      const length = readVarint(bytes, state)
      if (state.offset + length > bytes.length)
        throw new Error('protobuf length-delimited 字段截断')
      fields.push({ field, wire, value: bytes.subarray(state.offset, state.offset + length) })
      state.offset += length
    } else if (wire === 5) {
      if (state.offset + 4 > bytes.length) throw new Error('protobuf fixed32 截断')
      fields.push({ field, wire, value: bytes.subarray(state.offset, state.offset + 4) })
      state.offset += 4
    } else {
      throw new Error(`暂不支持 protobuf wire type ${wire}`)
    }
  }
  return fields
}

function firstField(fields, field, wire) {
  return fields.find((item) => item.field === field && (wire == null || item.wire === wire))
}

function stringField(fields, field) {
  const item = firstField(fields, field, 2)
  return item ? Buffer.from(item.value).toString('utf8') : ''
}

function numberField(fields, field) {
  return firstField(fields, field, 0)?.value
}

function decodeMapEntry(buffer, decodeValue) {
  const fields = readProtoFields(buffer)
  const key = numberField(fields, 1)
  const value = firstField(fields, 2, 2)
  if (key == null || !value) return null
  return [String(key), decodeValue(value.value)]
}

function decodeNetworkImageItem(buffer) {
  const fields = readProtoFields(buffer)
  const baseUrl = stringField(fields, 1)
  const replace = stringField(fields, 2)
  return baseUrl && replace ? { baseUrl, replace } : null
}

/** 从 protobuf 数据库提取灯光、滤镜及图片模板。 */
export function decodeNuan5Database(buffer) {
  const fields = readProtoFields(buffer)
  const decodeLight = (value) => {
    const nested = readProtoFields(value)
    return { stringId: stringField(nested, 1), paramId: stringField(nested, 2) }
  }
  const decodeFilter = decodeLight
  const light = {}
  const filter = {}
  for (const field of fields) {
    if (field.wire !== 2) continue
    if (field.field === 1) {
      const entry = decodeMapEntry(field.value, decodeLight)
      if (entry) light[entry[0]] = entry[1]
    } else if (field.field === 3) {
      const entry = decodeMapEntry(field.value, decodeFilter)
      if (entry) filter[entry[0]] = entry[1]
    }
  }
  const networkField = firstField(fields, 20001, 2)
  const network = { light: null, filter: null }
  if (networkField) {
    for (const field of readProtoFields(networkField.value)) {
      if (field.wire !== 2) continue
      const kind = field.field === 1 ? 'light' : field.field === 2 ? 'filter' : null
      if (kind) network[kind] = decodeNetworkImageItem(field.value)
    }
  }
  return { light, filter, network }
}

class MessagePackReader {
  constructor(buffer) {
    this.buffer = Buffer.from(buffer)
    this.offset = 0
  }

  byte() {
    if (this.offset >= this.buffer.length) throw new Error('MessagePack 数据截断')
    return this.buffer[this.offset++]
  }

  bytes(length) {
    if (this.offset + length > this.buffer.length) throw new Error('MessagePack 字段截断')
    const result = this.buffer.subarray(this.offset, this.offset + length)
    this.offset += length
    return result
  }

  string(length) {
    return this.bytes(length).toString('utf8')
  }

  value() {
    const marker = this.byte()
    if (marker <= 0x7f) return marker
    if (marker >= 0xe0) return marker - 0x100
    if (marker >= 0xa0 && marker <= 0xbf) return this.string(marker & 0x1f)
    if (marker >= 0x90 && marker <= 0x9f) return this.array(marker & 0x0f)
    if (marker >= 0x80 && marker <= 0x8f) return this.map(marker & 0x0f)
    if (marker === 0xc0) return null
    if (marker === 0xc2) return false
    if (marker === 0xc3) return true
    if (marker === 0xca) return this.bytes(4).readFloatBE(0)
    if (marker === 0xcb) return this.bytes(8).readDoubleBE(0)
    if (marker === 0xcc) return this.byte()
    if (marker === 0xcd) return this.bytes(2).readUInt16BE(0)
    if (marker === 0xce) return this.bytes(4).readUInt32BE(0)
    if (marker === 0xcf) return Number(this.bytes(8).readBigUInt64BE(0))
    if (marker === 0xd0) return this.bytes(1).readInt8(0)
    if (marker === 0xd1) return this.bytes(2).readInt16BE(0)
    if (marker === 0xd2) return this.bytes(4).readInt32BE(0)
    if (marker === 0xd3) return Number(this.bytes(8).readBigInt64BE(0))
    if (marker === 0xc4) return this.bytes(this.byte())
    if (marker === 0xc5) return this.bytes(this.bytes(2).readUInt16BE(0))
    if (marker === 0xc6) return this.bytes(this.bytes(4).readUInt32BE(0))
    if (marker === 0xd9) return this.string(this.byte())
    if (marker === 0xda) return this.string(this.bytes(2).readUInt16BE(0))
    if (marker === 0xdb) return this.string(this.bytes(4).readUInt32BE(0))
    if (marker === 0xdc) return this.array(this.bytes(2).readUInt16BE(0))
    if (marker === 0xdd) return this.array(this.bytes(4).readUInt32BE(0))
    if (marker === 0xde) return this.map(this.bytes(2).readUInt16BE(0))
    if (marker === 0xdf) return this.map(this.bytes(4).readUInt32BE(0))
    if (marker >= 0xd4 && marker <= 0xd8) {
      const lengths = [1, 2, 4, 8, 16]
      this.byte()
      return this.bytes(lengths[marker - 0xd4])
    }
    if (marker === 0xc7 || marker === 0xc8 || marker === 0xc9) {
      const length =
        marker === 0xc7
          ? this.byte()
          : marker === 0xc8
            ? this.bytes(2).readUInt16BE(0)
            : this.bytes(4).readUInt32BE(0)
      this.byte()
      // 扩展长度只包含 payload，不包含上面已读取的类型字节。
      return this.bytes(length)
    }
    throw new Error(`不支持 MessagePack 标记 0x${marker.toString(16)}`)
  }

  array(length) {
    return Array.from({ length }, () => this.value())
  }

  map(length) {
    const result = {}
    for (let index = 0; index < length; index += 1) {
      const key = this.value()
      result[String(key)] = this.value()
    }
    return result
  }
}

/** 解析解密后的 MessagePack 语言包。 */
export function decodeMessagePack(buffer) {
  return new MessagePackReader(buffer).value()
}

function getNestedValue(root, key) {
  const value = root && typeof root === 'object' ? root[key] : undefined
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/** 提取指定资源类别的有效名称映射。 */
export function categoryTranslations(decoded, category) {
  const root = getNestedValue(decoded, 'infinity_nikki')
  const value = getNestedValue(root, category)
  return Object.fromEntries(Object.entries(value).filter(([, name]) => typeof name === 'string'))
}

function translationValue(translations, aliases) {
  for (const alias of aliases) {
    const value = translations[String(alias)]
    if (value) return value
  }
  return ''
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && String(value) !== '').map(String))]
}

/** 保留内部 ID 和参数 ID 别名，组装双语资源条目。 */
export function buildMappedEntries(map, zh, en) {
  return Object.entries(map).map(([key, value]) => {
    const aliases = unique([key, value.paramId, value.stringId])
    return {
      key,
      aliases,
      zh: translationValue(zh, aliases),
      en: translationValue(en, aliases)
    }
  })
}

/** 根据资源类别和语言定位热更新文件及版本。 */
export function resolveHotUpdateFiles(manifest, id, language) {
  const item = manifest.find((entry) => entry.id === id)
  if (!item) throw new Error(`hot_update.json 中缺少 ${id}`)
  const file = item.files.find(
    (entry) => entry.path === (id === 'nuan5_database' ? 'v1.db' : `${language}.bin`)
  )
  if (!file) throw new Error(`hot_update.json 中缺少 ${id}/${language}`)
  return { versionId: item.versionId, source: file.downloadLink }
}

function templateValue(value) {
  return value ? { baseUrl: value.baseUrl, replace: value.replace } : null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifestSource =
    args.manifest ??
    process.env.NUAN5_HOT_UPDATE_MANIFEST ??
    (existsSync(DEFAULT_MANIFEST_PATH) ? DEFAULT_MANIFEST_PATH : null)
  if (!manifestSource) throw new Error('找不到 hot_update.json，请使用 --manifest 指定路径或 URL')
  const manifest = await readJsonSource(manifestSource)
  const databaseFile = resolveHotUpdateFiles(manifest, 'nuan5_database', 'zh-CN')
  const zhFile = resolveHotUpdateFiles(manifest, 'infinity_nikki', 'zh-CN')
  const enFile = resolveHotUpdateFiles(manifest, 'infinity_nikki', 'en-US')
  const [databaseBytes, zhBytes, enBytes, gallery] = await Promise.all([
    args.db ? readSource(args.db) : readSource(databaseFile.source),
    args.zh ? readSource(args.zh) : readSource(zhFile.source),
    args.en ? readSource(args.en) : readSource(enFile.source),
    readGalleryCatalog(args.galleryApi ?? DEFAULT_GALLERY_API)
  ])
  const database = decodeNuan5Database(decryptNuan5File(databaseBytes))
  const zh = decodeMessagePack(decryptNuan5File(zhBytes))
  const en = decodeMessagePack(decryptNuan5File(enBytes))
  const catalog = {
    schemaVersion: 2,
    source: {
      database: databaseFile.versionId,
      language: { zh: zhFile.versionId, en: enFile.versionId },
      pose: gallery.version
    },
    templates: {
      light: templateValue(database.network.light),
      filter: templateValue(database.network.filter),
      pose: GALLERY_IMAGE_TEMPLATE
    },
    resources: {
      light: buildMappedEntries(
        database.light,
        categoryTranslations(zh, 'light'),
        categoryTranslations(en, 'light')
      ),
      filter: buildMappedEntries(
        database.filter,
        categoryTranslations(zh, 'filter'),
        categoryTranslations(en, 'filter')
      ),
      pose: gallery.poses
    }
  }
  const output = args.out
    ? resolve(process.cwd(), args.out)
    : resolve(process.cwd(), 'src/data/nuan5ResourceCatalog.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  const counts = Object.fromEntries(
    Object.entries(catalog.resources).map(([kind, entries]) => [kind, entries.length])
  )
  console.log(`已生成 ${output}`)
  console.log(JSON.stringify({ source: catalog.source, counts }, null, 2))
}

// 导入解析函数时不执行全量生成，供灯光和滤镜增量同步复用。
const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === entryUrl)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
