import type { BackupModule } from './changeJournal'

const ORDER: BackupModule[] = ['outfits', 'home', 'camera']
const queues = new Map<string, Promise<unknown>>()
const localReaders = new Map<BackupModule, Set<Promise<unknown>>>()
const localRestoring = new Set<BackupModule>()
const unavailable = () => new Error('此模块正在从目录恢复，请稍后再编辑或导入。')

/** 备份写盘锁与业务写锁分离：正常备份绝不阻塞业务编辑。 */
export async function locked<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks)
    return navigator.locks.request(`nuan-directory-backup-${key}`, action)
  const prior = queues.get(key) ?? Promise.resolve()
  const next = prior.catch(() => undefined).then(action)
  const settled = next.catch(() => undefined)
  queues.set(key, settled)
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key)
  })
  return next
}

export function withBusinessWrites<T>(
  modules: BackupModule[],
  action: () => Promise<T>
): Promise<T> {
  const ordered = ORDER.filter((module) => modules.includes(module))
  const enter = (at: number): Promise<T> => {
    const module = ordered[at]
    if (!module) return action()
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request(
        `nuan-business-${module}`,
        { mode: 'shared', ifAvailable: true },
        (lock) => {
          if (!lock) throw unavailable()
          return enter(at + 1)
        }
      )
    }
    // 只用于不支持目录备份的浏览器以及单进程测试；产品目录备份要求 Web Locks。
    if (localRestoring.has(module)) return Promise.reject(unavailable())
    const readers = localReaders.get(module) ?? new Set<Promise<unknown>>()
    localReaders.set(module, readers)
    const next = enter(at + 1)
    readers.add(next)
    void next.then(
      () => readers.delete(next),
      () => readers.delete(next)
    )
    return next
  }
  return enter(0)
}

export async function withExclusiveBusiness<T>(
  modules: BackupModule[],
  action: () => Promise<T>
): Promise<T> {
  const ordered = ORDER.filter((module) => modules.includes(module))
  const enter = async (at: number): Promise<T> => {
    const module = ordered[at]
    if (!module) return action()
    if (typeof navigator !== 'undefined' && navigator.locks)
      return navigator.locks.request(`nuan-business-${module}`, () => enter(at + 1))
    if (localRestoring.has(module)) throw unavailable()
    localRestoring.add(module)
    try {
      await Promise.allSettled([...(localReaders.get(module) ?? [])])
      return await enter(at + 1)
    } finally {
      localRestoring.delete(module)
    }
  }
  return enter(0)
}

export function withAllBackupLocks<T>(action: () => Promise<T>): Promise<T> {
  return locked('outfits', () => locked('home', () => locked('camera', action)))
}
