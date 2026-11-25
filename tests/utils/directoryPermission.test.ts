import { afterEach, expect, it, vi } from 'vitest'
import { ensureReadWritePermission } from '../../src/utils/file-system/directoryPermission'

afterEach(() => vi.useRealTimers())

function directory(queryPermission: () => Promise<PermissionState>) {
  return {
    queryPermission: vi.fn(queryPermission),
    requestPermission: vi.fn(async () => 'granted' as PermissionState)
  } as unknown as FileSystemDirectoryHandle
}

it('releases a background permission check when the browser never responds', async () => {
  vi.useFakeTimers()
  const handle = directory(() => new Promise(() => {}))
  const onTimeout = vi.fn()
  const result = ensureReadWritePermission(handle, false, onTimeout)
  await vi.advanceTimersByTimeAsync(3000)
  expect(await result).toBe(false)
  expect(onTimeout).toHaveBeenCalledOnce()
  expect(handle.requestPermission).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps granted permissions and cancels the fallback timer', async () => {
  vi.useFakeTimers()
  const handle = directory(async () => 'granted')
  const onTimeout = vi.fn()
  expect(await ensureReadWritePermission(handle, false, onTimeout)).toBe(true)
  expect(onTimeout).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('ignores a late permission result after the background check timed out', async () => {
  vi.useFakeTimers()
  let resolve!: (state: PermissionState) => void
  const handle = directory(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const result = ensureReadWritePermission(handle, false)
  await vi.advanceTimersByTimeAsync(3000)
  resolve('granted')
  expect(await result).toBe(false)
  expect(handle.requestPermission).not.toHaveBeenCalled()
})

it('still requests permission when explicitly allowed', async () => {
  const handle = directory(async () => 'prompt')
  expect(await ensureReadWritePermission(handle, true)).toBe(true)
  expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
})
