import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertDiagnosticsBuild } from '../scripts/error-build-policy.mjs'

for (const value of [undefined, '', 'false', 'TRUE', 'true ']) {
  test(`Workers Builds production rejects missing or incorrect flag: ${String(value)}`, () => {
    assert.throws(
      () =>
        assertDiagnosticsBuild({
          WORKERS_CI_BRANCH: 'main',
          VITE_ERROR_REPORTING_ENABLED: value
        }),
      /VITE_ERROR_REPORTING_ENABLED=true/
    )
  })
}
test('Workers Builds and explicitly marked manual production builds accept the enabled flag', () => {
  for (const env of [{ WORKERS_CI_BRANCH: 'main' }, { ERROR_DEPLOYMENT_ENV: 'production' }])
    assert.deepEqual(assertDiagnosticsBuild({ ...env, VITE_ERROR_REPORTING_ENABLED: 'true' }), {
      production: true,
      enabled: true
    })
})
test('local dev and local builds remain usable without enabling cloud reporting', () => {
  assert.deepEqual(assertDiagnosticsBuild({}), { production: false, enabled: false })
  assert.doesNotThrow(() => assertDiagnosticsBuild({ ERROR_DEPLOYMENT_ENV: 'production' }, 'serve'))
})
test('preview deployments do not inherit mandatory production collection', () => {
  assert.deepEqual(assertDiagnosticsBuild({ WORKERS_CI_BRANCH: 'preview' }), {
    production: false,
    enabled: false
  })
})
