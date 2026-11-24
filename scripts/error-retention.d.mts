export function retentionCutoffs(now: number): { eventCutoff: number; groupCutoff: number }
export function pruneDiagnostics(
  query: (
    sql: string
  ) =>
    | Promise<Array<{ results?: Record<string, unknown>[] }>>
    | Array<{ results?: Record<string, unknown>[] }>,
  now?: number
): Promise<{ deletedEvents: number; batches: number; batchLimitReached: boolean }>
