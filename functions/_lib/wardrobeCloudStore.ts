import { digest, fail, type CloudDB } from './cloudShared'
import type { PreparedSnapshot, SnapshotStage } from './cloudSnapshot'
import {
  normalizeCloudWardrobe,
  summarizeWardrobe,
  validateWardrobeCloudSnapshot,
  validateWardrobeCloudHead,
  type WardrobeCloudHead
} from '../../src/utils/wardrobe/wardrobeCloudSchema'
import type { WardrobeSnapshot } from '../../src/utils/wardrobe/wardrobeSchema'

type HeadRow = {
  revision: number
  updated_at: number
  active_snapshot: string | null
  metadata_json: string | null
  entry_count: number
  owned_count: number
  unknown_suit_count: number
  record_count: number
  schema_version: number
  committed_revision: number | null
}
export const headSQL = `SELECT s.revision,s.updated_at,s.active_snapshot,p.metadata_json,p.entry_count,p.owned_count,
  p.unknown_suit_count,p.record_count,p.schema_version,p.committed_revision FROM cloud_wardrobe_state s
  LEFT JOIN cloud_wardrobe_snapshots p ON p.user_id=s.user_id AND p.id=s.active_snapshot WHERE s.user_id=?`

export function decodeHead(row?: HeadRow): WardrobeCloudHead {
  if (!row) return { revision: 0, updated_at: 0, active_snapshot: null, summary: null }
  const head: WardrobeCloudHead = {
    revision: row.revision,
    updated_at: row.updated_at,
    active_snapshot: row.active_snapshot,
    summary: null
  }
  if (row.active_snapshot) {
    if (row.schema_version !== 1) fail(400, 'UNSUPPORTED_SCHEMA')
    if (!row.metadata_json || row.committed_revision !== row.revision)
      throw new Error('CORRUPT_SNAPSHOT')
    const metadata = JSON.parse(row.metadata_json)
    head.summary = {
      entryCount: row.entry_count,
      ownedCount: row.owned_count,
      unknownSuitCount: row.unknown_suit_count,
      regionScope: metadata.regionScope,
      sourceUpdatedAt: metadata.updatedAt
    }
  }
  validateWardrobeCloudHead(head)
  return head
}

export const wardrobeRecordsSQL =
  'SELECT r.record_key,r.payload_json FROM cloud_wardrobe_records r JOIN cloud_wardrobe_state s ON s.user_id=r.user_id AND s.active_snapshot=r.snapshot_id WHERE s.user_id=? ORDER BY r.record_key'

/** 统一档案下载复用同一批事务的结果，不再另读一次衣橱指针。 */
export function decodeWardrobeSnapshot(result: { results: Record<string, unknown>[] }[]) {
  const row = result[0].results[0] as HeadRow | undefined
  const head = decodeHead(row)
  let data: WardrobeSnapshot | null = null
  if (head.active_snapshot && row) {
    if (result[1].results.length !== row.record_count) throw new Error('CORRUPT_SNAPSHOT')
    data = { ...JSON.parse(row.metadata_json!), entries: {}, unknownSuitIds: [] }
    for (const record of result[1].results) {
      const key = String(record.record_key)
      const payload = JSON.parse(String(record.payload_json))
      if (key.startsWith('item:')) data!.entries[key.slice(5)] = payload
      else if (key.startsWith('suit:') && payload === key.slice(5))
        data!.unknownSuitIds.push(payload)
      else throw new Error('CORRUPT_SNAPSHOT')
    }
  }
  return validateWardrobeCloudSnapshot({ ...head, schemaVersion: 1, data })
}

type Receipt = { digest: string; committed_revision: number | null }
const receipt = (db: CloudDB, userId: string, id: string) =>
  db
    .prepare(
      'SELECT digest,committed_revision FROM cloud_wardrobe_snapshots WHERE user_id=? AND id=?'
    )
    .bind(userId, id)
    .first<Receipt>()

/** 校验版本并暂存完整衣橱快照，由统一档案接口提交。 */
export async function prepareWardrobeSnapshot(
  db: CloudDB,
  userId: string,
  body: Record<string, unknown>,
  deleting: boolean,
  stage: (value: SnapshotStage) => void
): Promise<PreparedSnapshot> {
  stage('validation')
  const id = body.requestId
  const revision = body.revision
  if (
    typeof id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) ||
    !Number.isSafeInteger(revision) ||
    Number(revision) < 0 ||
    Number(revision) >= Number.MAX_SAFE_INTEGER
  )
    fail(400, 'INVALID_DATA')
  if (!deleting && body.schemaVersion !== 1) fail(400, 'UNSUPPORTED_SCHEMA')
  const data = deleting ? null : normalizeCloudWardrobe(body.data)
  const operation = deleting ? 'delete' : 'upload'
  const fingerprint = await digest(
    JSON.stringify({ module: 'wardrobe', operation, schemaVersion: 1, revision, data })
  )
  stage('receipt-read')
  const previous = await receipt(db, userId, id)
  if (previous && previous.digest !== fingerprint) fail(409, 'CONFLICT')
  if (previous?.committed_revision != null) {
    return { kind: 'replayed', revision: previous.committed_revision }
  }
  stage('revision-read')
  await db
    .prepare('INSERT OR IGNORE INTO cloud_wardrobe_state(user_id) VALUES(?)')
    .bind(userId)
    .run()
  const current = await db
    .prepare('SELECT revision,active_snapshot FROM cloud_wardrobe_state WHERE user_id=?')
    .bind(userId)
    .first<{ revision: number; active_snapshot: string | null }>()
  if (!current || current.revision !== revision) fail(409, 'CONFLICT')
  if (deleting && !current.active_snapshot) fail(400, 'EMPTY_CLOUD')
  stage('staging')
  const now = Date.now()
  await db
    .prepare(
      `DELETE FROM cloud_wardrobe_snapshots WHERE user_id=? AND
    id IS NOT (SELECT active_snapshot FROM cloud_wardrobe_state WHERE user_id=?) AND
    ((committed_revision IS NULL AND created_at<?) OR created_at<?)`
    )
    .bind(userId, userId, now - 86400000, now - 30 * 86400000)
    .run()
  const summary = data ? summarizeWardrobe(data) : null
  const rows: { key: string; payload: unknown }[] = data
    ? [
        ...Object.entries(data.entries).map(([key, payload]) => ({ key: `item:${key}`, payload })),
        ...data.unknownSuitIds.map((key) => ({ key: `suit:${key}`, payload: key }))
      ]
    : []
  const metadata = data
    ? JSON.stringify({
        imported: data.imported,
        regionScope: data.regionScope,
        updatedAt: data.updatedAt
      })
    : null
  await db
    .prepare(
      `INSERT INTO cloud_wardrobe_snapshots(user_id,id,operation,digest,metadata_json,record_count,
    entry_count,owned_count,unknown_suit_count,created_at) SELECT ?,?,?,?,?,?,?,?,?,?
    WHERE (SELECT COUNT(*) FROM cloud_wardrobe_snapshots WHERE user_id=? AND committed_revision IS NULL)<2
    ON CONFLICT(user_id,id) DO NOTHING`
    )
    .bind(
      userId,
      id,
      operation,
      fingerprint,
      metadata,
      rows.length,
      summary?.entryCount ?? 0,
      summary?.ownedCount ?? 0,
      summary?.unknownSuitCount ?? 0,
      now,
      userId
    )
    .run()
  const claimed = await receipt(db, userId, id)
  if (!claimed) fail(429, 'UPLOAD_PENDING')
  if (claimed.digest !== fingerprint) fail(409, 'CONFLICT')
  if (claimed.committed_revision != null)
    return { kind: 'replayed', revision: claimed.committed_revision }
  const chunks: string[] = []
  let chunk: string[] = [],
    bytes = 2
  const encoder = new TextEncoder()
  for (const row of rows) {
    const serialized = JSON.stringify(row)
    const length = encoder.encode(serialized).length + 1
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
            `INSERT OR IGNORE INTO cloud_wardrobe_records
    (user_id,snapshot_id,record_key,payload_json) SELECT ?,?,json_extract(value,'$.key'),json_quote(json_extract(value,'$.payload'))
    FROM json_each(?) WHERE EXISTS(SELECT 1 FROM cloud_wardrobe_snapshots WHERE user_id=? AND id=? AND committed_revision IS NULL)`
          )
          .bind(userId, id, value, userId, id)
      )
    )
  return { kind: 'staged', count: rows.length, fingerprint, createdAt: now }
}
