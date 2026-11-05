import { onRequestGet as shareImageRequest } from './functions/api/share-image'
import {
  communityResourcesPaused,
  isPausedCommunityRoute,
  officialHomeCoverOrigin
} from './src/communityResources'
import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite'
import vue from '@vitejs/plugin-vue'
import { assertDiagnosticsBuild } from './scripts/error-build-policy.mjs'
import { errorBuildInfo } from './scripts/error-build'
import { resonanceCloudProxy } from './scripts/resonance-cloud-proxy'
import { onRequestPost as forwardPearpalRequest } from './functions/api/resonance/pearpal'

const blockPausedResources: Connect.NextHandleFunction = (req, res, next) => {
  if (!isPausedCommunityRoute(new URL(req.url ?? '/', 'http://localhost').pathname)) return next()
  res.writeHead(503, { 'cache-control': 'no-store' }).end()
}

/** 本地开发复用 Pages Function：只接受固定 POST 动作，并沿用凭据校验、超时与禁缓存响应。 */
function localPearpalApi(): Plugin {
  return {
    name: 'local-pearpal-api',
    configurePreviewServer(server) {
      server.middlewares.use(blockPausedResources)
    },
    configureServer(server) {
      server.middlewares.use(blockPausedResources)
      server.middlewares.use('/api/share-image', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end()
          return
        }
        const response = await shareImageRequest({
          request: new Request(`http://localhost/api/share-image${req.url ?? ''}`)
        })
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
      server.middlewares.use('/api/errors', (_req, res) => {
        res.statusCode = 204
        res.end()
      })
      server.middlewares.use('/api/resonance/pearpal', async (req, res) => {
        res.setHeader('cache-control', 'no-store, no-cache, must-revalidate')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'method_not_allowed' }))
          return
        }
        try {
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of req) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            size += bytes.length
            if (size > 8192) {
              res.statusCode = 413
              res.end(JSON.stringify({ error: 'request_too_large' }))
              return
            }
            chunks.push(bytes)
          }
          const request = new Request(`http://localhost/api/resonance/pearpal${req.url ?? ''}`, {
            method: 'POST',
            headers: req.headers as HeadersInit,
            body: Buffer.concat(chunks)
          })
          const response = await forwardPearpalRequest({ request })
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch {
          res.statusCode = 502
          res.end(JSON.stringify({ error: 'upstream_unavailable' }))
        }
      })
    }
  }
}

function getRemoteApiOrigin(mode: string): string | undefined {
  if (mode !== 'remote') return undefined

  const rawOrigin = loadEnv(mode, process.cwd(), '').REMOTE_API_ORIGIN?.trim()
  if (!rawOrigin) {
    throw new Error('remote mode requires REMOTE_API_ORIGIN, for example https://example.pages.dev')
  }

  let origin: URL
  try {
    origin = new URL(rawOrigin)
  } catch {
    throw new Error(`REMOTE_API_ORIGIN is not a valid URL: ${rawOrigin}`)
  }

  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    throw new Error('REMOTE_API_ORIGIN must use http:// or https://')
  }

  return origin.origin
}

export default defineConfig(({ mode, command }) => {
  assertDiagnosticsBuild({ ...process.env, ...loadEnv(mode, process.cwd(), '') }, command)
  const diagnosticBuild = errorBuildInfo()
  const remoteApiOrigin = getRemoteApiOrigin(mode)
  const outfitCodeProxy = {
    target: 'https://x6cn-clothdiydata.nuanpaper.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/api\/outfit-code/, '/default') + '.json'
  }
  const homeBuildProxy = {
    target: 'https://x6cn-home-build-data.nuanpaper.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/api\/home-build/, '/default')
  }
  const apiProxy = remoteApiOrigin
    ? {
        // 搭配码数据始终由本地 Vite 直连对象存储，不依赖已部署的 Pages Function。
        '/api/outfit-code': outfitCodeProxy,
        // 家园方案数据与搭配码一样直接代理固定 CDN，避免本地远程模式依赖尚未部署的 Pages Function。
        '/api/home-build': homeBuildProxy,
        // 图鉴 API 通过本地开发服务器转发，避免浏览器直接触发跨域限制。
        '/api/gongeo': {
          target: 'https://data.gongeo.us',
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) => path.replace(/^\/api\/gongeo/, '/v1')
        },
        // 共鸣、衣橱与点赞都访问线上 Pages/D1；云同步额外适配本地同源认证和 Cookie。
        '^/api/resonance/cloud(?:\\?|$)': resonanceCloudProxy(remoteApiOrigin),
        '^/api/wardrobe/cloud(?:\\?|$)': resonanceCloudProxy(remoteApiOrigin),
        '^/api/archive/cloud(?:\\?|$)': resonanceCloudProxy(remoteApiOrigin),
        // 远程 D1 点赞接口仍转发到 Pages 服务。
        '/api': {
          target: remoteApiOrigin,
          changeOrigin: true,
          secure: remoteApiOrigin.startsWith('https://')
        }
      }
    : {
        // 分享码路径由浏览器 WASM 解出，本地开发服务器代取原始对象以避开浏览器 CORS。
        '/api/outfit-code': outfitCodeProxy,
        '/api/home-build': homeBuildProxy,
        // 图鉴 API 通过本地开发服务器转发，避免浏览器直接触发跨域限制。
        '/api/gongeo': {
          target: 'https://data.gongeo.us',
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) => path.replace(/^\/api\/gongeo/, '/v1')
        }
      }

  return {
    plugins: [
      vue(),
      localPearpalApi(),
      {
        name: 'paused-community-network',
        transformIndexHtml() {
          if (!communityResourcesPaused) return
          return [
            {
              tag: 'meta',
              injectTo: 'head-prepend',
              attrs: {
                'http-equiv': 'Content-Security-Policy',
                content: `img-src 'self' blob: data: ${officialHomeCoverOrigin}; connect-src 'self' blob: data:`
              }
            }
          ]
        }
      }
    ],
    define: { __ERROR_BUILD__: JSON.stringify(diagnosticBuild) },
    build: { sourcemap: false },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: apiProxy
    },
    preview: {
      host: '0.0.0.0',
      port: 4173
    }
  }
})
