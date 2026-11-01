import { fileSystemEn, fileSystemZh } from '../../i18n/messages/fileSystem'

/** 浏览器和 Pages 共用诊断协议。只保存技术上下文，不序列化任意业务对象。 */
export const MAX_ERROR_BYTES = 64 * 1024
export const MAX_BREADCRUMBS = 30
export type ErrorKind =
  'runtime' | 'promise' | 'vue' | 'business' | 'network' | 'resource' | 'server'
export interface ErrorMetadata {
  module: string
  action: string
  stage?: string
  code?: string
  type?: ErrorKind
  handled?: boolean
  severity?: 'error' | 'warning'
  context?: Record<string, unknown>
}
export interface BuildInfo {
  buildId: string
  appVersion: string
  gitCommit: string
  builtAt: string
  environment: string
  dirty: boolean
}
export interface ErrorDetail {
  name: string
  message: string
  stack: string
  causes: Array<{ name: string; message: string; stack: string }>
}
export interface Breadcrumb {
  at: number
  category: string
  name: string
  data: Record<string, unknown>
}
export interface ErrorEventPayload {
  schemaVersion: 1
  eventId: string
  occurredAt: number
  module: string
  action: string
  stage: string
  code: string
  type: ErrorKind
  handled: boolean
  severity: 'error' | 'warning'
  build: BuildInfo
  error: ErrorDetail
  pagePath: string
  /** Only the page origin, never a path, query string or credentials. Absent in older reports. */
  pageOrigin?: string
  device: Record<string, unknown>
  runtime: Record<string, unknown>
  network: Record<string, unknown>
  storage: Record<string, unknown>
  context: Record<string, unknown>
  breadcrumbs: Breadcrumb[]
  truncated: string[]
}
const encoder = new TextEncoder()
export const byteLength = (value: string) => encoder.encode(value).byteLength
export function clipText(value: string, maximum: number): string {
  if (byteLength(value) <= maximum) return value
  return new TextDecoder().decode(encoder.encode(value).slice(0, maximum - 24)) + '…[truncated]'
}
/** 不删减 UA、型号和技术栈；只阻止凭据与私人文件内容意外混入。 */
export function diagnosticText(value: string, maximum = 8192): string {
  return clipText(
    value
      .replace(/\b(Bearer|Basic)\s+[a-z0-9+/=_\-.]+/gi, '$1 [excluded]')
      .replace(
        /(["']?(?:momoToken|momoNid|token|access_token|refresh_token|authorization|cookie|password|openid|roleid|uid|resonance_session)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi,
        '$1[excluded]'
      )
      .replace(/\bhttps?:\/\/[^\s<>"')]+/gi, (url) => url.split(/[?#]/)[0])
      .replace(/data:[^\s"']+/gi, '[data-url-excluded]'),
    maximum
  )
}
const privateKey =
  /^(?:token|accessToken|refreshToken|authorization|cookie|password|secret|credentials|openid|roleid|uid|momoNid|momoToken|body|requestBody|responseBody|fileName|filePath|photo|imageData|raw|content|records)$/i
export function diagnosticObject(value: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>()
  function visit(input: unknown, depth: number): unknown {
    if (input === null || typeof input === 'boolean') return input
    if (typeof input === 'number') return Number.isFinite(input) ? input : null
    if (typeof input === 'string') return diagnosticText(input, 4096)
    if (!input || typeof input !== 'object') return null
    if (depth > 5 || seen.has(input)) return '[depth-or-cycle-limit]'
    if (typeof Blob !== 'undefined' && input instanceof Blob)
      return { mimeType: input.type, sizeBytes: input.size }
    seen.add(input)
    if (Array.isArray(input)) return input.slice(0, 30).map((entry) => visit(entry, depth + 1))
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(input).slice(0, 64)) {
      if (privateKey.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue
      try {
        result[key.slice(0, 80)] = visit((input as Record<string, unknown>)[key], depth + 1)
      } catch {
        result[key.slice(0, 80)] = '[unreadable]'
      }
    }
    return result
  }
  const result = visit(value, 0)
  return result && typeof result === 'object' && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : {}
}
export function serializeError(error: unknown): ErrorDetail {
  const causes: ErrorDetail['causes'] = []
  const seen = new Set<unknown>()
  function describe(value: unknown, maximum: number) {
    const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    return {
      name: diagnosticText(typeof obj.name === 'string' ? obj.name : 'Error', 128),
      message: diagnosticText(
        typeof obj.message === 'string'
          ? obj.message
          : typeof value === 'string'
            ? value
            : 'Non-Error thrown value',
        8192
      ),
      stack: diagnosticText(typeof obj.stack === 'string' ? obj.stack : '', maximum)
    }
  }
  const primary = describe(error, 16384)
  let current: unknown = error
  seen.add(current)
  for (let i = 0; i < 4; i++) {
    if (!current || typeof current !== 'object') break
    const next: unknown = (current as { cause?: unknown }).cause
    if (next == null || seen.has(next)) break
    seen.add(next)
    causes.push(describe(next, 2048))
    current = next
  }
  return { ...primary, causes }
}
const expected = new Set([
  'cancelled',
  'MISSING_CREDENTIALS',
  'EMPTY_CLOUD',
  'EMPTY_LOCAL',
  'LOCAL_CHANGED',
  'WARDROBE_CHANGED',
  'CREDENTIAL_FORMAT',
  'CREDENTIALS',
  'LOGIN_REQUIRED',
  'ACCOUNT_CHANGED',
  'USERNAME_TAKEN',
  'PASSWORD_MISMATCH',
  'CONFLICT',
  'home_scheme_code_duplicate',
  'home_scheme_code_invalid',
  'home_scheme_record_changed',
  'home_scheme_record_missing',
  'FILE_TOO_LARGE',
  'outfit_record_changed',
  'home_build_server_unsupported',
  'home_build_not_found',
  'share_code_invalid'
])
/** 兼容浏览器提示、相册重新授权和 X6Game 目录选择属于预期状态，不进入 D1。 */
const expectedDirectoryMessages = new Set([
  fileSystemZh.unsupportedBrowser,
  fileSystemZh.mobileBrowserUnsupported,
  fileSystemZh.permissionRequired,
  fileSystemZh.invalidX6GameDirectory,
  fileSystemEn.unsupportedBrowser,
  fileSystemEn.mobileBrowserUnsupported,
  fileSystemEn.permissionRequired,
  fileSystemEn.invalidX6GameDirectory,
  '请先授权 X6Game 文件夹。',
  'Please authorize the X6Game folder first.'
])
// 保留旧版本和短提示文案的兼容；只匹配明确的开头，避免吞掉其他文件系统故障。
const expectedDirectoryPrefixes = [
  '当前浏览器不支持选择文件夹',
  '手机浏览器不支持目录授权',
  '已记住相册路径，但需要重新授权',
  '已记住上次相册路径，但浏览器需要重新授权',
  '未授权 X6Game 文件夹',
  '请先授权 X6Game 文件夹',
  '选择的目录不是正确的 X6Game 文件夹',
  '所选目录不是当前相册对应的 X6Game 文件夹'
]
function isExpectedMessage(message: string): boolean {
  return (
    expected.has(message) ||
    expectedDirectoryMessages.has(message) ||
    expectedDirectoryPrefixes.some((prefix) => message.startsWith(prefix))
  )
}
export function isExpectedError(value: unknown): boolean {
  if (!value || typeof value !== 'object')
    return typeof value === 'string' && isExpectedMessage(value)
  const error = value as { name?: string; message?: string; code?: unknown }
  return (
    error.name === 'AbortError' ||
    error.name === 'DuplicateOutfitCodeError' ||
    (typeof error.message === 'string' && isExpectedMessage(error.message)) ||
    (typeof error.code === 'string' && expected.has(error.code)) ||
    (error.name === 'DirectoryAccessError' &&
      (error.code === 'permission-denied' || error.code === 'invalid-directory'))
  )
}
/** Authentication/region validation can expose upstream regressions: record as warnings, not cancellations. */
export function isDiagnosticWarning(value: unknown): boolean {
  const message =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? (value as { message?: unknown }).message
        : undefined
  return (
    typeof message === 'string' &&
    [
      'Pearpal UID mismatch',
      'Pearpal region mismatch',
      'Pearpal credentials could not be verified'
    ].includes(message)
  )
}
/** Restrict client-supplied origin to a canonical HTTP(S) origin without credentials or URL paths. */
export function validatedPageOrigin(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || byteLength(value) > 256) throw new Error('INVALID_REPORT')
  try {
    const parsed = new URL(value)
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== value ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) throw new Error('INVALID_REPORT')
    return parsed.origin
  } catch {
    throw new Error('INVALID_REPORT')
  }
}
export function fingerprintInput(event: ErrorEventPayload): string {
  const root = event.error.causes.at(-1) ?? event.error
  const frame = root.stack.split('\n').find((line) => /\.([cm]?js|ts|vue):\d+/.test(line)) ?? ''
  return [
    event.module,
    event.action,
    event.stage,
    event.type,
    event.code,
    root.name,
    root.message.replace(/\b[0-9a-f]{16,}\b/gi, '#').replace(/\b\d{4,}\b/g, '#'),
    frame.replace(/https?:\/\/[^/]+/g, '')
  ].join('|')
}
/** 客户端设备信息是自述信息，不能用于认证或授权。 */
export function validateErrorPayload(input: unknown): ErrorEventPayload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_REPORT')
  const p = input as ErrorEventPayload
  const text = (v: unknown, max: number) => typeof v === 'string' && byteLength(v) <= max
  if (
    p.schemaVersion !== 1 ||
    !text(p.eventId, 96) ||
    !text(p.module, 80) ||
    !text(p.action, 96) ||
    !/^[a-zA-Z0-9_-]{16,96}$/.test(p.eventId ?? '') ||
    !Number.isSafeInteger(p.occurredAt) ||
    p.occurredAt < 0 ||
    !/^[a-zA-Z0-9_.:-]{1,80}$/.test(p.module ?? '') ||
    !/^[a-zA-Z0-9_.:-]{1,96}$/.test(p.action ?? '') ||
    !['runtime', 'promise', 'vue', 'business', 'network', 'resource', 'server'].includes(p.type) ||
    !text(p.stage, 128) ||
    !text(p.code, 128) ||
    typeof p.handled !== 'boolean' ||
    !['error', 'warning'].includes(p.severity) ||
    !p.build ||
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(p.build.buildId ?? '') ||
    !text(p.build.buildId, 128) ||
    !text(p.build.appVersion, 64) ||
    !text(p.build.gitCommit, 64) ||
    !text(p.build.builtAt, 64) ||
    !text(p.build.environment, 32) ||
    typeof p.build.dirty !== 'boolean' ||
    !p.error ||
    !text(p.error.name, 128) ||
    !text(p.error.message, 8192) ||
    !text(p.error.stack, 16384) ||
    !Array.isArray(p.error.causes) ||
    p.error.causes.length > 4 ||
    !text(p.pagePath, 256) ||
    !Array.isArray(p.breadcrumbs) ||
    p.breadcrumbs.length > MAX_BREADCRUMBS
  )
    throw new Error('INVALID_REPORT')
  const causes = p.error.causes.map((cause) => {
    if (!cause || !text(cause.name, 128) || !text(cause.message, 8192) || !text(cause.stack, 2048))
      throw new Error('INVALID_REPORT')
    return {
      name: diagnosticText(cause.name, 128),
      message: diagnosticText(cause.message),
      stack: diagnosticText(cause.stack, 2048)
    }
  })
  const breadcrumbs = p.breadcrumbs.map((crumb) => {
    if (
      !crumb ||
      !Number.isSafeInteger(crumb.at) ||
      !text(crumb.category, 40) ||
      !text(crumb.name, 96)
    )
      throw new Error('INVALID_REPORT')
    return {
      at: crumb.at,
      category: diagnosticText(crumb.category, 40),
      name: diagnosticText(crumb.name, 96),
      data: diagnosticObject(crumb.data)
    }
  })
  return {
    schemaVersion: 1,
    eventId: p.eventId,
    occurredAt: p.occurredAt,
    module: p.module,
    action: p.action,
    stage: diagnosticText(p.stage, 128),
    code: diagnosticText(p.code, 128),
    type: p.type,
    severity: p.severity,
    handled: p.handled,
    build: {
      buildId: p.build.buildId,
      appVersion: diagnosticText(p.build.appVersion, 64),
      gitCommit: diagnosticText(p.build.gitCommit, 64),
      builtAt: p.build.builtAt,
      environment: p.build.environment,
      dirty: p.build.dirty
    },
    error: {
      name: diagnosticText(p.error.name, 128),
      message: diagnosticText(p.error.message),
      stack: diagnosticText(p.error.stack, 16384),
      causes
    },
    pagePath: diagnosticText(p.pagePath.split(/[?#]/)[0], 256),
    ...(validatedPageOrigin(p.pageOrigin) !== undefined
      ? { pageOrigin: validatedPageOrigin(p.pageOrigin) }
      : {}),
    device: diagnosticObject(p.device),
    runtime: diagnosticObject(p.runtime),
    network: diagnosticObject(p.network),
    storage: diagnosticObject(p.storage),
    context: diagnosticObject(p.context),
    breadcrumbs,
    truncated: Array.isArray(p.truncated) ? p.truncated.filter((v) => text(v, 80)).slice(0, 20) : []
  }
}
