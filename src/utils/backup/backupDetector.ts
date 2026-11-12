import { inflateSync, strFromU8 } from 'fflate'

export type BackupKind = 'all' | 'outfits' | 'home' | 'camera'
export type BackupInputReason =
  | 'not_zip'
  | 'unreadable_zip'
  | 'too_large'
  | 'missing_manifest'
  | 'invalid_manifest'
  | 'unsupported_version'
  | 'unsupported_format'
  | 'type_mismatch'
  | 'duplicate_entry'
  | 'unsupported_entry'
  | 'too_many_entries'
  | 'expanded_too_large'
  | 'incomplete'
  | 'verification_failed'

export class BackupInputError extends Error {
  constructor(
    readonly reason: BackupInputReason,
    readonly actual?: BackupKind,
    options?: ErrorOptions
  ) {
    // Preserve legacy error text; UI uses the stable reason instead.
    super(
      reason === 'not_zip'
        ? 'backup_file_not_zip'
        : reason === 'verification_failed'
          ? '总备份文件缺失或校验失败 / Backup file verification failed'
          : reason,
      options
    )
    this.name = 'BackupInputError'
  }
}

const definitions = {
  all: { name: 'backup.json', format: 'infinity-nikki-all-data-backup', versions: [1, 2] },
  outfits: { name: 'manifest.json', format: 'infinity-nikki-outfit-backup', versions: [1, 2, 3, 4] },
  home: { name: 'manifest.json', format: 'infinity-nikki-home-scheme-backup', versions: [1, 2] },
  camera: { name: 'favorites.json', format: 'nikki-camera-favorites', versions: [2] }
} as const

const labels = {
  zh: { all: '全部数据', outfits: '搭配码', home: '家园方案', camera: '相机参数收藏' },
  en: { all: 'all-data', outfits: 'outfit', home: 'home-scheme', camera: 'camera-favorites' }
}
const manifestNames = new Set(['backup.json', 'manifest.json', 'favorites.json'])
const MAX_FILE_BYTES = 2 * 1024 ** 3
const MAX_MANIFEST_BYTES = 4 * 1024 ** 2
const MAX_DIRECTORY_BYTES = 16 * 1024 ** 2

const read16 = (data: DataView, at: number) => data.getUint16(at, true)
const read32 = (data: DataView, at: number) => data.getUint32(at, true)

/**
 * Read the ZIP central directory from the end of the file and only decompress
 * the small manifest members. Never buffer images or nested ZIPs for detection.
 */
export async function detectBackupKind(file: Blob): Promise<{ kind: BackupKind; version: number }> {
  if (!file.size || file.size > MAX_FILE_BYTES) throw new BackupInputError('too_large')
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (
    header[0] !== 0x50 || header[1] !== 0x4b ||
    !((header[2] === 3 && header[3] === 4) || (header[2] === 5 && header[3] === 6))
  )
    throw new BackupInputError('not_zip')

  // The EOCD record is at most 65,557 bytes from the end (22-byte header + comment).
  const tailStart = Math.max(0, file.size - 65557)
  const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer())
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  let endRecord = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (read32(tailView, i) === 0x06054b50 && i + 22 + read16(tailView, i + 20) === tail.length) {
      endRecord = i
      break
    }
  }
  if (endRecord < 0 || read16(tailView, endRecord + 4) !== 0 ||
      read16(tailView, endRecord + 6) !== 0 ||
      read16(tailView, endRecord + 8) !== read16(tailView, endRecord + 10))
    throw new BackupInputError('unreadable_zip')

  const count = read16(tailView, endRecord + 10)
  const directorySize = read32(tailView, endRecord + 12)
  const directoryOffset = read32(tailView, endRecord + 16)
  if (count > 10000) throw new BackupInputError('too_many_entries')
  if (directorySize > MAX_DIRECTORY_BYTES) throw new BackupInputError('too_large')
  // Reject ZIP64 and invalid offsets rather than guessing positions.
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff ||
      directoryOffset + directorySize > tailStart + endRecord)
    throw new BackupInputError('unreadable_zip')

  const central = new Uint8Array(
    await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer()
  )
  const view = new DataView(central.buffer, central.byteOffset, central.byteLength)
  const decode = new TextDecoder()
  const manifestEntries: Array<{
    name: string
    method: number
    originalSize: number
    compressedSize: number
    localOffset: number
  }> = []
  const seen = new Set<string>()
  let offset = 0
  for (let i = 0; i < count; i++) {
    if (offset + 46 > central.length || read32(view, offset) !== 0x02014b50)
      throw new BackupInputError('unreadable_zip')
    const flags = read16(view, offset + 8)
    const method = read16(view, offset + 10)
    const compressedSize = read32(view, offset + 20)
    const originalSize = read32(view, offset + 24)
    const nameLength = read16(view, offset + 28)
    const extraLength = read16(view, offset + 30)
    const commentLength = read16(view, offset + 32)
    const localOffset = read32(view, offset + 42)
    const next = offset + 46 + nameLength + extraLength + commentLength
    if (next > central.length) throw new BackupInputError('unreadable_zip')
    const name = decode.decode(central.subarray(offset + 46, offset + 46 + nameLength))
    offset = next
    if (!manifestNames.has(name)) continue
    if (seen.has(name)) throw new BackupInputError('duplicate_entry')
    seen.add(name)
    if ((flags & 1) || ![0, 8].includes(method) ||
        originalSize > MAX_MANIFEST_BYTES || compressedSize > MAX_MANIFEST_BYTES + 65536)
      throw new BackupInputError('invalid_manifest')
    manifestEntries.push({ name, method, originalSize, compressedSize, localOffset })
  }
  if (offset !== central.length) throw new BackupInputError('unreadable_zip')
  if (!manifestEntries.length) throw new BackupInputError('missing_manifest')

  let matched: { kind: BackupKind; version: number } | undefined
  for (const entry of manifestEntries) {
    const localHeader = new Uint8Array(
      await file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer()
    )
    if (localHeader.length !== 30) throw new BackupInputError('unreadable_zip')
    const local = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength)
    if (read32(local, 0) !== 0x04034b50 || read16(local, 8) !== entry.method)
      throw new BackupInputError('unreadable_zip')
    const localNameSize = read16(local, 26)
    const localExtraSize = read16(local, 28)
    const nameBytes = new Uint8Array(
      await file.slice(entry.localOffset + 30, entry.localOffset + 30 + localNameSize).arrayBuffer()
    )
    if (decode.decode(nameBytes) !== entry.name) throw new BackupInputError('unreadable_zip')
    const contentAt = entry.localOffset + 30 + localNameSize + localExtraSize
    if (contentAt + entry.compressedSize > file.size) throw new BackupInputError('unreadable_zip')
    const compressed = new Uint8Array(
      await file.slice(contentAt, contentAt + entry.compressedSize).arrayBuffer()
    )
    let manifest: { format?: unknown; version?: unknown }
    try {
      const data = entry.method === 8 ? inflateSync(compressed) : compressed
      if (data.length !== entry.originalSize || data.length > MAX_MANIFEST_BYTES)
        throw new Error('Manifest size mismatch')
      manifest = JSON.parse(strFromU8(data)) as { format?: unknown; version?: unknown }
    } catch (error) {
      throw new BackupInputError('invalid_manifest', undefined, { cause: error })
    }
    for (const kind of Object.keys(definitions) as BackupKind[]) {
      const definition = definitions[kind]
      if (definition.name !== entry.name || manifest?.format !== definition.format) continue
      if (!definition.versions.includes(manifest.version as never))
        throw new BackupInputError('unsupported_version', kind)
      if (matched) throw new BackupInputError('invalid_manifest')
      matched = { kind, version: manifest.version as number }
    }
  }
  if (!matched) throw new BackupInputError('unsupported_format')
  return matched
}

/** Do not import any data until the selected ZIP has the expected type. */
export async function assertBackupKind(file: File, expected: BackupKind): Promise<void> {
  const detected = await detectBackupKind(file)
  if (detected.kind !== expected) throw new BackupInputError('type_mismatch', detected.kind)
}

export function isBackupInputError(error: unknown): error is BackupInputError {
  return error instanceof BackupInputError
}

// Normalize errors from older module-specific ZIP parsers without exposing file paths.
const legacyReasons: Record<string, BackupInputReason> = {
  'home_scheme_backup_manifest_missing': 'missing_manifest',
  'home_scheme_backup_format_unsupported': 'unsupported_format',
  'home_scheme_backup_entry_invalid': 'unsupported_entry',
  'home_scheme_backup_path_invalid': 'unsupported_entry',
  'home_scheme_backup_duplicate_entry': 'duplicate_entry',
  'home_scheme_backup_size_invalid': 'too_large',
  'home_scheme_backup_expanded_size_invalid': 'expanded_too_large',
  'home_scheme_backup_record_invalid': 'invalid_manifest',
  'home_scheme_backup_image_missing': 'incomplete',
  'invalid length/literal': 'unreadable_zip',
  'Backup manifest is missing': 'missing_manifest',
  'Unsupported backup format': 'unsupported_format',
  'Backup contains duplicate entries': 'duplicate_entry',
  'Backup contains an unsupported file': 'unsupported_entry',
  'Backup is missing an outfit image': 'incomplete',
  '备份格式无效': 'unsupported_format',
  '无法读取 ZIP 备份': 'unreadable_zip',
  '备份解压后的体积过大': 'expanded_too_large'
}

export function backupInputMessage(
  error: unknown,
  language: 'zh' | 'en',
  expected: BackupKind
): string | null {
  const known =
    error instanceof BackupInputError
      ? error
      : error instanceof Error && Object.hasOwn(legacyReasons, error.message)
        ? new BackupInputError(legacyReasons[error.message])
        : null
  if (!known) return null
  const name = labels[language][expected]
  const actual = known.actual ? labels[language][known.actual] : ''
  if (language === 'zh') {
    switch (known.reason) {
      case 'type_mismatch':
        return '检测到的是「' + actual + '」备份，不是「' + name + '」备份。请到对应模块导入，或重新选择正确文件。'
      case 'not_zip':
        return '所选文件不是 ZIP 备份，请选择暖立方导出的 ZIP 文件。'
      case 'unreadable_zip':
        return 'ZIP 文件无法正常解压，可能已损坏或未下载完整，请检查原文件。'
      case 'too_large':
      case 'expanded_too_large':
        return '备份文件或解压后的内容超过安全限制，请使用模块分包备份。'
      case 'missing_manifest':
        return '未找到暖立方备份清单，请确认选择的是正确的备份 ZIP。'
      case 'invalid_manifest':
        return '备份清单无效或已损坏，已停止导入以保护原有数据。'
      case 'unsupported_format':
        return '无法识别该 ZIP 的备份类型，请选择暖立方生成的备份文件。'
      case 'unsupported_version':
        return '此「' + (actual || name) + '」备份的版本暂不受当前网页支持。'
      case 'duplicate_entry':
        return '备份内有重复的文件条目，已停止导入以保护原有数据。'
      case 'unsupported_entry':
        return '备份内有不支持的文件条目，请检查 ZIP 是否被重新打包。'
      case 'too_many_entries':
        return '备份内文件数量超过安全限制，无法导入。'
      case 'incomplete':
        return '备份文件不完整，缺少必要内容，已停止导入。'
      case 'verification_failed':
        return '备份文件与清单校验不一致，已停止导入以保护原有数据。'
    }
  }
  switch (known.reason) {
    case 'type_mismatch':
      return 'This is a ' + actual + ' backup, not a ' + name + ' backup. Use the matching module or select another file.'
    case 'not_zip':
      return 'This is not a ZIP backup. Select a ZIP exported by the app.'
    case 'unreadable_zip':
      return 'The ZIP could not be opened. It may be damaged or incomplete.'
    case 'too_large':
    case 'expanded_too_large':
      return 'The archive exceeds the safe size limit. Export smaller module backups.'
    case 'missing_manifest':
      return 'No backup manifest was found. Select a valid app backup ZIP.'
    case 'invalid_manifest':
      return 'The backup manifest is invalid. Nothing was imported.'
    case 'unsupported_format':
      return 'The ZIP is not a recognized app backup.'
    case 'unsupported_version':
      return 'This ' + (actual || name) + ' backup version is not supported by this app.'
    case 'duplicate_entry':
      return 'The ZIP contains duplicate file entries. Nothing was imported.'
    case 'unsupported_entry':
      return 'The ZIP contains unsupported files. Check whether it was repackaged.'
    case 'too_many_entries':
      return 'The ZIP contains too many entries to import safely.'
    case 'incomplete':
      return 'The backup is incomplete. Nothing was imported.'
    case 'verification_failed':
      return 'Backup checksums do not match. Nothing was imported.'
  }
}
