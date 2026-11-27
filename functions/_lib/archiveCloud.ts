import {
  ApiError,
  checkOrigin,
  digest,
  fail,
  headers,
  json,
  limit,
  readBody,
  readCloudSession,
  requireCloudAccount,
  type CloudDB,
  type CloudEnv
} from './cloudShared'
import { prepareResonanceSnapshot, resonanceRecordsSQL } from './resonanceCloudStore'
import type { SnapshotStage } from './cloudSnapshot'
import {
  decodeHead,
  decodeWardrobeSnapshot,
  headSQL,
  prepareWardrobeSnapshot,
  wardrobeRecordsSQL
} from './wardrobeCloudStore'
import {
  archiveModules,
  validateArchiveHead,
  validateArchiveSnapshot,
  validateArchiveWrite,
  type ArchiveModule,
  type ArchiveWrite
} from '../../src/utils/cloud/archiveSchema'

const resonanceHeadSQL = `SELECT u.revision,u.updated_at,u.active_snapshot,COALESCE(p.count,0) AS count
 FROM cloud_users u LEFT JOIN cloud_snapshots p ON p.user_id=u.id AND p.id=u.active_snapshot WHERE u.id=?`
type Receipt = { digest: string; committed: number; result_json: string }
const readReceipt = (db: CloudDB, userId: string, id: string) =>
  db
    .prepare(
      'SELECT digest,committed,result_json FROM cloud_archive_requests WHERE user_id=? AND id=?'
    )
    .bind(userId, id)
    .first<Receipt>()

/** 所有选中模块在同一读事务中获取，避免两份下载来自不同提交时刻。 */
async function readArchive(
  db: CloudDB,
  userId: string,
  selected: ArchiveModule[],
  complete: boolean
) {
  const queries = selected.flatMap((module) =>
    module === 'resonance'
      ? [
          db.prepare(resonanceHeadSQL).bind(userId),
          ...(complete ? [db.prepare(resonanceRecordsSQL).bind(userId)] : [])
        ]
      : [
          db.prepare(headSQL).bind(userId),
          ...(complete ? [db.prepare(wardrobeRecordsSQL).bind(userId)] : [])
        ]
  )
  const result = await db.batch(queries)
  let offset = 0
  const output: Record<string, unknown> = {}
  for (const module of selected) {
    const row = result[offset].results[0]
    if (module === 'resonance') {
      if (!row) fail(401, 'LOGIN_REQUIRED')
      const records = complete
        ? result[offset + 1].results.map((r) => JSON.parse(String(r.payload_json)))
        : undefined
      if (complete && records!.length !== Number(row.count)) throw new Error('INVALID_DATA')
      output.resonance = complete ? { ...row, records } : row
    } else
      output.wardrobe = complete
        ? decodeWardrobeSnapshot(result.slice(offset, offset + 2))
        : decodeHead(row as Parameters<typeof decodeHead>[0])
    offset += complete ? 2 : 1
  }
  if (complete) validateArchiveSnapshot(output, selected)
  else validateArchiveHead(output)
  return output
}

/** 暂存仍复用旧存档格式；回执闸门和全部指针切换必须处于同一 D1 batch 事务。 */
async function writeArchive(
  db: CloudDB,
  userId: string,
  sessionHash: string,
  body: ArchiveWrite,
  deleting: boolean,
  traceId: string,
  setStage: (stage: string, module?: ArchiveModule) => void
) {
  const fingerprint = await digest(
    JSON.stringify({ action: deleting ? 'delete' : 'upload', ...body })
  )
  setStage('receipt-read')
  const previous = await readReceipt(db, userId, body.requestId)
  if (previous && previous.digest !== fingerprint) fail(409, 'CONFLICT')
  if (previous?.committed) return { ...JSON.parse(previous.result_json), replayed: true }
  const selected = archiveModules.filter((k) => body.modules[k])
  const staged: {
    module: ArchiveModule
    fingerprint: string
    count: number
    revision: number
  }[] = []
  try {
    for (const module of selected) {
      const payload = body.modules[module]!
      const stage = (value: SnapshotStage) => setStage(value, module)
      const result =
        module === 'resonance'
          ? await prepareResonanceSnapshot(
              db,
              userId,
              { ...payload, requestId: body.requestId },
              deleting,
              stage
            )
          : await prepareWardrobeSnapshot(
              db,
              userId,
              { ...payload, requestId: body.requestId, schemaVersion: 1 },
              deleting,
              stage
            )
      if (result.kind === 'replayed') {
        // 同 ID 的并发重试可能刚刚整体提交；只认统一回执，不拼接单模块成功结果。
        const replay = await readReceipt(db, userId, body.requestId)
        if (replay?.committed && replay.digest === fingerprint)
          return { ...JSON.parse(replay.result_json), replayed: true }
        fail(409, 'CONFLICT')
      }
      staged.push({
        module,
        fingerprint: result.fingerprint,
        count: result.count,
        revision: payload.revision
      })
    }
    setStage('commit')
    const guards = ['EXISTS(SELECT 1 FROM cloud_sessions WHERE user_id=? AND token_hash=?)']
    const guardValues: unknown[] = [userId, sessionHash]
    for (const item of staged) {
      const wardrobe = item.module === 'wardrobe'
      const state = wardrobe ? 'cloud_wardrobe_state' : 'cloud_users'
      const snapshots = wardrobe ? 'cloud_wardrobe_snapshots' : 'cloud_snapshots'
      const records = wardrobe ? 'cloud_wardrobe_records' : 'cloud_records'
      guards.push(
        `EXISTS(SELECT 1 FROM ${state} WHERE ${wardrobe ? 'user_id' : 'id'}=? AND revision=? ${deleting ? 'AND active_snapshot IS NOT NULL' : ''})`
      )
      guardValues.push(userId, item.revision)
      guards.push(
        `EXISTS(SELECT 1 FROM ${snapshots} WHERE user_id=? AND id=? AND digest=? AND committed_revision IS NULL)`
      )
      guardValues.push(userId, body.requestId, item.fingerprint)
      guards.push(`(SELECT COUNT(*) FROM ${records} WHERE user_id=? AND snapshot_id=?)=?`)
      guardValues.push(userId, body.requestId, item.count)
    }
    const revisions = Object.fromEntries(staged.map((item) => [item.module, item.revision + 1]))
    const outcome = JSON.stringify({ revisions })
    const gate =
      'EXISTS(SELECT 1 FROM cloud_archive_requests WHERE user_id=? AND id=? AND digest=? AND committed=0)'
    const gateValues = [userId, body.requestId, fingerprint]
    const now = Date.now()
    const statements = [
      db
        .prepare(
          `INSERT INTO cloud_archive_requests(user_id,id,digest,result_json,created_at) SELECT ?,?,?,?,? WHERE ${guards.join(' AND ')} ON CONFLICT(user_id,id) DO NOTHING`
        )
        .bind(userId, body.requestId, fingerprint, outcome, now, ...guardValues)
    ]
    for (const item of staged) {
      const wardrobe = item.module === 'wardrobe'
      statements.push(
        db
          .prepare(
            `UPDATE ${wardrobe ? 'cloud_wardrobe_state' : 'cloud_users'} SET active_snapshot=?,revision=revision+1,updated_at=? WHERE ${wardrobe ? 'user_id' : 'id'}=? AND ${gate}`
          )
          .bind(deleting ? null : body.requestId, now, userId, ...gateValues)
      )
      statements.push(
        db
          .prepare(
            `UPDATE ${wardrobe ? 'cloud_wardrobe_snapshots' : 'cloud_snapshots'} SET committed_revision=? WHERE user_id=? AND id=? AND ${gate}`
          )
          .bind(item.revision + 1, userId, body.requestId, ...gateValues)
      )
    }
    statements.push(
      db
        .prepare(
          `UPDATE cloud_archive_requests SET committed=1 WHERE user_id=? AND id=? AND digest=? AND committed=0`
        )
        .bind(...gateValues)
    )
    await db.batch(statements)
    const committed = await readReceipt(db, userId, body.requestId)
    if (!committed?.committed || committed.digest !== fingerprint) fail(409, 'CONFLICT')
    // 清理只回收非活跃已提交数据，失败不改变已完成操作的结果。
    try {
      const cleanup = staged.map((item) => {
        const w = item.module === 'wardrobe'
        return db
          .prepare(
            `DELETE FROM ${w ? 'cloud_wardrobe_records' : 'cloud_records'} WHERE user_id=? AND snapshot_id IN (SELECT id FROM ${w ? 'cloud_wardrobe_snapshots' : 'cloud_snapshots'} WHERE user_id=? AND committed_revision IS NOT NULL AND id IS NOT (SELECT active_snapshot FROM ${w ? 'cloud_wardrobe_state' : 'cloud_users'} WHERE ${w ? 'user_id' : 'id'}=?))`
          )
          .bind(userId, userId, userId)
      })
      cleanup.push(
        db
          .prepare('DELETE FROM cloud_archive_requests WHERE created_at<? AND committed=1')
          .bind(now - 30 * 86400000)
      )
      await db.batch(cleanup)
    } catch {
      console.warn('archive-cloud', { stage: 'cleanup', traceId, category: 'deferred' })
    }
    return { ...JSON.parse(committed.result_json), replayed: false }
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 409 && staged.length) {
      // 冲突后旧预览不能再提交，释放本次已验证摘要的暂存，避免反复刷新耗尽暂存名额。
      // 已提交回执和其他请求的同名但不同内容暂存均不会被删除。
      try {
        await db.batch(
          staged.map((item) =>
            db
              .prepare(
                `DELETE FROM ${item.module === 'wardrobe' ? 'cloud_wardrobe_snapshots' : 'cloud_snapshots'} WHERE user_id=? AND id=? AND digest=? AND committed_revision IS NULL`
              )
              .bind(userId, body.requestId, item.fingerprint)
          )
        )
      } catch {
        console.warn('archive-cloud', { stage: 'conflict-cleanup', traceId, category: 'deferred' })
      }
    }
    throw cause
  }
}

export async function handleArchiveCloud(
  request: Request,
  env: CloudEnv,
  onFailure?: (
    error: unknown,
    detail: { stage: string; operation: string; module?: ArchiveModule }
  ) => void
): Promise<Response> {
  const traceId = crypto.randomUUID()
  let stage = 'origin'
  let module: ArchiveModule | undefined
  const setStage = (next: string, currentModule?: ArchiveModule) => {
    stage = next
    module = currentModule
  }
  const url = new URL(request.url)
  const operation = url.searchParams.get('action') ?? 'summary'
  try {
    checkOrigin(request)
    const db = env.RESONANCE_DB
    if (!db) fail(503, 'NOT_CONFIGURED')
    if (!['summary', 'snapshot', 'upload', 'delete'].includes(operation)) fail(400, 'INVALID_DATA')
    if (request.method !== (['summary', 'snapshot'].includes(operation) ? 'GET' : 'POST'))
      fail(405, 'METHOD')
    stage = 'session'
    const { user, sessionHash } = await readCloudSession<{ id: string }>(db, request)
    requireCloudAccount(request, user)
    stage = 'rate-limit'
    await limit(db, `archive-sync:${user.id}`, 60)
    if (operation === 'summary' || operation === 'snapshot') {
      stage = 'snapshot-read'
      const modules = url.searchParams.get('modules')?.split(',') ?? [...archiveModules]
      if (
        !modules.length ||
        new Set(modules).size !== modules.length ||
        modules.some((k) => !archiveModules.includes(k as ArchiveModule))
      )
        fail(400, 'INVALID_DATA')
      return json(
        await readArchive(
          db,
          user.id,
          operation === 'summary'
            ? [...archiveModules]
            : archiveModules.filter((k) => modules.includes(k)),
          operation === 'snapshot'
        )
      )
    }
    if (operation === 'delete') await limit(db, `archive-delete:${user.id}`, 10)
    stage = 'validation'
    const body = validateArchiveWrite(
      await readBody(request, operation === 'delete' ? 8192 : 16 * 1024 * 1024 + 32768),
      operation === 'delete'
    )
    stage = 'write'
    return json(
      await writeArchive(db, user.id, sessionHash, body, operation === 'delete', traceId, setStage)
    )
  } catch (error) {
    const known =
      error instanceof ApiError ||
      (error instanceof Error &&
        ['INVALID_DATA', 'TOO_LARGE', 'EMPTY_LOCAL', 'UNSUPPORTED_SCHEMA'].includes(error.message))
    if (!known) onFailure?.(error, { stage, operation, ...(module ? { module } : {}) })
    if (!known)
      console.error('archive-cloud', {
        stage,
        ...(module ? { module } : {}),
        operation: ['summary', 'snapshot', 'upload', 'delete'].includes(operation)
          ? operation
          : 'unknown',
        traceId,
        category: 'runtime'
      })
    return Response.json(
      { error: known ? (error as Error).message : 'SERVER_ERROR' },
      {
        status: error instanceof ApiError ? error.status : known ? 400 : 500,
        headers: { ...headers, 'X-Request-Id': traceId }
      }
    )
  }
}
