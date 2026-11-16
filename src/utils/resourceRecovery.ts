import { annotateDiagnosticError, diagnosticMetadata } from './errorReporting/errorReporter'

export function isResourceFailure(error: unknown): boolean {
  return (
    diagnosticMetadata(error).type === 'resource' ||
    (error instanceof Error &&
      /dynamically imported module|Importing a module script failed|Unable to preload CSS|JavaScript MIME type/i.test(
        error.message
      ))
  )
}

/** JSON resources use cancellable fetches; a timed-out attempt is never retained for retries. */
export function jsonResource<T>(url: string): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => {
    if (pending) return pending
    const controller = new AbortController()
    const started = performance.now()
    let response: Response | undefined
    const timer = setTimeout(() => controller.abort(), 12000)
    const task = (async () => {
      try {
        response = await fetch(url, { signal: controller.signal })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
          throw new Error('Catalog resource unavailable')
        return (await response.json()) as T
      } catch {
        throw annotateDiagnosticError(
          new Error(
            controller.signal.aborted
              ? 'Catalog resource timed out'
              : 'Catalog resource failed to load'
          ),
          {
            type: 'resource',
            code: 'CATALOG_RESOURCE_FAILED',
            stage: 'catalog-resource',
            context: {
              resourcePath: url.startsWith('data:')
                ? 'inline-catalog'
                : new URL(url, 'https://local.invalid').pathname,
              timedOut: controller.signal.aborted,
              httpStatus: response?.status ?? null,
              contentType: response?.headers.get('content-type') ?? null,
              durationMs: Math.round(performance.now() - started)
            }
          }
        )
      } finally {
        clearTimeout(timer)
      }
    })()
    pending = task
    void task.catch(() => {
      if (pending === task) pending = undefined
    })
    return task
  }
}
