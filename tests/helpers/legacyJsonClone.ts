import { vi } from 'vitest'
import * as cloning from '../../src/utils/cloneJsonData'

/** Hide the API for app snapshot code, retaining it for fake-indexeddb's browser emulation. */
export function useLegacyJsonClone() {
  const clone = cloning.cloneJsonData
  return vi.spyOn(cloning, 'cloneJsonData').mockImplementation((value) => {
    const native = globalThis.structuredClone
    try {
      Object.defineProperty(globalThis, 'structuredClone', {
        configurable: true,
        writable: true,
        value: undefined
      })
      return clone(value)
    } finally {
      Object.defineProperty(globalThis, 'structuredClone', {
        configurable: true,
        writable: true,
        value: native
      })
    }
  })
}
