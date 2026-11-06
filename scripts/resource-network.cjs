const net = require('node:net')
const { execFile } = require('node:child_process')
const { Agent, ProxyAgent } = require('undici')

/** 只接受已配置的本机 HTTP/HTTPS 代理，不扫描端口，也不修改系统配置。 */
function localProxy(value) {
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`)
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !(host === 'localhost' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host))
    )
      return null
    return url
  } catch {
    return null
  }
}

/** Windows 手动系统代理由注册表读取；PAC 和 SOCKS 配置不猜测为 HTTP 代理。 */
function readWindowsProxy() {
  return new Promise((resolve) => {
    const command =
      "$p=Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; if($p.ProxyEnable -eq 1){[Console]::Write($p.ProxyServer)}"
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { timeout: 1500, windowsHide: true, encoding: 'utf8' },
      (error, stdout) => resolve(error ? '' : stdout.trim())
    )
  })
}

function systemProxyCandidates(value) {
  if (!value.includes('=')) return [value]
  const settings = new Map(value.split(';').map((part) => part.trim().split('=')))
  return [settings.get('https'), settings.get('http')].filter(Boolean)
}

/** TCP 探测仅验证代理监听是否存在；真正不可用时由请求级直连兜底。 */
function probeProxy(url, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80))
    })
    const finish = (result) => {
      socket.destroy()
      resolve(result)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(timeoutMs, () => finish(false))
  })
}

/** 保留用户的 NO_PROXY 主机、域名后缀及端口规则，本地资源端点默认不经过代理。 */
function bypassProxy(url, rules) {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return rules.split(',').some((value) => {
    const rule = value.trim().toLowerCase()
    if (!rule) return false
    if (rule === '*') return true
    if (rule === host || rule === url.host.toLowerCase()) return true
    const suffix = rule.replace(/^\*?\./, '')
    return host === suffix || host.endsWith(`.${suffix}`)
  })
}

/** 仅网络连接和超时触发直连；HTTP 状态和正文校验失败继续交给原更新脚本处理。 */
function connectionFailure(error) {
  const codes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'EPIPE',
    'ETIMEDOUT',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_SOCKET',
    'UND_ERR_ABORTED'
  ])
  for (let current = error; current; current = current.cause) {
    if (current.name === 'TimeoutError' || codes.has(current.code)) return true
  }
  return false
}

/** 一次进程级检测，环境变量优先于系统代理；代理网络失败只再直连一次，正文也纳入超时。 */
function createResourceNetwork({
  env = process.env,
  platform = process.platform,
  readSystemProxy = readWindowsProxy,
  probe = probeProxy,
  log = (message) => console.log(message),
  fetchImpl = (...args) => globalThis.fetch(...args)
} = {}) {
  const direct = new Agent()
  let proxyAgent
  let discovery
  let useDirect = false
  async function discover() {
    const values = [env.HTTPS_PROXY, env.https_proxy, env.HTTP_PROXY, env.http_proxy].filter(
      Boolean
    )
    if (platform === 'win32') values.push(...systemProxyCandidates(await readSystemProxy()))
    const seen = new Set()
    for (const value of values) {
      const proxy = localProxy(value)
      if (!proxy || seen.has(proxy.href)) continue
      seen.add(proxy.href)
      if (!(await probe(proxy))) continue
      proxyAgent = new ProxyAgent(proxy.href)
      // 仅输出主机和端口，不输出代理用户名或密码。
      log(`[network] Resource updates use local proxy: ${proxy.host}`)
      return proxyAgent
    }
    log('[network] No available configured local proxy; resource updates use direct network.')
    return null
  }
  async function fetchResource(
    url,
    { timeoutMs = 15000, headers } = {},
    read = (response) => response.text()
  ) {
    const target = new URL(url)
    const noProxy = env.NO_PROXY ?? env.no_proxy ?? 'localhost,127.0.0.1,::1'
    const selected =
      bypassProxy(target, noProxy) || useDirect ? null : await (discovery ??= discover())
    const attempt = async (dispatcher) => {
      const controller = new AbortController()
      const timer = setTimeout(
        () => controller.abort(new DOMException('Resource request timed out', 'TimeoutError')),
        timeoutMs
      )
      try {
        const response = await fetchImpl(url, { headers, signal: controller.signal, dispatcher })
        if (!response.ok) {
          await response.body?.cancel()
          throw new Error(`HTTP ${response.status}: ${url}`)
        }
        return await read(response)
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason
        throw error
      } finally {
        clearTimeout(timer)
      }
    }
    try {
      return await attempt(selected || direct)
    } catch (error) {
      if (!selected || !connectionFailure(error)) throw error
      if (!useDirect)
        log(
          '[network] Local proxy connection failed or timed out; retrying once via direct network.'
        )
      useDirect = true
      return attempt(direct)
    }
  }
  return {
    fetchResource,
    close: async () => {
      await discovery
      await Promise.all([direct.close(), proxyAgent?.close()])
    }
  }
}

const network = createResourceNetwork()
module.exports = {
  fetchResource: network.fetchResource,
  createResourceNetwork,
  localProxy,
  systemProxyCandidates
}
