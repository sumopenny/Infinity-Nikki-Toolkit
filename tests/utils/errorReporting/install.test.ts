// @vitest-environment jsdom
import { createApp } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let dispose = () => {}
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  vi.stubEnv('PROD', true)
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_ERROR_REPORTING_ENABLED', 'true')
})
afterEach(() => {
  dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
const status = () =>
  Object.getOwnPropertyDescriptor(window, '__NIKKI_DIAGNOSTICS__')!.value.snapshot()
async function install() {
  const events: Array<Record<string, any>> = []
  const transport = vi.fn<typeof fetch>(async (_input, init) => {
    const event = JSON.parse(String(init?.body))
    events.push(event)
    return Response.json({ accepted: true, eventId: event.eventId }, { status: 201 })
  })
  vi.stubGlobal('fetch', transport)
  const { installErrorReporting } = await import('../../../src/utils/errorReporting/install')
  const reporter = await import('../../../src/utils/errorReporting/errorReporter')
  const app = createApp({})
  dispose = installErrorReporting(app)
  return { app, reporter, events, transport }
}
it('captures runtime, promise and Vue failures through the installed handlers', async () => {
  const { app, reporter, events } = await install()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  window.dispatchEvent(
    new ErrorEvent('error', { error: new Error('runtime-fixture'), message: 'runtime-fixture' })
  )
  const rejection = new Event('unhandledrejection')
  Object.defineProperty(rejection, 'reason', { value: new Error('promise-fixture') })
  window.dispatchEvent(rejection)
  app.config.errorHandler!(new Error('vue-fixture'), null, 'render')
  await reporter.flushDiagnostics()
  expect(events.map((e) => e.type)).toEqual(['runtime', 'promise', 'vue'])
  expect(status()).toMatchObject({
    configured: true,
    enabled: true,
    listenersInstalled: true
  })
  expect(status().counters.accepted).toBe(3)
  expect(log).toHaveBeenCalledTimes(1)
})
it('logs local Vue failures to the console without sending error reports', async () => {
  vi.stubEnv('PROD', false)
  vi.stubEnv('DEV', true)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { app, transport } = await install()
  expect(status()).toMatchObject({ configured: false, enabled: false, listenersInstalled: false })
  app.config.errorHandler!(new Error('local-vue-fixture'), null, 'render')
  expect(log).toHaveBeenCalledWith(
    '[Nikki dev][Vue]',
    'render',
    expect.objectContaining({ message: 'local-vue-fixture' })
  )
  expect(transport).not.toHaveBeenCalled()
  dispose()
  expect(app.config.errorHandler).toBeUndefined()
})
it('still exposes why collection is unavailable when the production flag is absent', async () => {
  vi.stubEnv('VITE_ERROR_REPORTING_ENABLED', '')
  const { app, transport } = await install()
  expect(status()).toMatchObject({ configured: false, enabled: false, listenersInstalled: false })
  expect(app.config.errorHandler).toBeUndefined()
  window.dispatchEvent(new Event('unhandledrejection'))
  expect(transport).not.toHaveBeenCalled()
})
it('reports errors despite a legacy disabled preference and storage events', async () => {
  localStorage.setItem('nikki-diagnostics-disabled', '1')
  const { reporter, transport } = await install()
  window.dispatchEvent(new ErrorEvent('error', { error: new Error('legacy-preference') }))
  await reporter.flushDiagnostics()
  expect(transport).toHaveBeenCalledTimes(1)
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'nikki-diagnostics-disabled',
      newValue: '1'
    })
  )
  window.dispatchEvent(new ErrorEvent('error', { error: new Error('legacy-storage-event') }))
  await reporter.flushDiagnostics()
  expect(transport).toHaveBeenCalledTimes(2)
  expect(status()).toMatchObject({ configured: true, enabled: true })
})
it('removes listeners and the debug facade on disposal', async () => {
  const { transport } = await install()
  dispose()
  expect(Object.getOwnPropertyDescriptor(window, '__NIKKI_DIAGNOSTICS__')).toBeUndefined()
  window.dispatchEvent(new Event('unhandledrejection'))
  expect(transport).not.toHaveBeenCalled()
})

it('ignores the known UC injected script while reporting the same error in application code', async () => {
  const { reporter, events } = await install()
  const message = "undefined is not an object (evaluating 'a.tagName.match')"
  for (const filename of [
    location.origin + '/u.c.b.r.o.w.s.e.r/ucbrowser_script.js',
    location.origin + '/assets/index.js'
  ]) {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message,
        filename,
        lineno: 94,
        colno: 461,
        error: new TypeError(message)
      })
    )
  }
  await reporter.flushDiagnostics()
  expect(events).toHaveLength(1)
  expect(events[0].context.script).toBe(location.origin + '/assets/index.js')
})
