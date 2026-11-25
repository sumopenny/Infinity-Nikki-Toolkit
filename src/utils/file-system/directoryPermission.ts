import type { FileSystemMessages } from './directoryErrors'

function isMobileDevice(): boolean {
  return (
    /android|iphone|ipod|ipad/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** 相册和游戏目录共用能力判断；自动恢复时不申请新授权。 */
export function supportsDirectoryAuthorization(): boolean {
  return !isMobileDevice() && typeof window.showDirectoryPicker === 'function'
}

export function getSupportedDirectoryPicker(
  messages: FileSystemMessages
): NonNullable<typeof window.showDirectoryPicker> {
  if (isMobileDevice()) throw new Error(messages.mobileBrowserUnsupported)
  if (!window.showDirectoryPicker) throw new Error(messages.unsupportedBrowser)
  return window.showDirectoryPicker
}

export async function ensureReadWritePermission(
  handle: FileSystemDirectoryHandle,
  requestPermission: boolean,
  onQueryTimeout?: () => void
): Promise<boolean> {
  const options = { mode: 'readwrite' as const }
  if (handle.queryPermission) {
    const current = requestPermission
      ? await handle.queryPermission(options)
      : await queryPermissionWithoutBlocking(handle, options)
    if (current === 'timeout') {
      onQueryTimeout?.()
      return false
    }
    if (current === 'granted') return true
    if (!requestPermission) return false
  }
  if (!requestPermission && handle.requestPermission) return false
  if (!handle.requestPermission) return true
  return (await handle.requestPermission(options)) === 'granted'
}

/** 仅限制后台权限查询，不限制获得权限后的目录扫描。 */
async function queryPermissionWithoutBlocking(
  handle: FileSystemDirectoryHandle,
  options: { mode: 'readwrite' }
): Promise<PermissionState | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      handle.queryPermission!(options),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), 3000)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
