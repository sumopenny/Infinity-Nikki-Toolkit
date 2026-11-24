import { reactive } from 'vue'
import { PEARPAL_REGIONS } from '../utils/resonance/pearpalRegions'

const { api, clientId } = PEARPAL_REGIONS.cn
const profileUrl = `${api}/v1/strategy/user/info/get`

async function requestNickname(uid: string): Promise<string | null> {
  const queryUid = Number(uid)
  if (!Number.isSafeInteger(queryUid) || queryUid <= 0 || String(queryUid) !== uid) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(profileUrl, {
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
      data?: { role?: { uid?: unknown; nickname?: unknown } }
    } | null
    const role = payload?.data?.role
    if (
      payload?.code !== 0 ||
      !role ||
      (role.uid !== queryUid && role.uid !== uid) ||
      typeof role.nickname !== 'string'
    ) {
      return null
    }
    return role.nickname.trim() || null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** 昵称仅用于显示。当前页面内按 UID 复用结果，目录加载和账号切换可独立完成。 */
export function useGameAlbumNicknames() {
  const nicknames = reactive(new Map<string, string | null>())
  const pending = new Set<string>()

  function loadNickname(uid: string) {
    if (nicknames.has(uid) || pending.has(uid)) return
    pending.add(uid)
    void requestNickname(uid).then((nickname) => {
      nicknames.set(uid, nickname)
      pending.delete(uid)
    })
  }

  return { nicknames, loadNickname }
}
