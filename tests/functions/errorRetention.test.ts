import { expect, it, vi } from 'vitest'
import { pruneDiagnostics, retentionCutoffs } from '../../scripts/error-retention.mjs'

it('uses strict retention boundaries and stops at the batch limit', async () => {
  const now = 200 * 86400000
  expect(retentionCutoffs(now)).toEqual({ eventCutoff: 170 * 86400000, groupCutoff: 20 * 86400000 })
  expect(() => retentionCutoffs(NaN)).toThrow()
  const calls: string[] = []
  const result = await pruneDiagnostics(async (sql) => {
    calls.push(sql)
    return [
      {
        results: sql.includes('RETURNING')
          ? Array.from({ length: 500 }, () => ({ event_id: 'test' }))
          : []
      }
    ]
  }, now)
  expect(result).toEqual({ deletedEvents: 10000, batches: 20, batchLimitReached: true })
  expect(calls).toHaveLength(24)
  expect(calls[0]).toContain(`received_at<${170 * 86400000}`)
  expect(calls.join('\n')).not.toMatch(/like_counter|cloud_users|cloud_snapshots/)
})

it('propagates database failures without running subsequent deletions', async () => {
  const query = vi.fn().mockRejectedValue(new Error('unavailable'))
  await expect(pruneDiagnostics(query)).rejects.toThrow('unavailable')
  expect(query).toHaveBeenCalledTimes(1)
})
