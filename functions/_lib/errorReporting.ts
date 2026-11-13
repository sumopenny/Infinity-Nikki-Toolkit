import {
  MAX_ERROR_BYTES,
  byteLength,
  diagnosticObject,
  diagnosticText,
  fingerprintInput,
  isOutfitParse504,
  serializeError,
  validateErrorPayload,
  type ErrorEventPayload
} from '../../src/utils/errorReporting/schema'

interface ErrorStatement {
  bind(...values: unknown[]): ErrorStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<unknown>
}
export interface ErrorDatabase {
  prepare(sql: string): ErrorStatement
  batch(
    statements: ErrorStatement[]
  ): Promise<Array<{ success?: boolean; results?: Record<string, unknown>[] }>>
}
export interface ErrorEnv {
  ERROR_DB?: ErrorDatabase
  ERROR_REPORTING_ENABLED?: string
  ERROR_RATE_LIMIT_SALT?: string
  ERROR_MAX_DAILY_EVENTS?: string
  ERROR_SERVER_BUILD_ID?: string
  CF_PAGES_COMMIT_SHA?: string
}
class ReportError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers })
const encoder = new TextEncoder()
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('')
async function hash(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}
async function clientKey(request: Request, salt: string, now: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const input = `${new Date(now).toISOString().slice(0, 10)}:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`
  return 'client:' + hex(await crypto.subtle.sign('HMAC', key, encoder.encode(input)))
}
async function readPayload(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''))
    throw new ReportError(415, 'JSON_REQUIRED')
  if (Number(request.headers.get('content-length')) > MAX_ERROR_BYTES)
    throw new ReportError(413, 'REPORT_TOO_LARGE')
  const reader = request.body?.getReader()
  if (!reader) throw new ReportError(400, 'EMPTY_REPORT')
  const chunks: Uint8Array[] = []
  let length = 0,
    timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => {})
      reject(new ReportError(408, 'REPORT_TIMEOUT'))
    }, 5000)
  })
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline])
      if (done) break
      length += value.byteLength
      if (length > MAX_ERROR_BYTES) {
        void reader.cancel().catch(() => {})
        throw new ReportError(413, 'REPORT_TOO_LARGE')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw new ReportError(400, 'INVALID_JSON')
    }
  } finally {
    clearTimeout(timer)
  }
}
async function limitClient(db: ErrorDatabase, key: string, now: number) {
  const row = await db
    .prepare(
      'INSERT INTO error_rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END WHERE expires_at<=? OR count<60 RETURNING count'
    )
    .bind(key, now + 60000, now, now, now)
    .first<{ count: number }>()
  if (!row) throw new ReportError(429, 'RATE_LIMIT')
}
/** 单个 D1 batch 保证事件、分组触发器、日预算与操作轨迹共同提交或回滚。 */
export async function storeErrorEvent(
  env: ErrorEnv,
  event: ErrorEventPayload,
  receivedAt = Date.now()
): Promise<boolean> {
  const db = env.ERROR_DB
  if (!db) throw new ReportError(503, 'NOT_CONFIGURED')
  const payloadHash = await hash(JSON.stringify(event))
  const previous = await db
    .prepare('SELECT payload_hash FROM error_events WHERE event_id=?')
    .bind(event.eventId)
    .first<{ payload_hash: string }>()
  if (previous) {
    if (previous.payload_hash !== payloadHash) throw new ReportError(409, 'EVENT_ID_CONFLICT')
    return false
  }
  const fingerprint = await hash(fingerprintInput(event))
  const configuredLimit = Number(env.ERROR_MAX_DAILY_EVENTS ?? 1000)
  const dailyLimit = Number.isFinite(configuredLimit)
    ? Math.max(1, Math.min(10000, Math.floor(configuredLimit)))
    : 1000
  const budgetKey = 'day:' + new Date(receivedAt).toISOString().slice(0, 10)
  const requestId = typeof event.context.requestId === 'string' ? event.context.requestId : null
  const payload = JSON.stringify({ ...event, breadcrumbs: [] })
  const insert = db
    .prepare(
      'INSERT INTO error_events(event_id,fingerprint,payload_hash,occurred_at,received_at,module,action,error_type,error_code,error_name,message,stack,build_id,app_version,request_id,payload_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT count FROM error_rate_limits WHERE key=?),0)<? ON CONFLICT(event_id) DO NOTHING RETURNING event_id'
    )
    .bind(
      event.eventId,
      fingerprint,
      payloadHash,
      event.occurredAt,
      receivedAt,
      event.module,
      event.action,
      event.type,
      event.code,
      event.error.name,
      event.error.message,
      event.error.stack,
      event.build.buildId,
      event.build.appVersion,
      requestId,
      payload,
      budgetKey,
      dailyLimit
    )
  const breadcrumbs = db
    .prepare(
      "INSERT OR IGNORE INTO error_breadcrumbs(event_id,sequence,occurred_at,category,name,data_json) SELECT ?,CAST(j.key AS INTEGER),json_extract(j.value,'$.at'),json_extract(j.value,'$.category'),json_extract(j.value,'$.name'),json_extract(j.value,'$.data') FROM json_each(?) AS j WHERE EXISTS(SELECT 1 FROM error_events WHERE event_id=? AND payload_hash=?)"
    )
    .bind(event.eventId, JSON.stringify(event.breadcrumbs), event.eventId, payloadHash)
  const results = await db.batch([insert, breadcrumbs])
  if (results.some((result) => result.success === false))
    throw new ReportError(503, 'STORAGE_UNAVAILABLE')
  if (results[0]?.results?.length) return true
  // 并发重试可能先于本次提交；再次核对，绝不重复累加计数。
  const replay = await db
    .prepare('SELECT payload_hash FROM error_events WHERE event_id=?')
    .bind(event.eventId)
    .first<{ payload_hash: string }>()
  if (replay?.payload_hash === payloadHash) return false
  if (replay) throw new ReportError(409, 'EVENT_ID_CONFLICT')
  throw new ReportError(429, 'DAILY_BUDGET')
}
export async function handleErrorReport(request: Request, env: ErrorEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  if (env.ERROR_REPORTING_ENABLED !== 'true') return json({ error: 'DISABLED' }, 503)
  if (!env.ERROR_DB || !env.ERROR_RATE_LIMIT_SALT || env.ERROR_RATE_LIMIT_SALT.length < 32)
    return json({ error: 'NOT_CONFIGURED' }, 503)
  try {
    if (
      request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
      request.headers.get('X-Error-Report') !== '1'
    )
      throw new ReportError(403, 'FORBIDDEN')
    const raw = await readPayload(request)
    let event: ErrorEventPayload
    try {
      event = validateErrorPayload(raw)
    } catch {
      throw new ReportError(400, 'INVALID_REPORT')
    }
    if (event.type === 'server') throw new ReportError(400, 'INVALID_REPORT')
    if (isOutfitParse504(event.module, event.action, event.error.message))
      return json({ accepted: true, eventId: event.eventId, filtered: true }, 200)
    if (byteLength(JSON.stringify(event)) > MAX_ERROR_BYTES)
      throw new ReportError(413, 'REPORT_TOO_LARGE')
    const now = Date.now()
    await limitClient(env.ERROR_DB, await clientKey(request, env.ERROR_RATE_LIMIT_SALT, now), now)
    const inserted = await storeErrorEvent(env, event, now)
    return json(
      { accepted: true, eventId: event.eventId, replayed: !inserted },
      inserted ? 201 : 200
    )
  } catch (error) {
    if (error instanceof ReportError) return json({ error: error.message }, error.status)
    console.error('error-report-storage', serializeError(error))
    return json({ error: 'STORAGE_UNAVAILABLE' }, 503)
  }
}
/** 服务端自己写 D1，不调用 /api/errors，防止错误上报递归。 */
export async function recordServerError(
  env: ErrorEnv,
  error: unknown,
  details: {
    route: string
    method: string
    status: number
    requestId: string
    durationMs: number
    stage?: string
    operation?: string
    upstreamStatus?: number
    upstreamDurationMs?: number
    attempts?: number
    timedOut?: boolean
    upstreamErrorName?: string
  }
): Promise<void> {
  if (env.ERROR_REPORTING_ENABLED !== 'true') return
  try {
    const event: ErrorEventPayload = {
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      occurredAt: Date.now(),
      module: 'api',
      action: details.operation ?? 'request',
      stage: details.stage ?? details.route,
      code: 'SERVER_ERROR',
      type: 'server',
      handled: true,
      severity: 'error',
      build: {
        buildId: env.ERROR_SERVER_BUILD_ID ?? 'server-unknown',
        appVersion: 'server',
        gitCommit: env.CF_PAGES_COMMIT_SHA ?? '',
        builtAt: '',
        environment: 'production',
        dirty: false
      },
      error: serializeError(error),
      pagePath: diagnosticText(details.route, 256),
      device: { runtime: 'Cloudflare Pages Functions' },
      runtime: {},
      network: {},
      storage: {},
      context: diagnosticObject(details),
      breadcrumbs: [],
      truncated: []
    }
    await storeErrorEvent(env, validateErrorPayload(event))
  } catch (failure) {
    // 配额耗尽或 D1 自身故障时只退回平台日志，不继续写故障库。
    console.error('server-diagnostic-fallback', {
      requestId: details.requestId,
      error: serializeError(error),
      reportingFailure: serializeError(failure)
    })
  }
}
