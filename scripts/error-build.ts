import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { BuildInfo } from '../src/utils/errorReporting/schema'

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return ''
  }
}
export function errorBuildInfo(): BuildInfo {
  const builtAt = new Date().toISOString()
  const gitCommit = process.env.WORKERS_CI_COMMIT_SHA || git('rev-parse', 'HEAD')
  const version =
    readFileSync('src/i18n/messages/updateLog.ts', 'utf8').match(
      /currentVersion:\s*['"]([^'"]+)['"]/
    )?.[1] ?? 'unknown'
  const environment =
    process.env.ERROR_DEPLOYMENT_ENV ||
    (process.env.WORKERS_CI_BRANCH
      ? process.env.WORKERS_CI_BRANCH === 'main'
        ? 'production'
        : 'preview'
      : 'local-build')
  return {
    buildId: `${builtAt.replace(/[^0-9]/g, '')}-${gitCommit.slice(0, 12) || 'unknown'}-${randomUUID().slice(0, 8)}`,
    appVersion: version,
    gitCommit,
    builtAt,
    environment,
    dirty: !!git('status', '--porcelain', '--untracked-files=normal')
  }
}
