import { MODULES } from './disk'
import type { BackupModule } from './changeJournal'
import type { BackupConfig, ModuleProgress } from './repository'

export type BackupButtonState = 'pending' | 'syncing' | 'success' | 'warning'
export type BackupButtonReason =
  | 'checking'
  | 'not-enabled'
  | 'directory-missing'
  | 'incomplete'
  | 'syncing'
  | 'synced'
  | 'unsupported'
  | 'service-error'
  | 'module-error'
  | 'permission'
  | 'paused'

export interface BackupButtonStatusInput {
  config: Pick<BackupConfig, 'enabled' | 'initialized' | 'handle' | 'paused'> | null
  statuses: Readonly<Record<BackupModule, ModuleProgress>>
  running: boolean
  scheduled: boolean
  initialStatusLoading: boolean
  supported: boolean
  serviceError: string
}

export interface BackupButtonStatus {
  state: BackupButtonState
  reason: BackupButtonReason
}

/** 只汇总当前启用的模块；无磁盘读取、无持久化，异常优先于运行中和历史成功记录。 */
export function getBackupButtonStatus({
  config,
  statuses,
  running,
  scheduled,
  initialStatusLoading,
  supported,
  serviceError
}: BackupButtonStatusInput): BackupButtonStatus {
  if (serviceError) return { state: 'warning', reason: 'service-error' }
  if (initialStatusLoading) return { state: 'syncing', reason: 'checking' }
  if (!config) return { state: 'pending', reason: 'not-enabled' }
  const enabled = MODULES.filter((module) => config.enabled[module])
  if (!enabled.length) return { state: 'pending', reason: 'not-enabled' }
  if (!supported) return { state: 'warning', reason: 'unsupported' }
  if (enabled.some((module) => ['error', 'protected'].includes(statuses[module].state)))
    return { state: 'warning', reason: 'module-error' }
  if (enabled.some((module) => statuses[module].state === 'permission'))
    return { state: 'warning', reason: 'permission' }
  if (config.paused || enabled.some((module) => statuses[module].state === 'paused'))
    return { state: 'warning', reason: 'paused' }
  if (!config.handle || enabled.some((module) => statuses[module].state === 'not-set'))
    return { state: 'pending', reason: 'directory-missing' }
  // 排队等待写盘和实际运行都属于同步过程；异常、暂停、未设置目录仍优先。
  if (running || scheduled) return { state: 'syncing', reason: 'syncing' }
  if (
    enabled.every(
      (module) =>
        config.initialized[module] &&
        statuses[module].enabled &&
        statuses[module].state === 'synced' &&
        Boolean(statuses[module].lastSuccess)
    )
  )
    return { state: 'success', reason: 'synced' }
  return { state: 'pending', reason: 'incomplete' }
}

export const backupButtonStatusMessages: Record<'zh' | 'en', Record<BackupButtonReason, string>> = {
  zh: {
    checking: '正在读取备份状态…',
    'not-enabled': '尚未开启自动备份',
    'directory-missing': '尚未选择备份目录',
    incomplete: '备份尚未完成，或有修改等待同步',
    syncing: '正在准备或同步备份，完成后将自动更新状态',
    synced: '自动备份正常：所有已开启模块均已同步',
    unsupported: '当前浏览器不支持电脑目录自动备份',
    'service-error': '备份服务异常，请打开菜单查看详情',
    'module-error': '备份异常或冲突，请打开菜单查看详情',
    permission: '备份目录需要重新授权',
    paused: '自动备份已暂停，后续修改尚未同步'
  },
  en: {
    checking: 'Loading backup status…',
    'not-enabled': 'Automatic backup is not enabled',
    'directory-missing': 'No backup folder selected',
    incomplete: 'Backup is incomplete or changes are waiting to sync',
    syncing: 'Preparing or syncing backup; status will update when finished',
    synced: 'Backup is healthy: all enabled modules are synced',
    unsupported: 'Folder backup is not supported by this browser',
    'service-error': 'Backup service error. Open the menu for details',
    'module-error': 'Backup error or conflict. Open the menu for details',
    permission: 'Backup folder permission must be granted again',
    paused: 'Automatic backup is paused; later changes are not synced'
  }
}
