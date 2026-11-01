import { afterEach, expect, it, vi } from 'vitest'
import {
  describeHomeSchemeError,
  describeHomeSchemeParseError
} from '../../src/utils/homeBuild/homeSchemeErrors'
import { homeSchemeMessages } from '../../src/i18n/messages/homeScheme'

afterEach(() => vi.restoreAllMocks())
it.each(['zh', 'en'] as const)(
  'explains proxy failures without exposing raw responses (%s)',
  (language) => {
    const messages = homeSchemeMessages[language]
    expect(describeHomeSchemeParseError(new Error('home_build_not_found'), messages)).toBe(
      messages.parseNotFound
    )
    expect(describeHomeSchemeParseError(new Error('upstream_timeout'), messages)).toBe(
      messages.parseTimeout
    )
    expect(describeHomeSchemeParseError(new Error('upstream_response_invalid'), messages)).toBe(
      messages.parseUnavailable
    )
    expect(describeHomeSchemeParseError(new Error('private body'), messages)).toBe(
      messages.parseFailed
    )
  }
)
it.each(['zh', 'en'] as const)(
  'classifies safe errors and hides raw diagnostic data (%s)',
  (language) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const messages = homeSchemeMessages[language]
    const cases = [
      [new DOMException('secret', 'QuotaExceededError'), 'storageFull'],
      [new DOMException('secret', 'NotAllowedError'), 'permissionDenied'],
      [new Error('home_scheme_image_missing'), 'imageInvalid'],
      [new Error('home_scheme_record_invalid'), 'dataInvalid'],
      [new Error('home_scheme_tag_in_use'), 'tagsChanged'],
      [new Error('home_scheme_record_changed'), 'recordChanged'],
      [new Error('home_scheme_backup_secret'), 'invalidBackup'],
      [new Error('token=secret'), 'operationFailed'],
      [new Error('constructor'), 'operationFailed'],
      [null, 'operationFailed']
    ] as const
    for (const [error, category] of cases) {
      expect(describeHomeSchemeError(error, messages, 'save')).toBe(messages[category])
      expect(warn).toHaveBeenLastCalledWith('[home-schemes]', { operation: 'save', category })
    }
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret')
  }
)

it.each(['zh', 'en'] as const)('explains network and local timeout failures (%s)', (language) => {
  const messages = homeSchemeMessages[language]
  for (const message of [
    'Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'Load failed'
  ])
    expect(describeHomeSchemeParseError(new TypeError(message), messages)).toBe(
      messages.parseUnavailable
    )
  expect(
    describeHomeSchemeParseError(new DOMException('Timed out', 'TimeoutError'), messages)
  ).toBe(messages.parseTimeout)
})
