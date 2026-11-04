import { computed, onBeforeUnmount, onMounted, reactive, shallowRef } from 'vue'
import {
  defaultStates,
  loadConfig,
  countBrowserRecords,
  pendingEnabledBackups,
  readModuleStatus,
  supportsBackup,
  syncModule,
  type BackupConfig,
  type ModuleProgress
} from '../utils/directory-backup/engine'
import { MODULES } from '../utils/directory-backup/disk'

// 原生目录句柄不能被 Vue 深层代理；持久化时保留可结构化克隆的原始对象。
const config = shallowRef<BackupConfig | null>(null)
const statuses = reactive(defaultStates())
const running = shallowRef(false)
// 自动备份排队等待定时执行时，角标仍应显示处理中，而不是误显示红点。
const scheduled = shallowRef(false)
// 首次恢复本地备份配置前不能把未知状态显示成“未备份”。
const initialStatusLoading = shallowRef(true)
const serviceError = shallowRef('')
let users = 0
let timer: ReturnType<typeof setTimeout> | undefined
let emptyCheckTimer: ReturnType<typeof setInterval> | undefined
let checkingEmpty = false
let firstChange = 0
let channel: BroadcastChannel | undefined
let currentRun: Promise<void> | undefined
let requestedAgain = false
let refreshGeneration = 0
function backupNotice(
  source: string,
  message: string | null,
  loading = false,
  tone: 'success' | 'error' | 'info' = 'info'
) {
  window.dispatchEvent(
    new CustomEvent('nuan-backup-notice', {
      detail: { source, message, loading, tone }
    })
  )
}
export const directoryBackup = {
  config,
  statuses,
  running,
  scheduled,
  initialStatusLoading,
  serviceError,
  supported: computed(supportsBackup),
  hasEnabled: computed(() =>
    Boolean(config.value && MODULES.some((module) => config.value!.enabled[module]))
  )
}

export async function refreshDirectoryBackup(completeRun = false): Promise<void> {
  const generation = ++refreshGeneration
  const latest = await loadConfig()
  const values = await Promise.all(MODULES.map((module) => readModuleStatus(latest, module)))
  if (generation !== refreshGeneration) return
  config.value = latest
  for (const [i, module] of MODULES.entries()) {
    if (
      !completeRun &&
      running.value &&
      ['syncing', 'initializing'].includes(statuses[module].state)
    )
      continue
    Object.assign(
      statuses[module],
      { error: undefined, processed: undefined, total: undefined },
      values[i]
    )
  }
  serviceError.value = ''
}

export function runDirectoryBackup(notifyAutomaticSuccess = true): Promise<void> {
  clearTimeout(timer)
  scheduled.value = false
  firstChange = 0
  if (currentRun) {
    requestedAgain = true
    return currentRun
  }
  const execute = async () => {
    running.value = true
    let autoNoticeActive = false
    try {
      const latest = await loadConfig()
      config.value = latest
      if (!supportsBackup() || latest.paused) return
      // 仅在有待写入数据时显示后台进度；单纯刷新状态与无变化检查不提示。
      if (notifyAutomaticSuccess && (await pendingEnabledBackups())) {
        autoNoticeActive = true
        backupNotice('directory-backup-auto-success', '正在自动备份…', true)
      }
      const updatedModules: string[] = []
      for (const module of MODULES) {
        if (!latest.enabled[module]) continue
        statuses[module].enabled = true
        const previousSuccess = statuses[module].lastSuccess
        await syncModule(latest, module, statuses[module] as ModuleProgress, () => {
          if (!autoNoticeActive) return
          const progress = statuses[module]
          const name = { outfits: '搭配码', home: '家园方案', camera: '相机参数收藏' }[module]
          const count = progress.total ? ` ${progress.processed ?? 0} / ${progress.total}` : ''
          if (progress.state === 'initializing' || progress.state === 'syncing')
            backupNotice('directory-backup-auto-success', `正在自动备份${name}${count}…`, true)
        })
        if (statuses[module].lastSuccess && statuses[module].lastSuccess !== previousSuccess)
          updatedModules.push(
            { outfits: '搭配码', home: '家园方案', camera: '相机参数收藏' }[module]
          )
      }
      if (notifyAutomaticSuccess && updatedModules.length) {
        backupNotice(
          'directory-backup-auto-success',
          `自动备份成功：${updatedModules.join('、')}。`,
          false,
          'success'
        )
        autoNoticeActive = false
      }
    } catch (error) {
      serviceError.value = error instanceof Error ? error.message : String(error)
    } finally {
      if (autoNoticeActive) backupNotice('directory-backup-auto-success', null)
      // 最终核验完成前保持 running：避免备份结束与状态回读之间短暂显示红点。
      await refreshDirectoryBackup(true).catch((error) => {
        serviceError.value = String(error)
      })
      running.value = false
      currentRun = undefined
      if (requestedAgain || MODULES.some((module) => statuses[module].state === 'waiting')) {
        requestedAgain = false
        scheduleDirectoryBackup(false)
      }
    }
  }
  currentRun = execute()
  return currentRun
}
export function scheduleDirectoryBackup(refresh = true): void {
  if (refresh) {
    // 先读取真实业务修订和待写入项，不能把之前 synced 的模块提前改为 waiting。
    void refreshDirectoryBackup()
      .then(() => scheduleDirectoryBackup(false))
      .catch((error) => {
        serviceError.value = error instanceof Error ? error.message : String(error)
      })
    return
  }
  const current = config.value
  if (
    !supportsBackup() ||
    !current?.handle ||
    current.paused ||
    !MODULES.some(
      (module) =>
        current.enabled[module] && ['waiting', 'initializing'].includes(statuses[module].state)
    )
  ) {
    if (!currentRun) {
      clearTimeout(timer)
      firstChange = 0
      scheduled.value = false
    }
    return
  }
  // 确认需要备份后才排队。排队期间持续转圈，不会闪现“未备份”红点。
  scheduled.value = true
  if (!firstChange) firstChange = Date.now()
  clearTimeout(timer)
  timer = setTimeout(
    () => {
      firstChange = 0
      void runDirectoryBackup()
    },
    Math.max(0, Math.min(2000, 10000 - (Date.now() - firstChange)))
  )
}
/** 监测外部直接清空 IndexedDB：普通轮询仅作记录数量查询，异常才读取备份状态和磁盘校验。 */
async function checkUnexpectedEmpty(): Promise<void> {
  const current = config.value
  if (
    checkingEmpty ||
    running.value ||
    !current?.handle ||
    current.paused ||
    document.visibilityState === 'hidden'
  )
    return
  const candidates = MODULES.filter(
    (module) =>
      current.enabled[module] && statuses[module].state === 'synced' && statuses[module].count > 0
  )
  if (!candidates.length) return
  checkingEmpty = true
  try {
    const counts = await Promise.all(candidates.map(countBrowserRecords))
    if (counts.some((count) => count === 0)) {
      await refreshDirectoryBackup()
      scheduleDirectoryBackup(false)
    }
  } catch (error) {
    serviceError.value = error instanceof Error ? error.message : String(error)
  } finally {
    checkingEmpty = false
  }
}
const onChange = () => scheduleDirectoryBackup()
const onFocus = () => {
  // 回到页面时静默刷新状态；仅失败需要通知用户。
  void refreshDirectoryBackup()
    .then(() => {
      if (MODULES.some((module) => ['waiting', 'initializing'].includes(statuses[module].state)))
        scheduleDirectoryBackup(false)
    })
    .catch((error) => {
      backupNotice(
        'directory-backup-background-check',
        `备份状态检查失败：${error instanceof Error ? error.message : String(error)}`,
        false,
        'error'
      )
    })
}
const onVisibility = () => {
  if (
    document.visibilityState === 'hidden' &&
    directoryBackup.hasEnabled.value &&
    !config.value?.paused
  )
    void runDirectoryBackup() // 尽力处理，不依赖 unload 完成，也不显示虚假的关闭后备份承诺。
}
/** App 级生命周期，不随桌面/紧凑顶栏切换而卸载。菜单只是状态视图。 */
export function useDirectoryBackupLifecycle() {
  onMounted(() => {
    if (++users !== 1) return
    window.addEventListener('nuan-backup-change', onChange)
    emptyCheckTimer = setInterval(() => void checkUnexpectedEmpty(), 4000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    try {
      channel = new window.BroadcastChannel('nuan-backup-change')
      channel.onmessage = onChange
    } catch {
      /* 正确性依靠持久化修订与 Web Locks；广播只改善调度延迟。 */
    }
    void refreshDirectoryBackup()
      .then(() => {
        // 初始化检查完成后先安排真正待同步的模块，再结束角标的首次加载态。
        scheduleDirectoryBackup(false)
      })
      .catch((error) => {
        serviceError.value = String(error)
      })
      .finally(() => {
        initialStatusLoading.value = false
      })
  })
  onBeforeUnmount(() => {
    if (--users > 0) return
    clearTimeout(timer)
    clearInterval(emptyCheckTimer)
    emptyCheckTimer = undefined
    firstChange = 0
    scheduled.value = false
    channel?.close()
    channel = undefined
    window.removeEventListener('nuan-backup-change', onChange)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
  })
}
