import { clearAllBrowserData } from './file-system/database'

/** 仅清理本地数据；在备份暂停且业务写入锁定后调用。 */
export async function clearSiteData(): Promise<void> {
  await clearAllBrowserData()
  localStorage.clear()
  sessionStorage.clear()
  if ('caches' in globalThis) for (const name of await caches.keys()) await caches.delete(name)
  if ('serviceWorker' in navigator)
    for (const registration of await navigator.serviceWorker.getRegistrations())
      await registration.unregister()
}
