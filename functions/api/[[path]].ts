import { failure } from '../_lib/http'

/** 未知 API 不访问静态资源，也不返回 SPA 首页。 */
export const onRequest = () => failure(404, 'not_found')
