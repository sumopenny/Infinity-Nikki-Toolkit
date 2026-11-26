import { clearAllBrowserData } from './file-system/database'

/** 在备份暂停且业务写入锁定后调用；接口失败时不继续主动删除本地数据。 */
export async function clearSiteData(): Promise<void> {
  const response = await fetch('/api/clear-site-data', {
    method: 'POST',
    credentials: 'same-origin',
    mode: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    headers: { 'X-Site-Reset': '1' },
    signal: AbortSignal.timeout(15000)
  })
  // Chromium 执行清理后不会向脚本暴露 Clear-Site-Data，不能用该头判断成功。
  // 接口约定 204；旧部署或开发服务器返回的 HTML（200）仍视为失败。
  if (response.status !== 204) throw new Error('Site reset unavailable')

  // 响应头的支持范围因浏览器而异，复用事务清理保证本站业务数据被删除。
  await clearAllBrowserData()
  localStorage.clear()
  sessionStorage.clear()
  if ('caches' in globalThis) for (const name of await caches.keys()) await caches.delete(name)
  if ('serviceWorker' in navigator)
    for (const registration of await navigator.serviceWorker.getRegistrations())
      await registration.unregister()
}
