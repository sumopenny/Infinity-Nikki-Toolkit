import {
  PEARPAL_USERSCRIPT_PATH,
  resonanceUserscript
} from './src/utils/resonance/resonanceScripts'
import { onRequestGet as shareImageRequest } from './functions/api/share-image'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { assertDiagnosticsBuild } from './scripts/error-build-policy.mjs'
import { errorBuildInfo } from './scripts/error-build'
import { resonanceCloudProxy } from './scripts/resonance-cloud-proxy'
import { onRequestPost as forwardPearpalRequest } from './functions/api/resonance/pearpal'
import { onRequest as clearSiteDataRequest } from './functions/api/clear-site-data'

/** 开发与生产发布同一份可安装脚本，直接返回 JS，避免落入 SPA 页面。 */
function pearpalUserscript(): Plugin {
  return {
    name: 'pearpal-userscript',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== PEARPAL_USERSCRIPT_PATH) return next()
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(resonanceUserscript())
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: PEARPAL_USERSCRIPT_PATH.slice(1),
        source: resonanceUserscript()
      })
    }
  }
}

/** 本地开发复用图片代理，并为退休的手账代理保留明确的 410 响应。 */
function localPearpalApi(): Plugin {
  return {
    name: 'local-pearpal-api',
    configureServer(server) {
      // 本地清理始终留在本地，即使启用了远程 API 代理。
      server.middlewares.use('/api/clear-site-data', (req, res) => {
        const response = clearSiteDataRequest({
          request: new Request(`http://${req.headers.host}/api/clear-site-data`, {
            method: req.method,
            headers: {
              Origin: req.headers.origin ?? '',
              'X-Site-Reset': String(req.headers['x-site-reset'] ?? '')
            }
          })
        })
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end()
      })
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
        const response = await forwardPearpalRequest()
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(await response.text())
      })
    }
  }
}

function getRemoteApiOrigin(mode: string): string | undefined {
  if (mode !== 'remote') return undefined

  const rawOrigin = loadEnv(mode, process.cwd(), '').REMOTE_API_ORIGIN?.trim()
  if (!rawOrigin) {
    throw new Error('remote mode requires REMOTE_API_ORIGIN, for example https://nikkicube.cc.cd')
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
        // 搭配码数据始终由本地 Vite 直连对象存储，不依赖已部署的 Worker handler。
        '/api/outfit-code': outfitCodeProxy,
        // 家园方案数据与搭配码一样直接代理固定 CDN，避免本地远程模式依赖尚未部署的 Worker handler。
        '/api/home-build': homeBuildProxy,
        // 共鸣、衣橱与点赞都访问线上 Workers/D1；云同步额外适配本地同源认证和 Cookie。
        '^/api/resonance/cloud(?:\\?|$)': resonanceCloudProxy(remoteApiOrigin),
        '^/api/archive/cloud(?:\\?|$)': resonanceCloudProxy(remoteApiOrigin),
        // 远程 D1 点赞接口仍转发到 Workers 服务。
        '/api': {
          target: remoteApiOrigin,
          changeOrigin: true,
          secure: remoteApiOrigin.startsWith('https://')
        }
      }
    : {
        // 分享码路径由浏览器 WASM 解出，本地开发服务器代取原始对象以避开浏览器 CORS。
        '/api/outfit-code': outfitCodeProxy,
        '/api/home-build': homeBuildProxy
      }

  return {
    plugins: [vue(), localPearpalApi(), pearpalUserscript()],
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
