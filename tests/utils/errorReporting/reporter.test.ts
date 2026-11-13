import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhotoParseError } from '../../../src/utils/photo-params/parseError'
import { CloudRequestError } from '../../../src/utils/cloud/cloudClient'
import {
  annotateDiagnosticError,
  createErrorReporter
} from '../../../src/utils/errorReporting/errorReporter'
import type { ErrorEventPayload } from '../../../src/utils/errorReporting/schema'
import { DirectoryAccessError } from '../../../src/utils/file-system/directoryErrors'
import { fileSystemEn, fileSystemZh } from '../../../src/i18n/messages/fileSystem'

function setup(statuses = [201], enabled = true) {
  const payloads: ErrorEventPayload[] = []
  const transport = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body)))
    const status = statuses.shift() ?? 201
    return Response.json(
      status < 300
        ? { accepted: true, eventId: payloads.at(-1)!.eventId }
        : { error: 'STORAGE_UNAVAILABLE' },
      { status }
    )
  })
  let time = 1000
  const reporter = createErrorReporter({
    enabled,
    transport: transport as typeof fetch,
    now: () => time,
    pagePath: () => '/app?token=secret',
    build: {
      buildId: 'test-build',
      appVersion: 'v2.1.2',
      gitCommit: 'abc',
      builtAt: '',
      environment: 'test',
      dirty: false
    },
    environment: () => ({
      device: { userAgent: 'QQBrowser/19.3' },
      runtime: {},
      network: {},
      storage: {}
    })
  })
  return {
    reporter,
    transport,
    payloads,
    advance: (ms: number) => {
      time += ms
    }
  }
}
afterEach(() => vi.useRealTimers())
describe('in-memory error reporter', () => {
  it('skips outfit parse 504 reports while retaining other response errors', async () => {
    const { reporter, payloads } = setup()
    const metadata = { module: 'outfits', action: 'parse' }
    expect(reporter.report(new Error('Lookbook object request failed with 504'), metadata)).toBeNull()
    reporter.report(new Error('Lookbook object request failed with 502'), metadata)
    await reporter.flush()
    expect(payloads.map((event) => event.error.message)).toEqual(['Lookbook object request failed with 502'])
  })
  it('does nothing when disabled', async () => {
    const { reporter, transport } = setup([], false)
    expect(reporter.report(new Error('x'), { module: 'test', action: 'save' })).toBeNull()
    await reporter.flush()
    expect(transport).not.toHaveBeenCalled()
  })
  it('retains details and sends no credentials or URL query', async () => {
    const { reporter, transport, payloads } = setup()
    const error = annotateDiagnosticError(new Error('decode failed'), {
      stage: 'decode',
      context: { mimeType: 'image/webp', sizeBytes: 222 }
    })
    const id = reporter.report(error, { module: 'camera', action: 'save' })
    await reporter.flush()
    expect(payloads[0].eventId).toBe(id)
    expect(payloads[0].stage).toBe('decode')
    expect(payloads[0].error.stack).toContain('decode failed')
    expect(payloads[0].context.mimeType).toBe('image/webp')
    expect(payloads[0].pagePath).toBe('/app')
    expect(transport.mock.calls[0][1]?.credentials).toBe('omit')
  })
  it('suppresses the same Error object across capture boundaries', async () => {
    const { reporter, transport } = setup(),
      error = new Error('one failure')
    reporter.report(error, { module: 'test', action: 'save' })
    expect(reporter.report(error, { type: 'promise', action: 'unhandled' })).toBeNull()
    await reporter.flush()
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('suppresses a wrapper around an already reported cause', async () => {
    const { reporter, transport } = setup(),
      error = new Error('root')
    reporter.report(error, { module: 'test', action: 'save' })
    expect(
      reporter.report(new Error('wrapper', { cause: error }), {
        type: 'promise',
        action: 'unhandled'
      })
    ).toBeNull()
    await reporter.flush()
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('keeps only 30 bounded breadcrumbs', async () => {
    const { reporter, payloads } = setup()
    for (let i = 0; i < 50; i++)
      reporter.breadcrumb('operation', 'step', { index: i, token: 'secret' })
    reporter.report(new Error('failure'), { module: 'test', action: 'save' })
    await reporter.flush()
    expect(payloads[0].breadcrumbs).toHaveLength(30)
    expect(payloads[0].breadcrumbs[0].data).toEqual({ index: 20 })
  })
  it('retries at most once using the identical event ID', async () => {
    const { reporter, payloads, transport } = setup([500, 201])
    reporter.report(new Error('failure'), { module: 'test', action: 'save' })
    await reporter.flush()
    expect(transport).toHaveBeenCalledTimes(2)
    expect(payloads[0]).toEqual(payloads[1])
  })
  it('does not retry permanent validation errors', async () => {
    const { reporter, transport } = setup([400])
    reporter.report(new Error('failure'), { module: 'test', action: 'save' })
    await reporter.flush()
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('pauses on missing backend or rate limiting', async () => {
    const { reporter, transport, advance } = setup([503, 201])
    reporter.report(new Error('first'), { module: 'test', action: 'save' })
    await reporter.flush()
    expect(reporter.report(new Error('second'), { module: 'test', action: 'save' })).toBeNull()
    advance(61000)
    expect(reporter.report(new Error('third'), { module: 'test', action: 'save' })).not.toBeNull()
    await reporter.flush()
    expect(transport).toHaveBeenCalledTimes(2)
  })
  it('does not report user cancellations', async () => {
    const { reporter, transport } = setup()
    reporter.report(new DOMException('cancelled', 'AbortError'), { module: 'test', action: 'save' })
    reporter.report(new Error('MISSING_CREDENTIALS'), { module: 'test', action: 'save' })
    await reporter.flush()
    expect(transport).not.toHaveBeenCalled()
  })
  it.each([
    ['cloud save is empty', new Error('EMPTY_CLOUD')],
    ['local resonance is empty', new Error('EMPTY_LOCAL')],
    ['home build is missing', new Error('home_build_not_found')],
    ['share code is invalid', new Error('share_code_invalid')],
    ['cloud revision conflict', new CloudRequestError('CONFLICT', 'test-request')],
    ['password confirmation mismatch', new Error('PASSWORD_MISMATCH')],
    ['desktop folder picker unsupported', new Error(fileSystemZh.unsupportedBrowser)],
    ['mobile folder picker unsupported', new Error(fileSystemZh.mobileBrowserUnsupported)],
    ['album path requires permission again', new Error(fileSystemZh.permissionRequired)],
    ['X6Game is not authorized', new Error('请先授权 X6Game 文件夹。')],
    ['wrong X6Game folder', new Error(fileSystemZh.invalidX6GameDirectory)],
    ['English folder picker notice', new Error(fileSystemEn.unsupportedBrowser)],
    ['legacy folder notice', new Error('选择的目录不是正确的 X6Game 文件夹')],
    [
      'directory-access code',
      new DirectoryAccessError('permission-denied', 'The folder authorization has expired')
    ]
  ])('does not send expected business state: %s', async (_name, error) => {
    const { reporter, transport } = setup()
    expect(reporter.report(error)).toBeNull()
    expect(reporter.snapshot().lastCapture?.reason).toBe('expected-error')
    await reporter.flush()
    expect(transport).not.toHaveBeenCalled()
  })
  it('filters expected metadata codes but keeps genuine permission failures', async () => {
    const { reporter, payloads } = setup()
    expect(reporter.report(new Error('unknown status'), { code: 'EMPTY_LOCAL' })).toBeNull()
    reporter.report(new Error('Failed to read granted directory'), { module: 'album' })
    await reporter.flush()
    expect(payloads).toHaveLength(1)
    expect(payloads[0].error.message).toBe('Failed to read granted directory')
  })
  it.each([
    ['jpeg_second_end_marker_missing'],
    ['photo_structure_invalid'],
    ['base64_invalid'],
    ['photo_structure_invalid', 'base64_invalid']
  ])('filters structured photo input errors: %s', async (...codes) => {
    const { reporter, transport } = setup()
    expect(
      reporter.report(new PhotoParseError(codes), { module: 'photo-params', action: 'parse' })
    ).toBeNull()
    expect(reporter.snapshot().lastCapture?.reason).toBe('photo-params-not-reported')
    await reporter.flush()
    expect(transport).not.toHaveBeenCalled()
  })
  it('does not send photo parameter errors even with an unexpected parse code', async () => {
    const { reporter, transport } = setup()
    expect(
      reporter.report(new PhotoParseError(['base64_invalid', 'unreachable']), {
        module: 'photo-params',
        action: 'parse'
      })
    ).toBeNull()
    await reporter.flush()
    expect(transport).not.toHaveBeenCalled()
  })
  it('only filters structured errors inside photo parameter parsing', async () => {
    const { reporter, transport } = setup()
    expect(
      reporter.report(new PhotoParseError(['base64_invalid']), {
        module: 'camera',
        action: 'parse'
      })
    ).not.toBeNull()
    await reporter.flush()
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['other module', '错误码：base64_invalid；含义：无效数据', 'camera'],
    ['other module read error', 'NotReadableError', 'camera']
  ])('preserves genuine failures: %s', async (_name, message, module) => {
    const { reporter, transport } = setup()
    expect(reporter.report(new Error(message), { module, action: 'parse' })).not.toBeNull()
    await reporter.flush()
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('limits a page to 20 reports per minute', async () => {
    const { reporter, transport } = setup()
    for (let i = 0; i < 25; i++) {
      reporter.report(new Error('failure ' + i), { module: 'test', action: 'save-' + i })
      await reporter.flush()
    }
    expect(transport).toHaveBeenCalledTimes(20)
  })
  it('cannot throw back into the business operation', async () => {
    const { reporter } = setup()
    const error = {
      get name() {
        throw new Error('bad getter')
      }
    }
    expect(() => reporter.report(error, { module: 'test', action: 'save' })).not.toThrow()
    await expect(reporter.flush()).resolves.toBeUndefined()
  })
  it('opt-out immediately stops future reports', async () => {
    const { reporter, transport } = setup()
    reporter.setEnabled(false)
    reporter.report(new Error('failure'), { module: 'test', action: 'save' })
    await reporter.flush()
    expect(transport).not.toHaveBeenCalled()
  })
})

describe('diagnostic state and acknowledgement regression coverage', () => {
  it('retains cloud request correlation and the original network cause', async () => {
    const { reporter, payloads } = setup()
    const cause = new TypeError('Failed to fetch')
    reporter.report(new CloudRequestError('NETWORK', 'wardrobe-request', { cause }), {
      module: 'wardrobe-cloud',
      action: 'upload',
      stage: 'submit'
    })
    await reporter.flush()
    expect(payloads[0]).toMatchObject({
      code: 'NETWORK',
      module: 'wardrobe-cloud',
      action: 'upload',
      stage: 'submit',
      context: { requestId: 'wardrobe-request' },
      error: { causes: [{ name: 'TypeError', message: 'Failed to fetch' }] }
    })
  })
  it.each([
    'Pearpal UID mismatch',
    'Pearpal region mismatch',
    'Pearpal credentials could not be verified'
  ])('does not silently filter Pearpal warning: %s', async (message) => {
    const { reporter, payloads } = setup()
    reporter.report(new Error(message), { module: 'data-import', action: 'preview' })
    await reporter.flush()
    expect(payloads).toHaveLength(1)
    expect(payloads[0].severity).toBe('warning')
    expect(reporter.snapshot().lastDelivery).toMatchObject({ outcome: 'accepted', httpStatus: 201 })
  })
  it('exposes a read-only state without original error messages or payloads', async () => {
    const { reporter } = setup()
    const eventId = reporter.report(new Error('private diagnostic message'), {
      module: 'test',
      action: 'save'
    })
    await reporter.flush()
    const state = reporter.snapshot()
    expect(state.counters).toMatchObject({ queued: 1, attempts: 1, accepted: 1 })
    expect(state.lastDelivery?.eventId).toBe(eventId)
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.counters)).toBe(true)
    expect(JSON.stringify(state)).not.toContain('private diagnostic message')
  })
  it('does not mistake an HTTP 200 HTML/fallback response for a database acknowledgement', async () => {
    const { reporter, transport } = setup()
    transport.mockImplementation(async () => new Response('<html>fallback</html>'))
    reporter.report(new Error('failure'), { module: 'test', action: 'save' })
    await reporter.flush()
    expect(transport).toHaveBeenCalledTimes(2)
    expect(reporter.snapshot().counters.accepted).toBe(0)
    expect(reporter.snapshot().lastDelivery).toMatchObject({
      outcome: 'rejected',
      reason: 'invalid-acknowledgement',
      httpStatus: 200
    })
  })
  it('does not accept a receipt for another event', async () => {
    const { reporter, transport } = setup()
    transport.mockImplementation(async () =>
      Response.json({ accepted: true, eventId: 'other-event' }, { status: 201 })
    )
    reporter.report(new Error('failure'), { module: 'test', action: 'save' })
    await reporter.flush()
    expect(reporter.snapshot().counters.accepted).toBe(0)
    expect(reporter.snapshot().lastDelivery?.reason).toBe('invalid-acknowledgement')
  })
  it('retains lower-level annotations through cause wrappers and outer import-stage metadata', async () => {
    const { reporter, payloads } = setup()
    const root = annotateDiagnosticError(new Error('failed'), {
      stage: 'verify',
      code: 'VERIFY_FAILED',
      context: { requestId: 'request-fixture', httpStatus: 502 }
    })
    reporter.report(new Error('outer', { cause: root }), {
      module: 'data-import',
      action: 'preview',
      stage: 'source',
      context: { region: 'cn' }
    })
    await reporter.flush()
    expect(payloads[0]).toMatchObject({
      stage: 'verify',
      code: 'VERIFY_FAILED',
      context: { requestId: 'request-fixture', httpStatus: 502, region: 'cn' }
    })
  })
  it('distinguishes deliberate filtering from a failed upload', async () => {
    const { reporter, transport } = setup()
    reporter.report(new DOMException('cancel', 'AbortError'))
    expect(reporter.snapshot().lastCapture?.reason).toBe('expected-error')
    reporter.setEnabled(false)
    reporter.report(new Error('hidden'))
    expect(reporter.snapshot().lastCapture?.reason).toBe('disabled')
    await reporter.flush()
    expect(transport).not.toHaveBeenCalled()
  })
  it('marks serialization failures instead of silently returning null', () => {
    const { reporter } = setup()
    reporter.report({
      get name() {
        throw new Error('unreadable')
      }
    })
    expect(reporter.snapshot().lastCapture?.reason).toBe('serialization-or-validation')
  })
  it('records rejection status and respects the backend cooldown', async () => {
    const { reporter, transport } = setup()
    transport.mockImplementation(async () =>
      Response.json({ error: 'NOT_CONFIGURED' }, { status: 503 })
    )
    reporter.report(new Error('failure'), { module: 'test', action: 'save' })
    await reporter.flush()
    expect(reporter.snapshot().lastDelivery).toMatchObject({
      outcome: 'rejected',
      httpStatus: 503,
      responseCode: 'NOT_CONFIGURED'
    })
    expect(reporter.report(new Error('next'))).toBeNull()
    expect(reporter.snapshot().lastCapture?.reason).toBe('backoff')
  })
  it('times out a response body that never finishes, with no recursive upload', async () => {
    vi.useFakeTimers()
    const { reporter, transport } = setup()
    transport.mockImplementation(
      async () => ({ ok: true, status: 201, json: () => new Promise(() => {}) }) as Response
    )
    reporter.report(new Error('failure'), { module: 'test', action: 'save' })
    const settled = reporter.flush()
    await vi.advanceTimersByTimeAsync(10010)
    await settled
    expect(transport).toHaveBeenCalledTimes(2)
    expect(reporter.snapshot().lastDelivery?.reason).toBe('timeout')
    expect(reporter.snapshot().counters.accepted).toBe(0)
  })
})
