import { methodNotAllowed } from '../_lib/http'

// 点赞计数接口：GET 返回当前总数，POST 自增 1 并返回新总数（不限次数）。
// 数据落在 D1 单行计数器表 like_counter，绑定名固定为 DB（见 wrangler.toml 与 Pages 控制台绑定）。
// Pages 根据文件路径自动路由：/functions/api/like.ts → /api/like。

interface D1PreparedStatementMinimal {
  first<T = Record<string, unknown>>(): Promise<T | null>
}

interface D1DatabaseMinimal {
  prepare(query: string): D1PreparedStatementMinimal
}

interface LikeFunctionEnv {
  DB: D1DatabaseMinimal
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
} as const

/** 读取当前点赞总数。参数：env.DB 为 D1 绑定。返回：{ count } JSON 响应。 */
export async function onRequestGet(context: { env: LikeFunctionEnv }): Promise<Response> {
  const row = await context.env.DB.prepare('SELECT count FROM like_counter WHERE id = 1').first<{
    count: number
  }>()

  return Response.json({ count: row?.count ?? 0 }, { headers: JSON_HEADERS })
}

/** 点赞一次（自增并返回新总数）。参数：env.DB 为 D1 绑定。返回：{ count } JSON 响应。 */
export async function onRequestPost(context: { env: LikeFunctionEnv }): Promise<Response> {
  const row = await context.env.DB.prepare(
    'INSERT INTO like_counter (id, count) VALUES (1, 1) ' +
      'ON CONFLICT(id) DO UPDATE SET count = count + 1 ' +
      'RETURNING count'
  ).first<{ count: number }>()

  return Response.json({ count: row?.count ?? 0 }, { headers: JSON_HEADERS })
}

export const onRequest = methodNotAllowed('GET, POST')
