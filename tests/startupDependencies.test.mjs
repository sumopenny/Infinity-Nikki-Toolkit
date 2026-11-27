import test from 'node:test'
import assert from 'node:assert/strict'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createServer as createHttpServer, get as httpGet } from 'node:http'
import { ensureDependencies, inspectDependencies } from '../start/ensure-dependencies.mjs'

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)))
const stateFile = (dir) => join(dir, 'node_modules', '.nikkicube-dependencies.json')
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value))
}
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'nikki startup test '))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeJson(join(dir, 'package.json'), {
    private: true,
    dependencies: { snappyjs: '^0.7.0' },
    devDependencies: { vite: '^5.4.11', '@types/node': '22.18.6' }
  })
  writeJson(join(dir, 'package-lock.json'), {
    lockfileVersion: 3,
    packages: {
      'node_modules/snappyjs': { version: '0.7.0' },
      'node_modules/vite': { version: '5.4.21' },
      'node_modules/@types/node': { version: '22.18.6' },
      'node_modules/transitive': { version: '1.0.0' }
    }
  })
  return dir
}
function installFixture(dir) {
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'))
  for (const [location, entry] of Object.entries(lock.packages)) {
    writeJson(join(dir, location, 'package.json'), { version: entry.version })
  }
}
const options = (dir, install = installFixture) => ({ projectDir: dir, install, log: () => {} })

test('check-only identifies the missing dependency without installing or recording success', (t) => {
  const dir = fixture(t)
  writeJson(join(dir, 'node_modules/vite/package.json'), { version: '5.4.21' })
  let calls = 0
  const result = ensureDependencies({ ...options(dir, () => calls++), checkOnly: true })
  assert.equal(result.ready, false)
  assert.equal(calls, 0)
  assert.ok(inspectDependencies(dir).packageProblems.includes('Missing dependency: snappyjs'))
  assert.equal(existsSync(stateFile(dir)), false)
})

test('a verified installation skips the next install, including in a path with spaces', (t) => {
  const dir = fixture(t)
  let calls = 0
  const install = () => {
    calls++
    installFixture(dir)
  }
  assert.equal(ensureDependencies(options(dir, install)).installed, true)
  assert.deepEqual(ensureDependencies(options(dir, install)), { ready: true, installed: false })
  assert.equal(calls, 1)
})

test('a missing dependency invalidates an otherwise current marker', (t) => {
  const dir = fixture(t)
  ensureDependencies(options(dir))
  rmSync(join(dir, 'node_modules/snappyjs'), { recursive: true })
  assert.equal(ensureDependencies(options(dir)).installed, true)
  assert.equal(inspectDependencies(dir).reasons.length, 0)
})

test('a transitive lockfile change triggers synchronization even when direct versions match', (t) => {
  const dir = fixture(t)
  ensureDependencies(options(dir))
  const lockPath = join(dir, 'package-lock.json')
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  lock.packages['node_modules/transitive'].version = '2.0.0'
  writeJson(lockPath, lock)
  assert.equal(ensureDependencies(options(dir)).installed, true)
})

test('package.json changes also trigger synchronization', (t) => {
  const dir = fixture(t)
  ensureDependencies(options(dir))
  const manifestPath = join(dir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies.snappyjs = '0.7.0'
  writeJson(manifestPath, manifest)
  assert.equal(ensureDependencies(options(dir)).installed, true)
})

test('a wrong installed version is repaired despite a current marker', (t) => {
  const dir = fixture(t)
  ensureDependencies(options(dir))
  writeJson(join(dir, 'node_modules/snappyjs/package.json'), { version: '0.6.0' })
  assert.equal(ensureDependencies(options(dir)).installed, true)
  assert.equal(inspectDependencies(dir).reasons.length, 0)
})

test('installation failure never records success', (t) => {
  const dir = fixture(t)
  assert.throws(
    () =>
      ensureDependencies(
        options(dir, () => {
          throw new Error('network unavailable')
        })
      ),
    /network unavailable/
  )
  assert.equal(existsSync(stateFile(dir)), false)
})

test('an installer reporting success with a dependency still missing is rejected', (t) => {
  const dir = fixture(t)
  ensureDependencies(options(dir))
  rmSync(join(dir, 'node_modules/snappyjs'), { recursive: true })
  assert.throws(
    () => ensureDependencies(options(dir, () => {})),
    /installation is incomplete.*snappyjs/
  )
  assert.equal(ensureDependencies({ ...options(dir), checkOnly: true }).ready, false)
})

test('dependency files changing during installation are not recorded as verified', (t) => {
  const dir = fixture(t)
  assert.throws(
    () =>
      ensureDependencies(
        options(dir, () => {
          installFixture(dir)
          const manifestPath = join(dir, 'package.json')
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
          manifest.description = 'changed during installation'
          writeJson(manifestPath, manifest)
        })
      ),
    /changed during installation/
  )
  assert.equal(existsSync(stateFile(dir)), false)
})

test(
  'Windows install dispatch uses npm ci with dev dependencies and propagates failure',
  { skip: process.platform !== 'win32' },
  (t) => {
    const dir = fixture(t)
    mkdirSync(join(dir, 'start'))
    copyFileSync(
      join(repoDir, 'start/ensure-dependencies.mjs'),
      join(dir, 'start/ensure-dependencies.mjs')
    )
    const fakeBin = join(dir, 'fake-bin')
    mkdirSync(fakeBin)
    writeFileSync(
      join(fakeBin, 'npm.cmd'),
      '@echo off\r\necho %*>"%~dp0npm-args.txt"\r\nexit /b 1\r\n'
    )
    const env = { ...process.env }
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path'
    env[pathKey] = fakeBin + ';' + env[pathKey]
    const result = spawnSync(process.execPath, [join(dir, 'start/ensure-dependencies.mjs')], {
      env,
      encoding: 'utf8'
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /npm ci failed/)
    assert.equal(readFileSync(join(fakeBin, 'npm-args.txt'), 'utf8').trim(), 'ci --include=dev')
    assert.equal(existsSync(stateFile(dir)), false)
  }
)

test(
  'the remote D1 launcher stops before opening the website when the dependency check fails',
  { skip: process.platform !== 'win32' },
  (t) => {
    const name = 'Start-Remote-D1-Website.bat'
    const dir = fixture(t)
    const startDir = join(dir, 'start')
    mkdirSync(startDir)
    copyFileSync(join(repoDir, 'start', name), join(startDir, name))
    writeFileSync(join(startDir, 'ensure-dependencies.mjs'), 'process.exit(1)\n')
    // 只验证启动脚本的失败短路，不依赖测试机全局安装 npm/node。
    const fakeBin = join(dir, 'launcher-bin')
    mkdirSync(fakeBin)
    writeFileSync(join(fakeBin, 'npm.cmd'), '@echo off\r\nexit /b 0\r\n')
    const env = { ...process.env }
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path'
    env[pathKey] = fakeBin + ';' + dirname(process.execPath) + ';' + env[pathKey]
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', name], {
      cwd: startDir,
      env,
      input: '\r\n',
      encoding: 'utf8',
      timeout: 10000
    })
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout, /Website startup stopped/)
    assert.doesNotMatch(result.stdout, /Starting local website/)
  }
)

/** 使用真实 Vite 生命周期验证监听成功才打开，避免用固定延时模拟“就绪”。 */
test('launcher browser opening waits for Vite initialization and a listening HTTP server', async (t) => {
  const batch = readFileSync(join(repoDir, 'start/Start-Remote-D1-Website.bat'), 'ascii')
  assert.match(batch, /npm run dev --/)
  assert.match(batch, /--port 5173 --strictPort --open http:\/\/localhost:5173/)
  assert.doesNotMatch(batch, /timeout \/t 4|start "" http:\/\/localhost:5173/)
  const { createServer } = await import('vite')
  const dir = fixture(t)
  writeFileSync(join(dir, 'index.html'), '<html><body>startup-ready-test</body></html>')
  const reserved = createHttpServer()
  await new Promise((resolve) => reserved.listen(0, '127.0.0.1', resolve))
  const port = reserved.address().port
  await new Promise((resolve) => reserved.close(resolve))
  let release, initialized
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const entered = new Promise((resolve) => {
    initialized = resolve
  })
  const server = await createServer({
    configFile: false,
    root: dir,
    logLevel: 'silent',
    css: { postcss: {} },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port, strictPort: true, open: true },
    plugins: [
      {
        name: 'startup-gate',
        async buildStart() {
          initialized()
          await gate
        }
      }
    ]
  })
  t.after(() => server.close())
  let opened = 0,
    response
  // 截获浏览器打开动作，验证 HTTP 可访问，不启动测试机的默认浏览器。
  server.openBrowser = () => {
    opened++
    assert.equal(server.httpServer.listening, true)
    response = new Promise((resolve, reject) => {
      httpGet(`http://127.0.0.1:${port}/`, { agent: false }, (result) => {
        let html = ''
        result.on('data', (data) => {
          html += data
        })
        result.on('end', () => resolve({ status: result.statusCode, html }))
      }).on('error', reject)
    })
  }
  const starting = server.listen()
  await entered
  assert.equal(opened, 0)
  assert.equal(server.httpServer.listening, false)
  release()
  await starting
  assert.equal(opened, 1)
  const result = await response
  assert.equal(result.status, 200)
  assert.match(result.html, /startup-ready-test/)
})

test('a strict-port startup failure never opens the browser', async (t) => {
  const { createServer } = await import('vite')
  const occupied = createHttpServer()
  await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => occupied.close(resolve)))
  const server = await createServer({
    configFile: false,
    root: fixture(t),
    logLevel: 'silent',
    css: { postcss: {} },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: occupied.address().port, strictPort: true, open: true }
  })
  t.after(() => server.close())
  let opened = 0
  server.openBrowser = () => {
    opened++
  }
  await assert.rejects(server.listen(), /already in use/)
  assert.equal(opened, 0)
})

test('development and Cloudflare builds use existing resource JSON', () => {
  const { scripts } = JSON.parse(readFileSync(join(repoDir, 'package.json'), 'utf8'))
  assert.equal(scripts.predev, undefined)
  assert.equal(scripts['build:cloudflare'], 'npm run build')
  assert.equal(scripts.build, 'vue-tsc --noEmit && vite build')
  assert.equal(scripts['resources:update'], 'npm run resources:update:gongeo')
})

for (const scenario of ['success', 'update-failure', 'dependency-failure']) {
  test(`manual resource BAT reports ${scenario}`, { skip: process.platform !== 'win32' }, (t) => {
    const dir = fixture(t)
    mkdirSync(join(dir, 'start'))
    mkdirSync(join(dir, 'scripts'))
    const name = 'Update-Resources.bat'
    const batch = readFileSync(join(repoDir, 'start', name))
    assert.ok(
      batch.every((byte) => byte < 128),
      'BAT must contain only ASCII'
    )
    writeFileSync(join(dir, 'start', name), batch)
    writeFileSync(
      join(dir, 'start', 'ensure-dependencies.mjs'),
      `process.exit(${scenario === 'dependency-failure' ? 1 : 0})`
    )
    writeFileSync(
      join(dir, 'scripts', 'update-gongeo-catalog.mjs'),
      `
      import { writeFileSync } from 'node:fs'
      writeFileSync('update-args.json', JSON.stringify(process.argv.slice(2)))
      process.exit(${scenario === 'update-failure' ? 1 : 0})
    `
    )
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', name], {
      cwd: join(dir, 'start'),
      env: process.env,
      input: '\r\n',
      encoding: 'utf8',
      timeout: 10000
    })
    assert.equal(result.status, scenario === 'success' ? 0 : 1, result.stdout + result.stderr)
    if (scenario === 'dependency-failure') {
      assert.match(result.stdout, /Resource update stopped/)
      assert.equal(existsSync(join(dir, 'update-args.json')), false)
    } else {
      assert.deepEqual(JSON.parse(readFileSync(join(dir, 'update-args.json'), 'utf8')), [
        '--strict'
      ])
      assert.match(
        result.stdout,
        scenario === 'success' ? /Resource update completed/ : /Resource update failed/
      )
    }
    if (scenario !== 'success') assert.doesNotMatch(result.stdout, /Resource update completed/)
  })
}
