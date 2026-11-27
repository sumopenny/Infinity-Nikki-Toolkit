import { digest, fail, type CloudDB } from './cloudShared'
import { validateCloudRecords } from '../../src/utils/resonance/cloudSchema'
import type { PreparedSnapshot, SnapshotStage } from './cloudSnapshot'

export const resonanceRecordsSQL =
  'SELECT r.payload_json FROM cloud_records r JOIN cloud_users u ON u.id=r.user_id AND u.active_snapshot=r.snapshot_id WHERE u.id=? ORDER BY r.record_id'

const enc = new TextEncoder()

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
    return { kind: 'replayed' }
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
  return { kind: 'staged', count: rows.length, fingerprint }
}
