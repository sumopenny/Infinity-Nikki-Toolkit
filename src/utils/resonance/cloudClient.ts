import { requestCloud, type CloudUser } from '../cloud/cloudClient'
import type { ResonanceRecord } from './resonanceTypes'

export type { CloudUser } from '../cloud/cloudClient'
export interface CloudSnapshot {
  revision: number
  updated_at: number
  active_snapshot: string | null
  records: ResonanceRecord[]
}

/** 云账户入口；档案读写使用统一 archive 接口。 */
export function cloudRequest<T>(
  action: string,
  user?: CloudUser | null,
  body?: unknown
): Promise<T> {
  return requestCloud('/api/resonance/cloud', action, user, body)
}
