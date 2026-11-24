/** Shared by the Worker scheduler and the administrator CLI. Only diagnostic tables. */
export function retentionCutoffs(now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid retention time')
  return { eventCutoff: now - 30 * 86400000, groupCutoff: now - 180 * 86400000 }
}

export async function pruneDiagnostics(query, now = Date.now()) {
  const { eventCutoff, groupCutoff } = retentionCutoffs(now)
  let deletedEvents = 0
  let batches = 0
  for (; batches < 20;) {
    const result = await query(
      `DELETE FROM error_events WHERE event_id IN (SELECT event_id FROM error_events WHERE received_at<${eventCutoff} ORDER BY received_at LIMIT 500) RETURNING event_id;`
    )
    const count = result[0]?.results?.length ?? 0
    deletedEvents += count
    batches++
    if (count < 500) break
  }
  // Separate statements also work with D1 prepared statements (one statement each).
  for (const sql of [
    `DELETE FROM error_groups WHERE last_seen<${groupCutoff} AND NOT EXISTS(SELECT 1 FROM error_events WHERE fingerprint=error_groups.fingerprint)`,
    `DELETE FROM error_rate_limits WHERE expires_at<${now}`,
    `DELETE FROM error_release_stats WHERE last_seen<${groupCutoff} AND NOT EXISTS(SELECT 1 FROM error_events WHERE build_id=error_release_stats.build_id)`,
    'UPDATE error_groups SET latest_event_id=NULL WHERE latest_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM error_events WHERE event_id=error_groups.latest_event_id)'
  ])
    await query(sql)
  return { deletedEvents, batches, batchLimitReached: batches === 20 && deletedEvents === 10000 }
}
