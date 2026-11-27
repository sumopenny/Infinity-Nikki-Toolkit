import type { ProxyOptions } from 'vite'
import type { TLSSocket } from 'node:tls'

/** 本地开发经 Pages 读写真实 D1；仅转换本地同源请求，不放宽线上来源校验。 */
export function resonanceCloudProxy(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure: target.startsWith('https://'),
    cookieDomainRewrite: '',
    configure(proxy) {
      proxy.on('proxyReq', (outgoing, incoming) => {
        const protocol = (incoming.socket as TLSSocket).encrypted ? 'https:' : 'http:'
        if (incoming.headers.origin === `${protocol}//${incoming.headers.host}`) {
          outgoing.setHeader('Origin', new URL(target).origin)
        }
      })
      proxy.on('proxyRes', (response, incoming) => {
        // HTTP 开发环境仅移除共鸣 Cookie 的 Secure；HttpOnly/SameSite 及线上响应不变。
        if ((incoming.socket as TLSSocket).encrypted) return
        const cookies = response.headers['set-cookie']
        if (cookies)
          response.headers['set-cookie'] = cookies.map((cookie) =>
            cookie.startsWith('resonance_session=')
              ? cookie.replace(/;\s*Secure(?=;|$)/gi, '')
              : cookie
          )
      })
    }
  }
}
