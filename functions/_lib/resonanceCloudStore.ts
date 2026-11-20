import { digest, fail, type CloudDB } from './cloudShared'
import { validateCloudRecords } from '../../src/utils/resonance/cloudSchema'
import type { PreparedSnapshot, SnapshotStage } from './cloudSnapshot'

export const resonanceRecordsSQL =
  'SELECT r.payload_json FROM cloud_records r JOIN cloud_users u ON u.id=r.user_id AND u.active_snapshot=r.snapshot_id WHERE u.id=? ORDER BY r.record_id'

const enc = new TextEncoder()

/** 只回收已提交且不再活跃的记录；保留小型请求回执与其他设备的暂存版本。 */
async function cleanupRecords(db: CloudDB, userId: string, requestId: string) {
  try {
    await db
      .prepare(
        'DELETE FROM cloud_records WHERE user_id=? AND snapshot_id IN (SELECT id FROM cloud_snapshots WHERE user_id=? AND committed_revision IS NOT NULL AND id IS NOT (SELECT active_snapshot FROM cloud_users WHERE id=?))'
      )
      .bind(userId, userId, userId)
      .run()
  } catch {
    // 提交已完成，回收失败留待下次请求处理，不改变提交回执。
    console.warn('resonance-cloud', { stage: 'cleanup', requestId, category: 'deferred' })
  }
}
/** 校验版本并暂存完整共鸣快照，返回准备结果，不提交活跃指针。 */
export async function prepareResonanceSnapshot(
  db: CloudDB,
  userId: string,
  body: Record<string, unknown>,
  deleting: boolean,
  stage: (value: SnapshotStage) => void
): Promise<PreparedSnapshot> {
  stage('validation')
  const id = body.requestId
  if (
    typeof id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(id) ||
    !Number.isSafeInteger(body.revision) ||
    Number(body.revision) < 0
  )
    fail(400, 'INVALID_DATA')
  const records = deleting ? [] : body.records
  if (!deleting) validateCloudRecords(records)
  const rows = records as { id: string }[]
  const fingerprint = await digest(
    JSON.stringify({ revision: body.revision, records: rows, deleting })
  )
  stage('receipt-read')
  const previous = await db
    .prepare('SELECT digest,committed_revision FROM cloud_snapshots WHERE user_id=? AND id=?')
    .bind(userId, id)
    .first<{ digest: string; committed_revision: number | null }>()
  if (previous && previous.digest !== fingerprint) fail(409, 'CONFLICT')
  if (previous?.committed_revision != null) {
    return { kind: 'replayed', revision: previous.committed_revision }
  }
  stage('revision-read')
  const current = await db
    .prepare('SELECT revision FROM cloud_users WHERE id=?')
    .bind(userId)
    .first<{ revision: number }>()
  if (!current || current.revision !== body.revision) fail(409, 'CONFLICT')
  stage('staging')
  const now = Date.now()
  // 清理一天前的中断上传与三十天前的重试回执；当前存档永不被清理。
  await db
    .prepare(
      'DELETE FROM cloud_snapshots WHERE user_id=? AND id IS NOT (SELECT active_snapshot FROM cloud_users WHERE id=?) AND ((committed_revision IS NULL AND created_at<?) OR created_at<?)'
    )
    .bind(userId, userId, now - 86400000, now - 30 * 86400000)
    .run()
  await db
    .prepare(
      'INSERT INTO cloud_snapshots(user_id,id,digest,count,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM cloud_snapshots WHERE user_id=? AND committed_revision IS NULL)<2 ON CONFLICT(user_id,id) DO NOTHING'
    )
    .bind(userId, id, fingerprint, rows.length, now, userId)
    .run()
  const claimed = await db
    .prepare('SELECT digest FROM cloud_snapshots WHERE user_id=? AND id=?')
    .bind(userId, id)
    .first<{ digest: string }>()
  if (!claimed) fail(429, 'UPLOAD_PENDING')
  if (claimed?.digest !== fingerprint) fail(409, 'CONFLICT')
  // 控制每段 JSON 大小，并在同一个 batch 中暂存，避免逐条往返。
  const chunks: string[] = []
  let chunk: string[] = []
  let bytes = 2
  for (const row of rows) {
    const serialized = JSON.stringify(row)
    const length = enc.encode(serialized).length + 1
    if (bytes + length > 300000 && chunk.length) {
      chunks.push(`[${chunk.join(',')}]`)
      chunk = []
      bytes = 2
    }
    chunk.push(serialized)
    bytes += length
  }
  if (chunk.length) chunks.push(`[${chunk.join(',')}]`)
  if (chunks.length)
    await db.batch(
      chunks.map((value) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO cloud_records(user_id,snapshot_id,record_id,payload_json) SELECT ?,?,json_extract(value,'$.id'),value FROM json_each(?)"
          )
          .bind(userId, id, value)
      )
    )
  return { kind: 'staged', count: rows.length, fingerprint, createdAt: now }
}

/** 保留旧客户端的单模块提交契约；与联合接口共享同一准备过程。 */
export async function writeResonanceCloud(
  db: CloudDB,
  user: { id: string },
  body: Record<string, unknown>,
  deleting: boolean,
  stage: (value: SnapshotStage) => void,
  requestId: string
) {
  const prepared = await prepareResonanceSnapshot(db, user.id, body, deleting, stage)
  if (prepared.kind === 'replayed') {
    stage('cleanup')
    await cleanupRecords(db, user.id, requestId)
    return { revision: prepared.revision, replayed: true }
  }
  const id = body.requestId
  const { createdAt: now, count } = prepared
  stage('commit')
  const result = await db.batch([
    db
      .prepare(
        'UPDATE cloud_users SET active_snapshot=?,last_request=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND (SELECT COUNT(*) FROM cloud_records WHERE user_id=? AND snapshot_id=?)=? AND EXISTS(SELECT 1 FROM cloud_sessions WHERE user_id=? AND token_hash=?) RETURNING revision'
      )
      .bind(
        deleting ? null : id,
        id,
        now,
        user.id,
        body.revision,
        user.id,
        id,
        count,
        user.id,
        body.sessionHash
      ),
    db
      .prepare(
        'UPDATE cloud_snapshots SET committed_revision=? WHERE user_id=? AND id=? AND EXISTS(SELECT 1 FROM cloud_users WHERE id=? AND revision=? AND last_request=?)'
      )
      .bind(Number(body.revision) + 1, user.id, id, user.id, Number(body.revision) + 1, id)
  ])
  if (!result[0].results.length) {
    const replay = await db
      .prepare('SELECT committed_revision FROM cloud_snapshots WHERE user_id=? AND id=?')
      .bind(user.id, id)
      .first<{ committed_revision: number | null }>()
    if (replay?.committed_revision != null)
      return { revision: replay.committed_revision, replayed: true }
    await db
      .prepare(
        'DELETE FROM cloud_snapshots WHERE user_id=? AND id=? AND committed_revision IS NULL'
      )
      .bind(user.id, id)
      .run()
    fail(409, 'CONFLICT')
  }
  stage('cleanup')
  await cleanupRecords(db, user.id, requestId)
  return { revision: Number(body.revision) + 1 }
}
