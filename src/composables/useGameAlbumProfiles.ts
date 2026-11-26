import { reactive } from 'vue'
import { PEARPAL_REGIONS } from '../utils/resonance/pearpalRegions'

// Query China first; all international regions share the same API and client ID.
const profileServers = [
  ...new Map(
    Object.values(PEARPAL_REGIONS).map((config) => [`${config.api}:${config.clientId}`, config])
  ).values()
]

export interface GameAlbumProfile {
  nickname: string | null
  avatarUrl: string | null
  level: number | null
  createdAt: string | null
  updatedAt: string | null
}

function readAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

function readTimestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}

async function requestProfile(
  uid: string,
  { api, clientId }: (typeof profileServers)[number]
): Promise<GameAlbumProfile | null> {
  const queryUid = Number(uid)
  if (!Number.isSafeInteger(queryUid) || queryUid <= 0 || String(queryUid) !== uid) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(`${api}/v1/strategy/user/info/get`, {
      method: 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, query_uid: queryUid }),
      signal: controller.signal
    })
    if (!response.ok) return null

    const payload = (await response.json()) as {
      code?: unknown
      data?: {
        role?: {
          uid?: unknown
          nickname?: unknown
          avatar?: unknown
          level?: unknown
          created_at?: unknown
          updated_at?: unknown
        }
      }
    } | null
    const role = payload?.data?.role
    if (payload?.code !== 0 || !role || (role.uid !== queryUid && role.uid !== uid)) {
      return null
    }
    return {
      nickname: typeof role.nickname === 'string' ? role.nickname.trim() || null : null,
      avatarUrl: readAvatarUrl(role.avatar),
      level:
        typeof role.level === 'number' && Number.isSafeInteger(role.level) && role.level >= 0
          ? role.level
          : null,
      createdAt: readTimestamp(role.created_at),
      updatedAt: readTimestamp(role.updated_at)
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** 只保留相册展示字段，按 UID 在当前页面复用结果。目录加载和账号切换无需等待请求。 */
export function useGameAlbumProfiles() {
  const profiles = reactive(new Map<string, GameAlbumProfile | null>())
  const pending = new Map<string, Promise<GameAlbumProfile | null>>()

  function loadProfile(uid: string) {
    const cached = profiles.get(uid)
    if (cached) return Promise.resolve(cached)
    const current = pending.get(uid)
    if (current) return current
    const request = (async () => {
      for (const server of profileServers) {
        const profile = await requestProfile(uid, server)
        if (profile) return profile
      }
      return null
    })().then((profile) => {
      profiles.set(uid, profile)
      pending.delete(uid)
      return profile
    })
    pending.set(uid, request)
    return request
  }

  return { profiles, loadProfile }
}
