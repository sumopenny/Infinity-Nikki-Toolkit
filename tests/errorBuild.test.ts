import { expect, it } from 'vitest'
import { errorBuildInfo } from '../scripts/error-build'
import { currentVersion } from '../src/i18n/version'

it('reports the same application version as the UI', () => {
  expect(errorBuildInfo().appVersion).toBe(currentVersion)
})
