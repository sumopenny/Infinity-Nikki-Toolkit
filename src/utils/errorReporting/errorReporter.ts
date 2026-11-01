import { collectDiagnosticEnvironment, prepareDiagnosticEnvironment } from './environment'
import {
  MAX_ERROR_BYTES,
  MAX_BREADCRUMBS,
  byteLength,
  clipText,
  diagnosticObject,
  diagnosticText,
  fingerprintInput,
  isExpectedError,
  isDiagnosticWarning,
  serializeError,
  validateErrorPayload,
  type Breadcrumb,
  type BuildInfo,
  type ErrorEventPayload,
  type ErrorMetadata
} from './schema'

const annotations = new WeakMap<object, Partial<ErrorMetadata>>()
/** 底层只补充上下文；上层最终失败时上报，避免把成功降级也记成错误。 */
export function annotateDiagnosticError<T>(error: T, metadata: Partial<ErrorMetadata>): T {
  try {
    if (error && typeof error === 'object') {
      const previous = annotations.get(error) ?? {}
      annotations.set(error, {
        ...previous,
        ...metadata,
        context: { ...previous.context, ...metadata.context }
      })
    }
  } catch {
    /* 诊断不能改变异常。 */
  }
  return error
}
/** Retain lower-level network/storage annotations through Error.cause wrappers. */
export function diagnosticMetadata(error: unknown): Partial<ErrorMetadata> {
  const chain: Partial<ErrorMetadata>[] = [],
    visited = new Set<object>()
  let current = error
  for (let i = 0; i < 6 && current && typeof current === 'object' && !visited.has(current); i++) {
    visited.add(current)
    const annotation = annotations.get(current)
    if (annotation) chain.unshift(annotation)
    current = (current as { cause?: unknown }).cause
  }
  return chain.reduce<Partial<ErrorMetadata>>(
    (value, next) => ({
      ...value,
      ...next,
      context: { ...value.context, ...next.context }
    }),
    {}
  )
}
export function diagnosticId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}
export interface ReporterOptions {
  enabled: boolean
  build: BuildInfo
  environment?: () => ReturnType<typeof collectDiagnosticEnvironment>
  transport?: typeof fetch
  now?: () => number
  pagePath?: () => string
  pageOrigin?: () => string
}
interface DiagnosticStep {
  at: number
  outcome: string
  reason: string
  eventId: string | null
  httpStatus: number | null
  responseCode: string | null
}
export function createErrorReporter(options: ReporterOptions) {
  let enabled = options.enabled
  const now = options.now ?? Date.now
  const crumbs: Breadcrumb[] = []
  const queue: ErrorEventPayload[] = []
  const seen = new WeakSet<object>()
  const recent = new Map<string, number>()
  let sent: number[] = [],
    pauseUntil = 0,
    suppressed = 0
  let pending: Promise<void> | undefined
  let controller: AbortController | undefined
  let currentModule = 'application'
  const counts = {
    captured: 0,
    queued: 0,
    filtered: 0,
    deduplicated: 0,
    limited: 0,
    invalid: 0,
    attempts: 0,
    accepted: 0,
    rejected: 0,
    failed: 0
  }
  let lastCapture: DiagnosticStep | null = null,
    lastDelivery: DiagnosticStep | null = null
  const step = (
    outcome: string,
    reason: string,
    eventId: string | null = null,
    httpStatus: number | null = null,
    responseCode: string | null = null
  ): DiagnosticStep => ({ at: now(), outcome, reason, eventId, httpStatus, responseCode })
  const skip = (reason: string): null => {
    lastCapture = step('skipped', reason)
    return null
  }
  function breadcrumb(category: string, name: string, data: Record<string, unknown> = {}) {
    if (!enabled) return
    try {
      crumbs.push({
        at: now(),
        category: diagnosticText(category, 40),
        name: diagnosticText(name, 96),
        data: diagnosticObject(data)
      })
      if (crumbs.length > MAX_BREADCRUMBS) crumbs.shift()
    } catch {
      /* no-op */
    }
  }
  async function transmit(event: ErrorEventPayload) {
    for (let attempt = 0; attempt < 2 && enabled; attempt++) {
      const currentController = new AbortController()
      controller = currentController
      let timer: ReturnType<typeof setTimeout> | undefined
      counts.attempts++
      lastDelivery = step('sending', 'request-started', event.eventId)
      try {
        const transport = options.transport ?? globalThis.fetch
        // The deadline includes the response body, not just receipt of headers.
        const result = await Promise.race([
          (async () => {
            const response = await transport('/api/errors', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'X-Error-Report': '1' },
              body: JSON.stringify(event),
              credentials: 'omit',
              cache: 'no-store',
              referrerPolicy: 'no-referrer',
              signal: currentController.signal
            })
            const body: unknown = await response.json().catch(() => null)
            return { response, body }
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              currentController.abort()
              reject(new Error('REPORT_TIMEOUT'))
            }, 5000)
          })
        ])
        if (!enabled) {
          lastDelivery = step('stopped', 'user-disabled', event.eventId)
          return
        }
        const { response, body } = result
        const receipt = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
        const code =
          typeof receipt.error === 'string' && /^[A-Z_]{1,64}$/.test(receipt.error)
            ? receipt.error
            : null
        if (response.ok && receipt.accepted === true && receipt.eventId === event.eventId) {
          counts.accepted++
          lastDelivery = step(
            'accepted',
            receipt.replayed === true ? 'replayed' : 'stored',
            event.eventId,
            response.status
          )
          return
        }
        counts.rejected++
        lastDelivery = step(
          'rejected',
          response.ok ? 'invalid-acknowledgement' : 'http-error',
          event.eventId,
          response.status,
          code
        )
        if (response.status === 429 || response.status === 503) {
          pauseUntil = now() + 60000
          queue.length = 0
          return
        }
        if (!response.ok && response.status < 500) return
      } catch (error) {
        if (!enabled) {
          lastDelivery = step('stopped', 'user-disabled', event.eventId)
          return
        }
        counts.failed++
        lastDelivery = step(
          'failed',
          error instanceof Error && error.message === 'REPORT_TIMEOUT'
            ? 'timeout'
            : 'network-failed',
          event.eventId
        )
        // Never recursively report the reporter's own failures.
      } finally {
        clearTimeout(timer)
        if (controller === currentController) controller = undefined
      }
    }
  }
  function flush(): Promise<void> {
    if (pending) return pending
    pending = (async () => {
      while (enabled && queue.length && now() >= pauseUntil) {
        const event = queue.shift()!
        await transmit(event)
      }
    })()
      .catch(() => {})
      .finally(() => {
        pending = undefined
        if (enabled && queue.length && now() >= pauseUntil) void flush()
      })
    return pending
  }
  function report(error: unknown, metadata: Partial<ErrorMetadata> = {}): string | null {
    if (!enabled) return skip('disabled')
    // Photo parameter parsing failures stay in the UI and local parse state only.
    if (metadata.module === 'photo-params') return skip('photo-params-not-reported')
    if (now() < pauseUntil) return skip('backoff')
    counts.captured++
    try {
      if (isExpectedError(error) || (metadata.code && isExpectedError(metadata.code))) {
        counts.filtered++
        return skip('expected-error')
      }
      let prior: unknown = error
      for (let i = 0; i < 6 && prior && typeof prior === 'object'; i++) {
        if (seen.has(prior)) {
          counts.deduplicated++
          return skip('duplicate-error-object')
        }
        prior = (prior as { cause?: unknown }).cause
      }
      const annotation = diagnosticMetadata(error)
      const info = { ...annotation, ...metadata, stage: annotation.stage ?? metadata.stage }
      const stamp = now()
      sent = sent.filter((at) => stamp - at < 60000)
      if (sent.length >= 20 || queue.length >= 10) {
        suppressed++
        counts.limited++
        return skip('page-rate-or-queue-limit')
      }
      const environment = (options.environment ?? collectDiagnosticEnvironment)()
      const event: ErrorEventPayload = {
        schemaVersion: 1,
        eventId: diagnosticId(),
        occurredAt: stamp,
        module: info.module ?? currentModule,
        action: info.action ?? 'unhandled',
        stage: info.stage ?? '',
        code: info.code ?? '',
        type: info.type ?? 'business',
        severity: info.severity ?? (isDiagnosticWarning(error) ? 'warning' : 'error'),
        handled: info.handled ?? true,
        build: options.build,
        error: serializeError(error),
        pagePath: clipText(
          (
            options.pagePath?.() ?? (typeof location === 'undefined' ? '/' : location.pathname)
          ).split(/[?#]/)[0],
          256
        ),
        ...(typeof location !== 'undefined' || options.pageOrigin
          ? { pageOrigin: options.pageOrigin?.() ?? location.origin }
          : {}),
        ...environment,
        context: diagnosticObject({
          ...annotation?.context,
          ...metadata.context,
          suppressedSincePrevious: suppressed
        }),
        breadcrumbs: [...crumbs],
        truncated: []
      }
      if (
        [
          event.error.message,
          event.error.stack,
          ...event.error.causes.map((value) => value.stack)
        ].some((value) => value.includes('[truncated]'))
      )
        event.truncated.push('error')
      const fingerprint = fingerprintInput(event)
      if (stamp - (recent.get(fingerprint) ?? -Infinity) < 10000) {
        suppressed++
        counts.deduplicated++
        return skip('fingerprint-window')
      }
      while (byteLength(JSON.stringify(event)) > MAX_ERROR_BYTES && event.breadcrumbs.length) {
        event.breadcrumbs.shift()
        if (!event.truncated.includes('breadcrumbs')) event.truncated.push('breadcrumbs')
      }
      if (byteLength(JSON.stringify(event)) > MAX_ERROR_BYTES) {
        event.context = { stage: event.stage }
        event.truncated.push('context')
      }
      if (byteLength(JSON.stringify(event)) > MAX_ERROR_BYTES) {
        counts.invalid++
        return skip('payload-too-large')
      }
      const clean = validateErrorPayload(event)
      recent.set(fingerprint, stamp)
      if (recent.size > 100) recent.delete(recent.keys().next().value!)
      // 标记整条 cause 链，避免同一异常经 Vue、Promise、业务边界重复上传。
      let current: unknown = error
      for (let i = 0; i < 6 && current && typeof current === 'object'; i++) {
        if (seen.has(current)) break
        seen.add(current)
        current = (current as { cause?: unknown }).cause
      }
      sent.push(stamp)
      suppressed = 0
      queue.push(clean)
      counts.queued++
      lastCapture = step('queued', 'captured', clean.eventId)
      void flush()
      return clean.eventId
    } catch {
      counts.invalid++
      return skip('serialization-or-validation')
    }
  }
  return {
    report,
    breadcrumb,
    flush,
    snapshot() {
      return Object.freeze({
        enabled,
        queueLength: queue.length,
        pauseUntil,
        counters: Object.freeze({ ...counts }),
        lastCapture: lastCapture ? Object.freeze({ ...lastCapture }) : null,
        lastDelivery: lastDelivery ? Object.freeze({ ...lastDelivery }) : null
      })
    },
    setModule(value: string) {
      currentModule = value
      breadcrumb('navigation', 'module-enter', { module: value })
    },
    setEnabled(value: boolean) {
      enabled = value
      if (!value) {
        queue.length = 0
        crumbs.length = 0
        controller?.abort()
      }
    }
  }
}
const fallbackBuild: BuildInfo = {
  buildId: 'development',
  appVersion: 'unknown',
  gitCommit: '',
  builtAt: '',
  environment: 'development',
  dirty: true
}
export const diagnosticsConfigured =
  import.meta.env.PROD && import.meta.env.VITE_ERROR_REPORTING_ENABLED === 'true'
const reporter = createErrorReporter({
  enabled: diagnosticsConfigured,
  build: typeof __ERROR_BUILD__ === 'undefined' ? fallbackBuild : __ERROR_BUILD__
})
/** Read-only technical state; never returns error payloads, credentials or device fingerprints. */
export function getDiagnosticsStatus() {
  return Object.freeze({
    configured: diagnosticsConfigured,
    build: Object.freeze({
      ...(typeof __ERROR_BUILD__ === 'undefined' ? fallbackBuild : __ERROR_BUILD__)
    }),
    ...reporter.snapshot()
  })
}
export const reportError = reporter.report
/** Aggregate partial failures without recording user filenames or record contents. */
export function reportPartialFailure(
  module: string,
  action: string,
  failedCount: number,
  context: Record<string, unknown> = {}
) {
  if (!Number.isFinite(failedCount) || failedCount <= 0) return null
  return reportError(new Error('Operation partially failed'), {
    module,
    action,
    code: 'PARTIAL_OPERATION_FAILED',
    severity: 'warning',
    context: { ...context, failedCount }
  })
}
export const trackDiagnostic = reporter.breadcrumb
export const setDiagnosticModule = reporter.setModule
export const flushDiagnostics = reporter.flush
export function initializeDiagnosticEnvironment() {
  if (diagnosticsConfigured) prepareDiagnosticEnvironment()
}
