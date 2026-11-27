import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

/** 测试实际 Pages 编译产物，避免测试专用路由掩盖部署差异。 */
export function pagesBundle(): string {
  const directory = mkdtempSync(join(tmpdir(), 'nikki-pages-bundle-'))
  try {
    const outfile = join(directory, 'index.js')
    execFileSync(
      process.execPath,
      [
        'node_modules/wrangler/bin/wrangler.js',
        'pages',
        'functions',
        'build',
        '--outdir',
        directory
      ],
      { stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } }
    )
    return readFileSync(outfile, 'utf8')
  } finally {
    if (resolve(directory).startsWith(resolve(tmpdir()) + sep))
      rmSync(directory, { recursive: true, force: true })
  }
}
