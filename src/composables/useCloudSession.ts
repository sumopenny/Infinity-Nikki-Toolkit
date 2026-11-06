import { onMounted, onBeforeUnmount, shallowRef, readonly } from 'vue'
import { cloudRequest, type CloudUser } from '../utils/resonance/cloudClient'

/** 网络类型声明不等于运行时契约；仅接受明确的用户对象或 session 空值。 */
function readSessionUser(result: unknown, allowNull: boolean): CloudUser | null {
  if (result && typeof result === 'object' && !Array.isArray(result) && 'user' in result) {
    const account = result.user
    if (account === null && allowNull) return null
    if (
      account &&
      typeof account === 'object' &&
      !Array.isArray(account) &&
      'id' in account &&
      typeof account.id === 'string' &&
      account.id.trim().length > 0 &&
      'username' in account &&
      typeof account.username === 'string' &&
      /^[a-zA-Z0-9_]{4,32}$/.test(account.username)
    )
      return { id: account.id, username: account.username }
  }
  throw new Error('SERVER_ERROR')
}

/** 独立工厂便于隔离测试；代次阻止旧 session 请求覆盖新登录。 */
export function createCloudSession(request = cloudRequest) {
  const user = shallowRef<CloudUser | null>(null)
  let version = 0
  let pending: Promise<void> | null = null
  let authenticating = false
  function invalidate() {
    version++
    pending = null
    user.value = null
  }
  function refresh(): Promise<void> {
    if (authenticating) return Promise.resolve()
    if (pending) return pending
    const current = version
    const job = request<unknown>('session')
      .then((result) => {
        const account = readSessionUser(result, true)
        if (current === version) user.value = account
      })
      .finally(() => {
        if (pending === job) pending = null
      })
    pending = job
    return job
  }
  async function authenticate(
    action: 'login' | 'register',
    username: string,
    password: string,
    confirmation: string
  ) {
    if (
      !/^[a-zA-Z0-9_]{4,32}$/.test(username.trim()) ||
      [...password].length < 6 ||
      [...password].length > 128
    )
      throw new Error('CREDENTIAL_FORMAT')
    if (action === 'register' && password !== confirmation) throw new Error('PASSWORD_MISMATCH')
    if (authenticating) throw new Error('BUSY')
    authenticating = true
    const current = ++version
    pending = null
    try {
      const result = await request<unknown>(action, null, { username, password })
      const account = readSessionUser(result, false)
      if (current === version) user.value = account
    } finally {
      authenticating = false
    }
  }
  async function logout() {
    const account = user.value
    version++
    pending = null
    try {
      const result = await request<{ success?: unknown }>('logout', account, {})
      if (!result || result.success !== true) throw new Error('SERVER_ERROR')
      invalidate()
    } catch (error) {
      await refresh()
      if (user.value) throw error
    }
  }
  return { user: readonly(user), refresh, authenticate, logout, invalidate }
}

const session = createCloudSession()
let consumers = 0
let channel: BroadcastChannel | null = null
const refresh = () => {
  if (document.visibilityState === 'visible') void session.refresh().catch(() => {})
}
/** 广播只表示会话失效；真实账号始终重新向服务端查询。 */
export function useCloudSession() {
  onMounted(() => {
    if (consumers++ === 0) {
      document.addEventListener('visibilitychange', refresh)
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('nikki-cloud-session')
        channel.onmessage = () => {
          session.invalidate()
          refresh()
        }
      }
    }
  })
  onBeforeUnmount(() => {
    if (--consumers === 0) {
      document.removeEventListener('visibilitychange', refresh)
      channel?.close()
      channel = null
    }
  })
  return {
    ...session,
    async authenticate(...args: Parameters<typeof session.authenticate>) {
      await session.authenticate(...args)
      channel?.postMessage('changed')
    },
    async logout() {
      await session.logout()
      channel?.postMessage('changed')
    }
  }
}
