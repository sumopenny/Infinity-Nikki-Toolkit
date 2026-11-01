import { describe, expect, it } from 'vitest'
import { sampleEvent } from './fixture'
import {
  byteLength,
  clipText,
  diagnosticObject,
  diagnosticText,
  fingerprintInput,
  isExpectedError,
  serializeError,
  validateErrorPayload
} from '../../../src/utils/errorReporting/schema'

describe('diagnostic protocol without a database', () => {
  it('keeps technical details and full UA', () => {
    expect(validateErrorPayload(sampleEvent()).device).toEqual(sampleEvent().device)
    expect(validateErrorPayload(sampleEvent()).error.stack).toContain('index-abc.js:1:200')
  })
  it('excludes credentials while preserving technical messages', () => {
    const text = diagnosticText(
      'InvalidStateError token=private123; uid=1030303; browser=QQBrowser/19.3; https://example.com/api?token=secret'
    )
    expect(text).toContain('InvalidStateError')
    expect(text).toContain('QQBrowser/19.3')
    expect(text).not.toContain('private123')
    expect(text).not.toContain('1030303')
    expect(text).not.toContain('?token')
  })
  it('does not serialize sensitive request fields or circular objects', () => {
    const input: Record<string, unknown> = {
      token: 'secret',
      requestBody: { token: 'secret' },
      sizeBytes: 22
    }
    input.self = input
    expect(diagnosticObject(input)).toEqual({ sizeBytes: 22, self: '[depth-or-cycle-limit]' })
  })
  it('bounds UTF-8 byte length rather than character count', () => {
    const text = clipText('图片错误'.repeat(1000), 256)
    expect(byteLength(text)).toBeLessThanOrEqual(256)
    expect(text).toContain('[truncated]')
  })
  it('keeps the original cause chain and stops cycles', () => {
    const root = new TypeError('decoder unavailable'),
      wrapper = new Error('save failed', { cause: root })
    Object.defineProperty(root, 'cause', { value: wrapper })
    const detail = serializeError(wrapper)
    expect(detail.causes).toHaveLength(1)
    expect(detail.causes[0].name).toBe('TypeError')
  })
  it('filters known cancellations but not timeouts/storage errors', () => {
    expect(isExpectedError(new DOMException('cancel', 'AbortError'))).toBe(true)
    expect(isExpectedError(new Error('LOCAL_CHANGED'))).toBe(true)
    expect(isExpectedError(new DOMException('full', 'QuotaExceededError'))).toBe(false)
    expect(isExpectedError(new DOMException('timeout', 'TimeoutError'))).toBe(false)
  })
  it.each([
    { schemaVersion: 2 },
    { eventId: 'bad' },
    { occurredAt: -1 },
    { module: '../evil' },
    { action: '' },
    { type: 'not-supported' },
    { handled: 'true' },
    { severity: 'anything' },
    { build: { ...sampleEvent().build, buildId: '../../file' } },
    { error: { ...sampleEvent().error, stack: 'x'.repeat(17000) } },
    { breadcrumbs: Array.from({ length: 31 }, () => sampleEvent().breadcrumbs[0]) }
  ])('rejects malformed fields: %j', (change) => {
    expect(() => validateErrorPayload({ ...sampleEvent(), ...change })).toThrow('INVALID_REPORT')
  })
  it('preserves only canonical page origins and remains compatible with older events', () => {
    const event = sampleEvent()
    expect(validateErrorPayload(event).pageOrigin).toBeUndefined()
    expect(validateErrorPayload({ ...event, pageOrigin: 'http://localhost:5173' }).pageOrigin)
      .toBe('http://localhost:5173')
    expect(validateErrorPayload({ ...event, pageOrigin: 'https://infinity-nikki-album-manager.pages.dev' }).pageOrigin)
      .toBe('https://infinity-nikki-album-manager.pages.dev')
    for (const origin of ['https://example.com/private?token=secret', 'https://user:pass@example.com', 'file:///tmp', 'http://example.com:80/', '']) {
      expect(() => validateErrorPayload({ ...event, pageOrigin: origin })).toThrow('INVALID_REPORT')
    }
  })
  it('drops unknown top-level fields rather than storing arbitrary user payloads', () => {
    const result = validateErrorPayload({ ...sampleEvent(), requestBody: { token: 'secret' } })
    expect('requestBody' in result).toBe(false)
  })
  it('does not merge different operations with the same message', () => {
    expect(fingerprintInput(sampleEvent())).not.toBe(
      fingerprintInput({ ...sampleEvent(), action: 'import' })
    )
  })
})
