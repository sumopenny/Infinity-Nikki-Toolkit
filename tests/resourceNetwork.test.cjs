const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const net = require('node:net')
const { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { spawn } = require('node:child_process')
const {
  createResourceNetwork,
  localProxy,
  systemProxyCandidates
} = require('../scripts/resource-network.cjs')

async function listen(t, server) {
  const sockets = new Set()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    for (const socket of sockets) socket.destroy()
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  })
  return `http://127.0.0.1:${server.address().port}`
}

async function setup(
  t,
  behavior = 'forward',
  originHandler = (_, response) => response.end('{"ok":true}')
) {
  let hits = 0,
    tunnels = 0,
    requests = 0
  const target = await listen(
    t,
    http.createServer((request, response) => {
      hits++
      originHandler(request, response)
    })
  )
  const proxy = http.createServer()
  proxy.on('connect', (request, socket, head) => {
    tunnels++
    if (behavior === 'fail') {
      socket.destroy()
      return
    }
    if (behavior === 'stall') return
    const upstream = net.connect(new URL(target).port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      socket.pipe(upstream)
      upstream.pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('close', () => upstream.destroy())
    socket.on('error', () => upstream.destroy())
  })
  const proxyUrl = await listen(t, proxy)
  const logs = []
  const network = createResourceNetwork({
    env: { HTTPS_PROXY: proxyUrl, NO_PROXY: '' },
    platform: 'linux',
    log: (message) => logs.push(message),
    fetchImpl: (...args) => {
      requests++
      return fetch(...args)
    }
  })
  t.after(() => network.close())
  return { target, proxyUrl, network, logs, counts: () => ({ hits, tunnels, requests }) }
}

test('only configured loopback HTTP/HTTPS proxies are accepted, with Windows protocol mappings', () => {
  assert.equal(localProxy('127.0.0.1:7890').href, 'http://127.0.0.1:7890/')
  assert.equal(localProxy('https://[::1]:7890').hostname, '[::1]')
  assert.equal(localProxy('http://proxy.example.com:7890'), null)
  assert.equal(localProxy('socks5://127.0.0.1:7890'), null)
  assert.deepEqual(systemProxyCandidates('http=127.0.0.1:1;https=127.0.0.1:2;socks=127.0.0.1:3'), [
    '127.0.0.1:2',
    '127.0.0.1:1'
  ])
})

test('a reachable configured proxy carries the actual request through CONNECT', async (t) => {
  const setupData = await setup(t)
  assert.deepEqual(
    await setupData.network.fetchResource(setupData.target, {}, (response) => response.json()),
    { ok: true }
  )
  assert.deepEqual(setupData.counts(), { hits: 1, tunnels: 1, requests: 1 })
  assert.match(setupData.logs[0], /use local proxy/)
})

test('proxy connection failure retries directly once and later requests stay direct', async (t) => {
  const data = await setup(t, 'fail')
  assert.deepEqual(
    await data.network.fetchResource(data.target, { timeoutMs: 500 }, (response) =>
      response.json()
    ),
    { ok: true }
  )
  await data.network.fetchResource(data.target)
  assert.equal(data.counts().requests, 3)
  assert.equal(data.counts().hits, 2)
  assert.equal(data.logs.filter((message) => message.includes('retrying once')).length, 1)
})

test('a proxy timeout gets a fresh direct timeout budget', async (t) => {
  const data = await setup(t, 'stall')
  assert.deepEqual(
    await data.network.fetchResource(data.target, { timeoutMs: 100 }, (response) =>
      response.json()
    ),
    { ok: true }
  )
  assert.equal(data.counts().requests, 2)
})

test('a stalled response body falls back once and stops if direct access also times out', async (t) => {
  const data = await setup(t, 'forward', (_, response) => {
    response.writeHead(200)
    response.write('{')
  })
  await assert.rejects(
    data.network.fetchResource(data.target, { timeoutMs: 100 }, (response) => response.json()),
    (error) => error.name === 'TimeoutError'
  )
  assert.equal(data.counts().requests, 2)
})

test('HTTP errors and invalid JSON do not trigger a direct retry', async (t) => {
  for (const kind of ['http', 'json']) {
    const data = await setup(t, 'forward', (_, response) => {
      response.statusCode = kind === 'http' ? 503 : 200
      response.end('invalid')
    })
    await assert.rejects(data.network.fetchResource(data.target, {}, (response) => response.json()))
    assert.equal(data.counts().requests, 1)
    assert.equal(data.counts().hits, 1)
  }
})

test('unconfigured or stopped proxies use direct access without a proxy attempt', async (t) => {
  const target = await listen(
    t,
    http.createServer((_, response) => response.end('direct'))
  )
  const stoppedServer = http.createServer()
  const stopped = await listen(t, stoppedServer)
  await new Promise((resolve) => stoppedServer.close(resolve))
  for (const env of [{}, { HTTPS_PROXY: stopped }]) {
    let attempts = 0
    const network = createResourceNetwork({
      env: { ...env, NO_PROXY: '' },
      platform: 'linux',
      log: () => {},
      fetchImpl: (...args) => {
        attempts++
        return fetch(...args)
      }
    })
    t.after(() => network.close())
    assert.equal(await network.fetchResource(target), 'direct')
    assert.equal(attempts, 1)
  }
})

test('environment proxy wins over Windows settings and log output redacts credentials', async (t) => {
  const logs = [],
    probed = []
  const network = createResourceNetwork({
    env: { HTTPS_PROXY: 'http://user:secret@127.0.0.1:1234' },
    platform: 'win32',
    readSystemProxy: async () => 'https=127.0.0.1:5678',
    probe: async (url) => {
      probed.push(url.port)
      return true
    },
    log: (message) => logs.push(message),
    fetchImpl: async () => ({ ok: true, text: async () => 'ok' })
  })
  t.after(() => network.close())
  assert.equal(await network.fetchResource('https://resource.example.test'), 'ok')
  assert.deepEqual(probed, ['1234'])
  assert(!logs.join('').includes('secret'))
  assert(!logs.join('').includes('user'))
})

test('Windows manual proxy is used when environment candidates are unavailable', async (t) => {
  const probed = []
  const network = createResourceNetwork({
    env: { HTTPS_PROXY: 'http://127.0.0.1:1234' },
    platform: 'win32',
    readSystemProxy: async () => 'http=127.0.0.1:5678;https=127.0.0.1:7890',
    probe: async (url) => {
      probed.push(url.port)
      return url.port === '7890'
    },
    log: () => {},
    fetchImpl: async () => ({ ok: true, text: async () => 'ok' })
  })
  t.after(() => network.close())
  assert.equal(await network.fetchResource('https://resource.example.test'), 'ok')
  assert.deepEqual(probed, ['1234', '7890'])
})

test('NO_PROXY bypasses discovery for matching hosts and local endpoints', async (t) => {
  const network = createResourceNetwork({
    env: { NO_PROXY: '.example.test,localhost,127.0.0.1' },
    platform: 'win32',
    readSystemProxy: async () => {
      throw new Error('must not discover')
    },
    fetchImpl: async () => ({ ok: true, text: async () => 'direct' })
  })
  t.after(() => network.close())
  assert.equal(await network.fetchResource('https://resources.example.test'), 'direct')
  assert.equal(await network.fetchResource('http://127.0.0.1:5173'), 'direct')
})

test('item updater CLI retains its local snapshot and continues, while explicit strict mode fails', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nikki-resource-network-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'scripts'))
  await mkdir(join(directory, 'src/data'), { recursive: true })
  for (const file of ['resource-network.cjs', 'generate-item-catalog.cjs'])
    await copyFile(resolve(__dirname, '../scripts', file), join(directory, 'scripts', file))
  const snapshot = '{"existing":"local snapshot"}\n'
  const output = join(directory, 'src/data/itemCatalog.json')
  await writeFile(output, snapshot)
  const target = await listen(
    t,
    http.createServer((_, response) => {
      response.writeHead(503)
      response.end('unavailable')
    })
  )
  for (const strict of [false, true]) {
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(
        process.execPath,
        [
          join(directory, 'scripts/generate-item-catalog.cjs'),
          '--remote',
          '--base-url',
          target,
          ...(strict ? ['--strict'] : [])
        ],
        {
          env: { ...process.env, NO_PROXY: '*', NODE_PATH: resolve(__dirname, '../node_modules') },
          windowsHide: true
        }
      )
      let text = ''
      child.stdout.on('data', (data) => {
        text += data
      })
      child.stderr.on('data', (data) => {
        text += data
      })
      child.on('error', reject)
      child.on('close', (code) => resolveResult({ code, text }))
    })
    assert.equal(result.code, strict ? 1 : 0, result.text)
    assert.match(result.text, /503/)
    assert.equal(await readFile(output, 'utf8'), snapshot)
  }
})

// 无默认本机目录时应直接提示用法，不读取或改写已有图鉴。
test('item updater requires an explicit local source or remote mode', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nikki-item-source-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const output = join(directory, 'catalog.json')
  await writeFile(output, '{"kept":true}')
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [resolve(__dirname, '../scripts/generate-item-catalog.cjs'), '--out', output],
      {
        env: { ...process.env, GONGEO_ROOT: '' },
        windowsHide: true
      }
    )
    let stderr = ''
    child.stderr.on('data', (data) => {
      stderr += data
    })
    child.on('error', reject)
    child.on('close', (code) => resolveResult({ code, stderr }))
  })
  assert.equal(result.code, 1)
  assert.match(result.stderr, /Specify a Gongeo directory or --remote/)
  assert.equal(await readFile(output, 'utf8'), '{"kept":true}')
})
