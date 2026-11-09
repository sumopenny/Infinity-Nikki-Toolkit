let pending: Promise<unknown> = Promise.resolve()

/** 导入、导出和恢复共用跨标签页写锁；批次内部仍并发处理。 */
export function withPhotoWriteLock<T>(action: () => Promise<T>): Promise<T> {
  const run = () =>
    typeof navigator !== 'undefined' && navigator.locks?.request
      ? navigator.locks.request('nikki-photo-write', action)
      : action()
  // 不支持 Web Locks 时仍串行化同页批次；无法协调外部程序和其他标签页。
  const next = pending.then(run, run)
  pending = next.catch(() => undefined)
  return next
}
