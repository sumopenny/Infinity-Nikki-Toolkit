export const failure = (status: number, error: string, allow?: string) =>
  Response.json(
    { error },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...(allow ? { Allow: allow } : {})
      }
    }
  )

/** 方法专用处理器未匹配时返回 405，避免 Pages 继续回退静态页面。 */
export const methodNotAllowed = (allow: string) => () => failure(405, 'method_not_allowed', allow)
