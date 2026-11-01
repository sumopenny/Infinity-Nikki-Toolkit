import type { App } from 'vue'
import {
  diagnosticsConfigured,
  getDiagnosticsStatus,
  initializeDiagnosticEnvironment,
  reportError
} from './errorReporter'

/** 保留已有 Vue handler 与浏览器默认错误行为；卸载/HMR 时释放监听。 */
export function installErrorReporting(app: App): () => void {
  let listenersInstalled = false
  const api = Object.freeze({
    snapshot: () => Object.freeze({ ...getDiagnosticsStatus(), listenersInstalled })
  })
  // Available even when the build gate is off, so missing configuration can be diagnosed.
  try {
    Object.defineProperty(window, '__NIKKI_DIAGNOSTICS__', { value: api, configurable: true })
  } catch {
    /* Optional debug API. */
  }
  const removeDebugApi = () => {
    if (Object.getOwnPropertyDescriptor(window, '__NIKKI_DIAGNOSTICS__')?.value === api)
      Reflect.deleteProperty(window, '__NIKKI_DIAGNOSTICS__')
  }
  if (import.meta.env.DEV) {
    // 本地开发只在控制台报告，不连接线上 /api/errors，也不写入 D1。
    // Vue 的默认错误处理及浏览器自身的 Error/Promise 日志保持不变。
    const previous = app.config.errorHandler
    const devHandler: NonNullable<App['config']['errorHandler']> = (error, instance, info) => {
      console.error('[Nikki dev][Vue]', info, error)
      previous?.(error, instance, info)
    }
    app.config.errorHandler = devHandler
    return () => {
      removeDebugApi()
      if (app.config.errorHandler === devHandler) app.config.errorHandler = previous
    }
  }
  if (!diagnosticsConfigured) return removeDebugApi
  initializeDiagnosticEnvironment()
  const previous = app.config.errorHandler
  const vueHandler: NonNullable<App['config']['errorHandler']> = (error, instance, info) => {
    const components: string[] = []
    let current = instance?.$ ?? null
    for (let i = 0; current && i < 10; i++, current = current.parent) {
      const type = current.type
      components.push(
        typeof type === 'object' ? (type.name ?? type.__name ?? 'anonymous') : String(type)
      )
    }
    reportError(error, {
      type: 'vue',
      action: 'component-error',
      handled: false,
      context: { vueInfo: info, components }
    })
    if (previous) previous(error, instance, info)
    else console.error(error)
  }
  app.config.errorHandler = vueHandler
  const runtime = (event: ErrorEvent | Event) => {
    if (event instanceof ErrorEvent) {
      // UC injects this same-origin-looking script; only exclude errors attributed to that file.
      try {
        if (
          new URL(event.filename, location.href).pathname ===
          '/u.c.b.r.o.w.s.e.r/ucbrowser_script.js'
        )
          return
      } catch {
        /* Preserve reporting for malformed or unavailable script locations. */
      }

      const opaque = event.message === 'Script error.' && !event.filename && !event.error
      const resizeLoop =
        /^(?:ResizeObserver loop limit exceeded|ResizeObserver loop completed with undelivered notifications\.)$/.test(
          event.message
        )
      reportError(event.error ?? new Error(event.message), {
        type: 'runtime',
        action: opaque
          ? 'opaque-script-error'
          : resizeLoop
            ? 'resize-observer-loop'
            : 'window-error',
        handled: false,
        severity: resizeLoop ? 'warning' : 'error',
        context: {
          script: event.filename,
          line: event.lineno,
          column: event.colno,
          locationAvailable: Boolean(event.filename && event.lineno),
          errorObjectAvailable: Boolean(event.error),
          resourceOrigin: event.filename
            ? new URL(event.filename, location.href).origin === location.origin
              ? 'same-origin'
              : 'other-origin'
            : 'unknown'
        }
      })
      return
    }
    // 只收集本站 JS/CSS 资源失败；不扫描用户图片或第三方扩展资源。
    const node = event.target
    if (!(node instanceof HTMLScriptElement || node instanceof HTMLLinkElement)) return
    const source = node instanceof HTMLScriptElement ? node.src : node.href
    try {
      const url = new URL(source, location.href)
      if (url.origin !== location.origin || !/\.(?:js|css)$/.test(url.pathname)) return
      reportError(new Error('Application resource failed to load'), {
        type: 'resource',
        action: 'load-resource',
        context: { resource: url.pathname, tag: node.tagName }
      })
    } catch {
      /* Invalid resource URL. */
    }
  }
  const promise = (event: PromiseRejectionEvent) =>
    reportError(event.reason, { type: 'promise', action: 'unhandled-rejection', handled: false })
  window.addEventListener('error', runtime, true)
  window.addEventListener('unhandledrejection', promise)
  listenersInstalled = true
  return () => {
    listenersInstalled = false
    removeDebugApi()
    if (app.config.errorHandler === vueHandler) app.config.errorHandler = previous
    window.removeEventListener('error', runtime, true)
    window.removeEventListener('unhandledrejection', promise)
  }
}
