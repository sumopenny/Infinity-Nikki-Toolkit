import {
  ApiError,
  fail,
  json,
  headers,
  digest,
  cookieFor,
  limit,
  readBody,
  checkOrigin,
  readCloudSession,
  requireCloudAccount,
  type CloudEnv
} from './cloudShared'
export type { Statement, CloudDB, CloudEnv } from './cloudShared'
export { digest } from './cloudShared'
import { argon2idAsync } from '@noble/hashes/argon2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

type CloudStage =
  | 'origin'
  | 'session'
  | 'body-read'
  | 'rate-limit'
  | 'account-read'
  | 'password-hash'
  | 'account-write'
  | 'session-write'

interface User {
  id: string
  username: string
  password_hash: string
}
const opts = { m: 19456, t: 2, p: 1, dkLen: 32, maxmem: 32 * 1024 * 1024 }
const publicUser = (user: User) => ({ id: user.id, username: user.username })
const random = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
/** 固定版本和成本参数，随机盐随哈希保存，便于后续迁移。 */
export async function hashPassword(password: string, salt = random().slice(0, 32)) {
  const hash = await argon2idAsync(password, hexToBytes(salt), opts)
  return `argon2id-v1$${salt}$${bytesToHex(hash)}`
}
/** 等长逐字节比较；不存在的用户也执行同样成本的密码计算。 */
export async function verifyPassword(password: string, stored: string) {
  const [, salt, expected] = stored.split('$')
  const actual = (await hashPassword(password, salt || '0'.repeat(32))).split('$')[2]
  let diff = actual.length ^ (expected?.length ?? 0)
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ (expected?.charCodeAt(i) || 0)
  return diff === 0 && stored.startsWith('argon2id-v1$')
}
/** 云账户 API；所有记录归属来自已验证会话，不接受客户端指定用户。 */
export async function handleCloud(
  request: Request,
  env: CloudEnv,
  onFailure?: (error: unknown, detail: { stage: string; operation: string }) => void
): Promise<Response> {
  // 诊断字段只取服务端生成值和固定枚举，不记录账号、令牌、SQL 或异常原文。
  const requestId = crypto.randomUUID()
  let stage: CloudStage = 'origin'
  const setStage = (value: CloudStage) => {
    stage = value
  }
  const action = new URL(request.url).searchParams.get('action') || 'session'
  const operation = ['session', 'register', 'login', 'logout'].includes(action) ? action : 'unknown'
  try {
    checkOrigin(request)
    if (operation === 'unknown') fail(400, 'INVALID_DATA')
    const db = env.RESONANCE_DB
    if (!db) fail(503, 'NOT_CONFIGURED')
    if (!['GET', 'POST'].includes(request.method)) fail(405, 'METHOD')
    if ((request.method === 'GET') !== (action === 'session')) fail(405, 'METHOD')
    setStage('session')
    const { token, sessionHash, user } = await readCloudSession<User>(db, request)
    if (action === 'session')
      return json(
        { user: user ? publicUser(user) : null },
        token && user ? cookieFor(request, token) : undefined
      )
    if (['register', 'login'].includes(action)) {
      setStage('body-read')
      const body = await readBody(request, 4096)
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
      const password = body.password
      if (
        !/^[a-z0-9_]{4,32}$/.test(username) ||
        typeof password !== 'string' ||
        [...password].length < 6 ||
        [...password].length > 128
      )
        fail(400, 'CREDENTIAL_FORMAT')
      setStage('rate-limit')
      await limit(db, `ip:${await digest(request.headers.get('CF-Connecting-IP') || 'local')}`, 30)
      await limit(db, `account:${username}`, 10)
      setStage('account-read')
      let account = await db
        .prepare('SELECT * FROM cloud_users WHERE username=?')
        .bind(username)
        .first<User>()
      if (action === 'register') {
        if (account) fail(409, 'USERNAME_TAKEN')
        setStage('password-hash')
        const passwordHash = await hashPassword(password)
        setStage('account-write')
        const id = crypto.randomUUID()
        account = await db
          .prepare(
            'INSERT INTO cloud_users(id,username,password_hash) VALUES(?,?,?) ON CONFLICT(username) DO NOTHING RETURNING *'
          )
          .bind(id, username, passwordHash)
          .first<User>()
        if (!account) fail(409, 'USERNAME_TAKEN')
      } else {
        setStage('password-hash')
        if (!(await verifyPassword(password, account?.password_hash || '')) || !account) {
          console.warn('resonance-auth', 'invalid-credentials')
          fail(401, 'CREDENTIALS')
        }
      }
      setStage('session-write')
      const next = random()
      await db.batch([
        db.prepare('DELETE FROM cloud_sessions WHERE token_hash=?').bind(sessionHash),
        db
          .prepare('INSERT INTO cloud_sessions(token_hash,user_id,created_at) VALUES(?,?,?)')
          .bind(await digest(next), account.id, Date.now()),
        db.prepare('DELETE FROM cloud_rate_limits WHERE resets_at<?').bind(Date.now())
      ])
      return json({ user: publicUser(account) }, cookieFor(request, next))
    }
    requireCloudAccount(request, user)
    setStage('session-write')
    await db.prepare('DELETE FROM cloud_sessions WHERE token_hash=?').bind(sessionHash).run()
    return json({ success: true }, cookieFor(request, '', true))
  } catch (error) {
    const known =
      error instanceof ApiError ||
      (error instanceof Error && ['INVALID_DATA', 'TOO_LARGE'].includes(error.message))
    if (!known) onFailure?.(error, { stage, operation })
    if (!known)
      console.error('resonance-cloud', {
        operation,
        stage,
        requestId,
        category:
          error instanceof SyntaxError
            ? 'syntax'
            : error instanceof TypeError
              ? 'type'
              : error instanceof Error
                ? 'runtime'
                : 'unknown'
      })
    return Response.json(
      { error: known ? (error as Error).message : 'SERVER_ERROR' },
      {
        status: error instanceof ApiError ? error.status : known ? 400 : 500,
        headers: { ...headers, 'X-Request-Id': requestId }
      }
    )
  }
}
