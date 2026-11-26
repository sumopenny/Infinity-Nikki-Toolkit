import { fetch, Headers, Request, Response } from 'undici'

// Vitest 2 mixes Node fetch with jsdom AbortSignal. Use one fetch implementation
// initialized in the test realm, and the browser's own storage rather than Node's.
if (typeof window !== 'undefined') {
  Object.assign(globalThis, { fetch, Headers, Request, Response })
  const browserWindow = (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: browserWindow[name]
    })
  }
}
