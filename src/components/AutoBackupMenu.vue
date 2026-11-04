<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  ChevronLeft,
  CircleCheck,
  CircleAlert,
  LoaderCircle,
  DatabaseBackup,
  FolderOpen,
  RotateCw,
  Download,
  X,
  AlertTriangle,
  ShieldCheck,
  Pause,
  Play,
  FolderPlus,
  Shirt,
  House,
  Camera,
  HardDrive
} from 'lucide-vue-next'
import { useModalFocus } from '../composables/useModalFocus'
import {
  directoryBackup,
  refreshDirectoryBackup,
  runDirectoryBackup,
  scheduleDirectoryBackup
} from '../composables/useDirectoryBackup'
import {
  bindDirectory,
  inspectRoot,
  permission,
  pickDirectory,
  setModuleEnabled,
  pauseForSafeCopy,
  updateConfig,
  type ModuleProgress,
  type BackupConfig
} from '../utils/directory-backup/engine'
import { MODULE_LABELS, MODULES } from '../utils/directory-backup/disk'
import { estimateBackupDiff, confirmEnable, type BackupDiff } from '../utils/directory-backup/diff'
import {
  previewRestore,
  restoreSelected,
  resumeSource,
  type RestorePreview
} from '../utils/directory-backup/restore'
import { countBrowserRecords } from '../utils/directory-backup/repository'
import { rebuildBackupDirectory } from '../utils/directory-backup/rebuild'
import { createUuid } from '../utils/uuid'
import type { BackupModule } from '../utils/directory-backup/changeJournal'
import {
  getBackupButtonStatus,
  backupButtonStatusMessages
} from '../utils/directory-backup/buttonStatus'

const props = defineProps<{ language: 'zh' | 'en'; open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'trigger-click': [event: MouseEvent]
}>()
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const {
  config,
  statuses,
  running,
  scheduled,
  initialStatusLoading,
  supported,
  hasEnabled,
  serviceError
} = directoryBackup
const buttonStatus = computed(() =>
  getBackupButtonStatus({
    config: config.value,
    statuses,
    running: running.value,
    scheduled: scheduled.value,
    initialStatusLoading: initialStatusLoading.value,
    supported: supported.value,
    serviceError: serviceError.value
  })
)
const buttonStatusLabel = computed(
  () => backupButtonStatusMessages[props.language][buttonStatus.value.reason]
)
const opened = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value)
})
const busy = ref(false),
  message = ref(''),
  isError = ref(false)
const trigger = ref<HTMLButtonElement | null>(null),
  panel = ref<HTMLElement | null>(null)
const position = ref({ top: '60px', left: '0px', maxHeight: '80vh' })
const recoveryHandle = shallowRef<FileSystemDirectoryHandle | null>(null)
const recoveryPreview = shallowRef<RestorePreview | null>(null)
const recoveryDialog = ref<HTMLDialogElement | null>(null)
const confirmationDialog = ref<HTMLDialogElement | null>(null)
const confirmation = ref({ title: '', body: '', confirm: '', danger: false })
const recoveryMode = ref<'restore' | 'inspect' | 'existing'>('restore')
const selected = ref<BackupModule[]>([])
const recoveryProgress = ref('')
const recoveryError = ref('')
const sourceOwned = ref(false)
let resolveConfirmation: ((value: boolean) => void) | undefined
const icons = { outfits: Shirt, home: House, camera: Camera }
const titleFor = (module: BackupModule) =>
  props.language === 'zh'
    ? MODULE_LABELS[module]
    : { outfits: 'Outfit codes', home: 'Home schemes', camera: 'Camera favorites' }[module]
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(props.language === 'zh' ? 'zh-CN' : 'en-US')
    : t('暂无成功备份', 'No completed backup')
const size = (bytes = 0) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`
const stateLabel = (value: ModuleProgress) =>
  ({
    disabled: t(
      value.lastSuccess ? '已停止更新' : '未开启',
      value.lastSuccess ? 'Stopped updating' : 'Off'
    ),
    'not-set': t('未设置目录', 'No folder'),
    waiting: t('待备份', 'Pending'),
    initializing: t('首次备份中', 'Initial backup'),
    syncing: t('正在备份', 'Backing up'),
    synced: t('已同步', 'Up to date'),
    error: t('备份失败', 'Failed'),
    protected: t('异常归零 · 保护暂停', 'Empty-data protection'),
    permission: t('需要授权', 'Permission needed'),
    paused: t('已暂停写盘', 'Disk writes paused')
  })[value.state]
const hasPermissionIssue = computed(() =>
  MODULES.some((module) => statuses[module].state === 'permission')
)
const BACKUP_UI_SOURCE = 'directory-backup-ui'
const BACKUP_RUN_SOURCE = 'directory-backup-run'
function notifyBackup(
  source: string,
  text: string | null,
  loading = false,
  tone: 'success' | 'error' | 'info' = 'success'
) {
  window.dispatchEvent(
    new CustomEvent('nuan-backup-notice', {
      detail: { source, message: text, loading, tone }
    })
  )
}
function beginNotice(text: string) {
  notifyBackup(BACKUP_UI_SOURCE, text, true)
}
function finishNotice(text: string | null = null, tone: 'success' | 'error' | 'info' = 'success') {
  notifyBackup(BACKUP_UI_SOURCE, text, false, tone)
}
function announce(text: string, error = false) {
  message.value = text
  isError.value = error
  finishNotice(text, error ? 'error' : 'success')
}
function report(error: unknown) {
  if ((error as DOMException).name === 'AbortError') return
  announce(error instanceof Error ? error.message : String(error), true)
}
function reportRecovery(error: unknown) {
  recoveryError.value = error instanceof Error ? error.message : String(error)
  finishNotice(recoveryError.value, 'error')
}
// 自动运行和切回页面时静默；仅用户主动执行时显示持续进度及结束结果。
const manualBackupPending = ref(false)
const backupErrorFingerprint = () =>
  [
    serviceError.value,
    ...MODULES.map((module) =>
      ['error', 'protected'].includes(statuses[module].state)
        ? statuses[module].error || module
        : ''
    )
  ]
    .filter(Boolean)
    .join('|')
let lastBackupError = backupErrorFingerprint()
watch(backupErrorFingerprint, (fingerprint) => {
  if (fingerprint && fingerprint !== lastBackupError && !manualBackupPending.value) {
    notifyBackup(
      BACKUP_RUN_SOURCE,
      t('自动备份出现错误，请查看模块状态。', 'Automatic backup failed. Check module status.'),
      false,
      'error'
    )
  }
  lastBackupError = fingerprint
})
watch(
  () => [
    running.value,
    ...MODULES.flatMap((module) => [
      statuses[module].state,
      statuses[module].processed,
      statuses[module].total
    ])
  ],
  () => {
    if (!manualBackupPending.value || !running.value) return
    const module = MODULES.find((item) =>
      ['initializing', 'syncing'].includes(statuses[item].state)
    )
    const progress = module ? statuses[module] : null
    const count = progress?.total ? ` ${progress.processed ?? 0} / ${progress.total}` : ''
    notifyBackup(
      BACKUP_RUN_SOURCE,
      module
        ? t(`正在备份${titleFor(module)}${count}…`, `Backing up ${titleFor(module)}${count}…`)
        : t('正在检查电脑备份…', 'Checking computer backup…'),
      true
    )
  }
)
async function runManualBackup() {
  if (manualBackupPending.value || running.value) return
  manualBackupPending.value = true
  notifyBackup(BACKUP_RUN_SOURCE, t('正在检查电脑备份…', 'Checking computer backup…'), true)
  try {
    await runDirectoryBackup(false)
    const failed = Boolean(backupErrorFingerprint())
    notifyBackup(
      BACKUP_RUN_SOURCE,
      failed
        ? t('备份存在错误，请查看模块状态。', 'Backup encountered an error. Check module status.')
        : t('备份检查完成，状态已更新。', 'Backup check completed. Status updated.'),
      false,
      failed ? 'error' : 'success'
    )
  } catch (error) {
    notifyBackup(
      BACKUP_RUN_SOURCE,
      error instanceof Error ? error.message : String(error),
      false,
      'error'
    )
  } finally {
    manualBackupPending.value = false
  }
}
function positionPanel() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  position.value = {
    top: `${rect.bottom + 8}px`,
    left: `${Math.max(12, Math.min(rect.left + rect.width / 2 - Math.min(490, window.innerWidth - 24) / 2, window.innerWidth - Math.min(490, window.innerWidth - 24) - 12))}px`,
    maxHeight: `${Math.max(180, window.innerHeight - rect.bottom - 20)}px`
  }
}
watch(opened, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  if (!opened.value) return
  positionPanel()
  beginNotice(t('正在读取备份状态…', 'Loading backup status…'))
  try {
    await refreshDirectoryBackup().catch(report)
  } finally {
    finishNotice()
  }
})
useModalFocus(
  opened,
  panel,
  () => {
    opened.value = false
  },
  trigger
)
// 异步操作期间按钮禁用会使焦点退回 body；完成后只在焦点丢失时恢复菜单键盘操作。
watch(busy, async (value) => {
  if (value) return
  await nextTick()
  if (opened.value && document.activeElement === document.body)
    panel.value?.focus({ preventScroll: true })
})
window.addEventListener('resize', positionPanel)
function answer(value: boolean) {
  confirmationDialog.value?.close()
  resolveConfirmation?.(value)
  resolveConfirmation = undefined
}
async function ask(
  title: string,
  body: string,
  danger = false,
  confirm = t('确认继续', 'Continue')
): Promise<boolean> {
  confirmation.value = { title, body, danger, confirm }
  await nextTick()
  confirmationDialog.value?.showModal()
  return new Promise((resolve) => {
    resolveConfirmation = resolve
  })
}
async function showPreview(
  handle: FileSystemDirectoryHandle,
  mode: 'restore' | 'inspect' | 'existing'
) {
  recoveryHandle.value = handle
  recoveryMode.value = mode
  recoveryError.value = ''
  recoveryProgress.value = ''
  const marker = await inspectRoot(handle)
  sourceOwned.value = marker?.sourceId === config.value?.sourceId
  const preview = await previewRestore(handle)
  recoveryPreview.value = preview
  selected.value = preview.modules.filter((item) => item.ready).map((item) => item.module)
  opened.value = false
  await nextTick()
  if (!recoveryDialog.value?.open) recoveryDialog.value?.showModal()
  finishNotice(
    t('目录检查已完成，请查看各模块结果。', 'Folder checked. Review each module.'),
    'info'
  )
}
async function selectDirectory() {
  try {
    const handle = await pickDirectory()
    busy.value = true
    beginNotice(t('正在检查备份目录…', 'Checking backup folder…'))
    const marker = await inspectRoot(handle)
    if (marker) {
      await showPreview(handle, 'existing')
      return
    }
    await bindDirectory(handle)
    await refreshDirectoryBackup()
    announce(
      t(
        '目录已设置。开关保持原状；未开启的模块不会写入。旧目录中的副本保留，但不再更新。',
        'Folder selected; switches are unchanged. Disabled modules will not write. Any old folder is retained and no longer updated.'
      )
    )
    scheduleDirectoryBackup(false)
  } catch (error) {
    report(error)
  } finally {
    busy.value = false
    finishNotice()
  }
}
async function restorePicker() {
  try {
    const handle = await pickDirectory(true)
    busy.value = true
    beginNotice(t('正在读取并校验备份…', 'Reading and verifying backup…'))
    await showPreview(handle, 'restore')
  } catch (error) {
    report(error)
  } finally {
    busy.value = false
    finishNotice()
  }
}
async function authorize() {
  if (!config.value?.handle) return
  beginNotice(t('正在重新授权备份目录…', 'Reauthorizing backup directory…'))
  try {
    if (!(await permission(config.value.handle, true)))
      throw new Error(
        t(
          '未授予目录权限，浏览器中的数据仍然保留。',
          'Folder permission was not granted. Browser data is unchanged.'
        )
      )
    await refreshDirectoryBackup()
    await runDirectoryBackup()
    announce(t('备份目录权限已更新。', 'Backup folder permission updated.'))
  } catch (error) {
    report(error)
  } finally {
    finishNotice()
  }
}
async function confirmDiff(module: BackupModule, diff: BackupDiff): Promise<boolean> {
  if (!diff.backupCount) return true
  if (
    !(await ask(
      t('核对电脑副本变更', 'Review backup changes'),
      t(
        `${titleFor(module)}：新增 ${diff.added} 条、修改 ${diff.updated} 条、从电脑副本删除 ${diff.removed} 条。\n浏览器当前 ${diff.browserCount} 条，电脑副本 ${diff.backupCount} 条。\n自动备份只保留最新状态，不能撤销误删或误改。`,
        `${titleFor(module)}: add ${diff.added}, update ${diff.updated}, delete ${diff.removed}. Browser: ${diff.browserCount}; backup: ${diff.backupCount}. Only the latest state is kept.`
      ),
      diff.removed > 0
    ))
  )
    return false
  if (diff.removed === diff.backupCount && diff.browserCount === 0)
    return ask(
      t('再次确认：将清空电脑副本', 'Confirm erasing this backup'),
      t(
        `当前浏览器中没有${titleFor(module)}记录。继续后将从电脑副本删除全部 ${diff.backupCount} 条记录及图片，不能撤销。`,
        `The browser is empty. All ${diff.backupCount} backed-up records and images will be deleted. This cannot be undone.`
      ),
      true,
      t('确认清空副本', 'Erase backup')
    )
  return true
}
async function toggleModule(module: BackupModule) {
  const current = config.value
  if (!current || busy.value) return
  busy.value = true
  beginNotice(t(`正在核对${titleFor(module)}备份状态…`, `Checking ${titleFor(module)} backup…`))
  try {
    if (current.enabled[module]) {
      await setModuleEnabled(module, false)
      await refreshDirectoryBackup()
      announce(
        t(
          '已停止更新，最后成功的电脑副本、时间和条数仍保留。',
          'Updates stopped. The last completed copy, time, and count are retained.'
        )
      )
      return
    }
    if (current.handle && !(await permission(current.handle, true)))
      throw new Error(
        t(
          '请先授予目录权限；编辑不受影响。',
          'Please grant folder permission. Editing is unaffected.'
        )
      )
    const diff = await estimateBackupDiff(current, module)
    if (!(await confirmDiff(module, diff))) return
    await confirmEnable(module, diff)
    await refreshDirectoryBackup()
    announce(t(`${titleFor(module)}自动备份已开启。`, `${titleFor(module)} backup enabled.`))
    if (!current.handle)
      announce(
        t(
          '开关已开启，选择目录后才会开始备份。当前仍可正常编辑。',
          'Enabled; backup will start after choosing a folder. Editing remains available.'
        )
      )
    else scheduleDirectoryBackup(false)
  } catch (error) {
    report(error)
  } finally {
    busy.value = false
    finishNotice()
  }
}
async function inspectCurrent() {
  if (!config.value?.handle) return
  busy.value = true
  beginNotice(t('正在检查备份完整性…', 'Verifying backup integrity…'))
  try {
    await showPreview(config.value.handle, 'inspect')
  } catch (error) {
    report(error)
  } finally {
    busy.value = false
    finishNotice()
  }
}
async function pauseOrResume() {
  busy.value = true
  beginNotice(
    config.value?.paused
      ? t('正在恢复自动备份…', 'Resuming backup…')
      : t('正在完成写盘并校验…', 'Finishing writes and verifying…')
  )
  try {
    if (config.value?.paused) {
      await updateConfig((current) => {
        current.paused = false
      })
      await refreshDirectoryBackup()
      scheduleDirectoryBackup(false)
      announce(
        t(
          '已恢复自动备份，暂停期间的修改将继续写盘。',
          'Backup resumed. Pending edits will be written.'
        )
      )
    } else {
      await pauseForSafeCopy()
      await refreshDirectoryBackup()
      if (config.value?.handle) {
        const preview = await previewRestore(config.value.handle)
        const invalid = preview.modules.filter(
          (item) => !item.ready && item.message !== '未发现此模块备份'
        )
        if (invalid.length)
          throw new Error(
            t(
              '已暂停写盘，但目录未通过完整校验，暂不建议复制：',
              'Writes are paused, but the folder is not fully verified: '
            ) + invalid.map((x) => `${x.title}：${x.message}`).join('；')
          )
      }
      announce(
        t(
          '已停止写盘并完成目录校验，可以复制文件夹。暂停期间仍可编辑，但新修改尚未包含在副本中；复制完成后请恢复自动备份。',
          'Writes are paused and the folder is verified. It can now be copied. Edits made while paused are not included; resume after copying.'
        )
      )
    }
  } catch (error) {
    report(error)
    await refreshDirectoryBackup()
  } finally {
    busy.value = false
    finishNotice()
  }
}
async function resume(module: BackupModule) {
  const handle = recoveryHandle.value
  if (!handle) return
  if (
    !(await ask(
      t('确认修改来源目录', 'Resume source folder'),
      t(
        '将完成已验证的待提交批次，或清理尚未准备完成的暂存文件。不会恢复历史版本。是否继续？',
        'Complete the verified pending batch, or remove unprepared temporary files. This does not restore historical versions. Continue?'
      )
    ))
  )
    return
  try {
    if (!(await permission(handle, true)))
      throw new Error(t('未取得来源目录写入权限。', 'Write permission was not granted.'))
    busy.value = true
    beginNotice(t('正在续写并校验来源目录…', 'Resuming and verifying source folder…'))
    await resumeSource(handle, module)
    await showPreview(handle, recoveryMode.value)
  } catch (error) {
    reportRecovery(error)
  } finally {
    busy.value = false
    finishNotice()
  }
}
async function confirmRestore() {
  const handle = recoveryHandle.value,
    preview = recoveryPreview.value
  if (!handle || !preview || !selected.value.length) return
  if (
    !(await ask(
      t('按模块完整替换', 'Replace selected modules'),
      t(
        `即将完整替换：${selected.value.map(titleFor).join('、')}。\n当前浏览器中的对应记录、图片和标签将被替换，不是合并导入，不能撤销。建议先保留手动 ZIP 备份。\n恢复后只暂停这些模块的自动备份，共用目录和其他模块不变。`,
        `Replace ${selected.value.map(titleFor).join(', ')} including records, images, and tags. This is not a merge and cannot be undone. Consider a manual ZIP backup first. Restored modules pause; the shared folder and other modules remain unchanged.`
      ),
      true,
      t('确认恢复', 'Restore selected')
    ))
  )
    return
  busy.value = true
  beginNotice(t('正在恢复所选模块…', 'Restoring selected modules…'))
  recoveryError.value = ''
  try {
    const modules = [...selected.value]
    const result = await restoreSelected(
      handle,
      preview,
      modules,
      (text) => {
        recoveryProgress.value = text
        beginNotice(text)
      },
      (module) => {
        window.dispatchEvent(new CustomEvent('nuan-directory-restored', { detail: [module] }))
      }
    )
    await refreshDirectoryBackup()
    recoveryDialog.value?.close()
    opened.value = true
    positionPanel()
    announce(
      t(
        `已恢复：${result.join('、')}。这些模块的自动备份已暂停，请重新确认后续备份目录；其他模块不受影响。`,
        `Restored: ${result.join(', ')}. These modules are paused; confirm their backup destination before re-enabling. Other modules are unchanged.`
      )
    )
  } catch (error) {
    reportRecovery(error)
    await refreshDirectoryBackup()
  } finally {
    busy.value = false
    recoveryProgress.value = ''
    finishNotice()
  }
}
async function createSeparateArchive() {
  const handle = recoveryHandle.value
  if (!handle) return
  if (
    !(await ask(
      t('在新子目录备份', 'Create a separate archive'),
      t(
        '将在所选目录中建立独立的新子目录，保留原来的全部备份。新目录用于当前浏览器数据，模块开关保持原状。',
        'Create a separate subfolder for current browser data. Existing backups are preserved and switches stay unchanged.'
      )
    ))
  )
    return
  try {
    if (!(await permission(handle, true))) throw new Error('未授予目录写入权限')
    busy.value = true
    beginNotice(t('正在建立新的备份存档…', 'Creating a separate backup archive…'))
    const name = `暖立方-新存档-${new Date().toISOString().slice(0, 10)}-${createUuid().slice(0, 8)}`
    const directory = await handle.getDirectoryHandle(name, { create: true })
    await bindDirectory(directory)
    await refreshDirectoryBackup()
    recoveryDialog.value?.close()
    opened.value = true
    positionPanel()
    announce(
      t(
        '已使用新子目录，原备份未修改。',
        'New subfolder selected; the original backup is unchanged.'
      )
    )
    scheduleDirectoryBackup(false)
  } catch (error) {
    reportRecovery(error)
  } finally {
    busy.value = false
    finishNotice()
  }
}
async function useExisting() {
  const handle = recoveryHandle.value,
    current = config.value
  if (!handle || !current || !sourceOwned.value) return
  busy.value = true
  beginNotice(t('正在核对并绑定已有目录…', 'Checking and binding existing folder…'))
  try {
    const marker = await inspectRoot(handle)
    const prospective: BackupConfig = { ...current, handle, backupId: marker?.backupId }
    const diffs: Partial<Record<BackupModule, BackupDiff & { emptyApproved?: boolean }>> = {}
    for (const module of MODULES)
      if (current.enabled[module]) {
        const diff = await estimateBackupDiff(prospective, module)
        if (!(await confirmDiff(module, diff))) return
        diffs[module] = {
          ...diff,
          emptyApproved:
            diff.backupCount > 0 && diff.browserCount === 0 && diff.removed === diff.backupCount
        }
      }
    await bindDirectory(handle, {
      binding: current.binding,
      backupId: marker?.backupId,
      enabled: { ...current.enabled },
      diffs
    })
    await refreshDirectoryBackup()
    recoveryDialog.value?.close()
    opened.value = true
    positionPanel()
    announce(
      t(
        '已绑定已有目录，原有模块开关保持不变。',
        'Existing folder selected; switches are unchanged.'
      )
    )
    scheduleDirectoryBackup(false)
  } catch (error) {
    reportRecovery(error)
  } finally {
    busy.value = false
    finishNotice()
  }
}
async function rebuildCurrent() {
  const handle = recoveryHandle.value ?? config.value?.handle
  if (!handle) return
  beginNotice(t('正在统计浏览器数据…', 'Counting browser records…'))
  let counts: string[]
  try {
    counts = await Promise.all(
      MODULES.map(
        async (module) =>
          titleFor(module) + ' ' + (await countBrowserRecords(module)) + t(' 条', ' records')
      )
    )
  } catch (error) {
    reportRecovery(error)
    return
  } finally {
    finishNotice()
  }
  if (
    !(await ask(
      t('以当前浏览器数据重建', 'Rebuild from browser data'),
      t(
        '这是一项手动重建，将用当前浏览器的三个模块完整替换这份电脑备份：\n' +
          counts.join('；') +
          '。\n自动备份开关保持原状。新副本全部写入并校验完成后才切换，随后删除旧副本；需要同时容纳新旧副本的空间。',
        'Manually replace this computer archive with all three current browser modules: ' +
          counts.join('; ') +
          '. Switches stay unchanged. The new copy is verified before switching and the old copy is then removed. Space for both copies is required.'
      ),
      true,
      t('继续核对', 'Continue review')
    ))
  )
    return
  if (
    !(await ask(
      t('再次确认覆盖旧副本', 'Confirm replacing the old copy'),
      t(
        '重建成功后不能找回原副本。当前浏览器为空的模块会使对应电脑副本变为空。请确认没有其他浏览器、网站来源或设备正在写入这个目录。',
        'The old copy cannot be recovered after rebuilding. Empty browser modules produce empty backups. Confirm that no other browser, origin, or device is writing this folder.'
      ),
      true,
      t('确认重建', 'Rebuild now')
    ))
  )
    return
  try {
    if (!(await permission(handle, true))) throw new Error('未授予目录写入权限')
    busy.value = true
    beginNotice(t('正在重建并校验电脑备份…', 'Rebuilding and verifying backup…'))
    recoveryError.value = ''
    await rebuildBackupDirectory(handle, (text) => {
      recoveryProgress.value = text
      beginNotice(text)
    })
    await refreshDirectoryBackup()
    recoveryDialog.value?.close()
    opened.value = true
    positionPanel()
    announce(
      t(
        '重建已完成并校验，旧副本已清理。模块开关保持原状。',
        'Rebuild verified and completed; the old copy has been removed. Switches are unchanged.'
      )
    )
    scheduleDirectoryBackup(false)
  } catch (error) {
    reportRecovery(error)
  } finally {
    busy.value = false
    recoveryProgress.value = ''
    finishNotice()
  }
}
function closeRecovery() {
  if (!busy.value) recoveryDialog.value?.close()
}
onBeforeUnmount(() => {
  window.removeEventListener('resize', positionPanel)
  resolveConfirmation?.(false)
  if (confirmationDialog.value?.open) confirmationDialog.value.close()
  if (recoveryDialog.value?.open) recoveryDialog.value.close()
})
</script>

<template>
  <div class="header-menu-wrap auto-backup-trigger">
    <button
      ref="trigger"
      type="button"
      class="header-icon-button auto-backup-button"
      :title="buttonStatusLabel"
      :aria-label="`${t('自动备份', 'Auto backup')}：${buttonStatusLabel}`"
      :aria-expanded="opened"
      aria-haspopup="dialog"
      aria-controls="auto-backup-panel"
      @click.stop="emit('trigger-click', $event)"
    >
      <DatabaseBackup :size="17" /><span>{{ t('自动备份', 'Auto backup') }}</span
      ><ChevronLeft
        class="header-menu-chevron"
        :size="14"
        :class="{ 'is-open': opened }"
        aria-hidden="true"
      />
      <span class="auto-backup-status" :data-state="buttonStatus.state" aria-hidden="true">
        <CircleCheck v-if="buttonStatus.state === 'success'" :size="16" />
        <CircleAlert v-else-if="buttonStatus.state === 'warning'" :size="16" />
        <LoaderCircle
          v-else-if="buttonStatus.state === 'syncing'"
          :size="16"
          class="auto-backup-spinning"
        />
      </span>
    </button>
    <Teleport to="body">
      <section
        v-if="opened"
        id="auto-backup-panel"
        ref="panel"
        class="auto-backup-panel"
        :style="position"
        role="dialog"
        :aria-label="t('电脑自动备份设置', 'Computer backup settings')"
        tabindex="-1"
        @click.stop
      >
        <header class="auto-backup-heading"
          ><div
            ><strong>{{ t('电脑自动备份', 'Computer backup') }}</strong>
            <small>{{ t('原始数据 · 最新状态副本', 'Original data · Latest state') }}</small></div
          >
          <button
            class="auto-backup-close"
            type="button"
            :aria-label="t('关闭', 'Close')"
            @click="opened = false"
            ><X :size="17" /></button
        ></header>
        <p class="auto-backup-caption">{{
          t(
            '默认关闭。浏览器仍是主存储，未设置目录或备份失败均不影响编辑。',
            'Off by default. Browser storage remains primary; missing or failed backups do not block edits.'
          )
        }}</p>
        <p v-if="!supported" class="auto-backup-notice error">{{
          t(
            '此浏览器不支持电脑目录备份。仍可正常使用编辑及手动 ZIP 导入导出。',
            'Folder backup is unavailable. Editing and manual ZIP import/export still work.'
          )
        }}</p>
        <div class="auto-backup-directory-row">
          <div class="auto-backup-directory" :title="config?.directoryName"
            ><HardDrive :size="14" />
            <span>{{
              config?.directoryName || t('尚未选择备份目录', 'No backup folder selected')
            }}</span></div
          >
          <div class="auto-backup-actions">
            <button type="button" :disabled="busy || !supported" @click="selectDirectory"
              ><FolderOpen :size="16" />{{ t('选择备份目录', 'Choose folder') }}</button
            >
            <button type="button" :disabled="busy || !supported" @click="restorePicker"
              ><Download :size="16" />{{ t('从目录恢复', 'Restore from folder') }}</button
            >
          </div>
        </div>
        <section v-for="module in MODULES" :key="module" class="auto-backup-module">
          <div class="auto-backup-module-heading"
            ><component :is="icons[module]" :size="17" /><strong>{{ titleFor(module) }}</strong>
            <button
              type="button"
              class="auto-backup-switch"
              role="switch"
              :aria-checked="config?.enabled[module] ?? false"
              :aria-label="titleFor(module) + t('自动备份', ' auto backup')"
              :disabled="busy || !supported"
              @click="toggleModule(module)"
              ><span
            /></button>
          </div>
          <div class="auto-backup-meta"
            ><span class="auto-backup-state" :data-state="statuses[module].state">{{
              stateLabel(statuses[module])
            }}</span>
            <span
              >{{ t('已备份', 'Backed up') }} <b>{{ statuses[module].count.toLocaleString() }}</b>
              {{ t('条', 'records') }}</span
            ></div
          >
          <p class="auto-backup-date"
            >{{ t('上次成功：', 'Last success: ') }}{{ date(statuses[module].lastSuccess) }}</p
          >
          <div v-if="statuses[module].state === 'initializing'" class="auto-backup-progress">
            <progress
              :value="statuses[module].processed ?? 0"
              :max="Math.max(1, statuses[module].total ?? 1)"
            />
            <small
              >{{ statuses[module].processed ?? 0 }} / {{ statuses[module].total ?? '…' }}
              {{ t('条', 'records') }} · {{ size(statuses[module].bytes) }}</small
            >
          </div>
          <p v-if="statuses[module].error" class="auto-backup-notice error">{{
            statuses[module].error
          }}</p>
        </section>
        <div class="auto-backup-actions auto-backup-bottom">
          <button
            type="button"
            :disabled="busy || running || !hasEnabled || !supported || config?.paused"
            @click="runManualBackup"
          >
            <RotateCw :size="15" :class="{ 'auto-backup-spinning': running }" />{{
              running ? t('正在备份', 'Backing up') : t('立即备份 / 重试', 'Back up now / Retry')
            }}</button
          >
          <button v-if="hasPermissionIssue" type="button" :disabled="busy" @click="authorize">{{
            t('重新授权', 'Reauthorize')
          }}</button>
        </div>
        <details class="auto-backup-tools"
          ><summary>{{ t('校验与安全复制', 'Verification and safe copying') }}</summary
          ><div class="auto-backup-actions">
            <button
              type="button"
              :disabled="busy || !config?.handle || !supported"
              @click="inspectCurrent"
              ><ShieldCheck :size="15" />{{ t('完整性检查', 'Verify integrity') }}</button
            >
            <button
              type="button"
              :disabled="busy || !config?.handle || !supported"
              @click="pauseOrResume"
              ><component :is="config?.paused ? Play : Pause" :size="15" />
              {{
                config?.paused
                  ? t('恢复自动备份', 'Resume backup')
                  : t('暂停备份 / 安全复制', 'Pause / Safe copy')
              }}</button
            ></div
          ></details
        >
        <p class="auto-backup-caption auto-backup-limits">{{
          t(
            '删除同步后，电脑副本也会删除；不保留历史。仅在网页运行且权限有效时更新。',
            'Synced deletions also remove the computer copy. No history is kept. Updates require this page to be running and authorized.'
          )
        }}</p>
        <p
          v-if="message || serviceError"
          class="auto-backup-notice"
          :class="{ error: isError || serviceError }"
          role="status"
        >
          <AlertTriangle v-if="isError || serviceError" :size="14" />{{
            serviceError || message
          }}</p
        >
      </section>
      <dialog
        ref="recoveryDialog"
        class="auto-backup-dialog auto-backup-recovery"
        @cancel="busy && $event.preventDefault()"
      >
        <header
          ><DatabaseBackup :size="23" /><div
            ><h2>{{
              recoveryMode === 'inspect'
                ? t('备份完整性检查', 'Backup integrity')
                : recoveryMode === 'existing'
                  ? t('发现已有电脑备份', 'Existing backup found')
                  : t('从电脑目录恢复', 'Restore from folder')
            }}</h2>
            <small>{{ recoveryHandle?.name }}</small></div
          ><button
            type="button"
            class="auto-backup-close"
            :disabled="busy"
            :aria-label="t('关闭', 'Close')"
            @click="closeRecovery"
            ><X :size="19" /></button
        ></header>
        <div class="auto-backup-dialog-content">
          <p>{{
            t(
              '先只读检查完整性。恢复会按模块完整替换浏览器数据，不是合并导入；坏记录或缺图只阻止对应模块。',
              'Read-only verification comes first. Restoration replaces complete modules rather than merging. Corruption blocks only the affected module.'
            )
          }}</p>
          <section
            v-for="item in recoveryPreview?.modules"
            :key="item.module"
            class="auto-backup-restore-module"
            :class="{ invalid: !item.ready }"
          >
            <label class="app-checkbox-label"
              ><input
                v-if="recoveryMode !== 'inspect'"
                v-model="selected"
                class="app-checkbox"
                style="--checkbox-size: 18px"
                type="checkbox"
                :value="item.module"
                :disabled="!item.ready || busy"
              />
              <component :is="icons[item.module]" :size="17" /><strong>{{
                titleFor(item.module)
              }}</strong></label
            >
            <div class="auto-backup-restore-counts"
              ><span
                >{{ t('浏览器', 'Browser') }} <b>{{ item.browserCount.toLocaleString() }}</b>
                {{ t('条', 'records') }}</span
              ><span>→</span>
              <span
                >{{ t('备份', 'Backup') }} <b>{{ item.backupCount.toLocaleString() }}</b>
                {{ t('条', 'records') }}</span
              ></div
            >
            <small>{{ size(item.imageBytes) }} · {{ date(item.lastSuccess) }}</small>
            <p :class="{ 'auto-backup-error-text': !item.ready }">{{ item.message }}</p>
            <button
              v-if="item.canResume"
              class="auto-backup-secondary"
              type="button"
              :disabled="busy"
              @click="resume(item.module)"
              >{{ t('确认续写 / 清理暂存并复查', 'Resume / Clean temporary files') }}</button
            >
          </section>
          <div v-if="recoveryMode === 'existing'" class="auto-backup-existing"
            ><p>{{
              t(
                '仅选择已有目录不会覆盖或清空它。可先恢复，也可另建子目录保存当前数据。',
                'Selecting an existing folder never overwrites it. Restore it, or create a new subfolder for current data.'
              )
            }}</p
            ><div class="auto-backup-actions">
              <button type="button" :disabled="busy" @click="createSeparateArchive"
                ><FolderPlus :size="15" />{{ t('使用新子目录', 'Use a new subfolder') }}</button
              >
              <button v-if="sourceOwned" type="button" :disabled="busy" @click="useExisting">{{
                t('继续使用此目录', 'Use this folder')
              }}</button></div
            ></div
          >
          <details class="auto-backup-tools auto-backup-rebuild"
            ><summary>{{ t('高级：以当前数据重建', 'Advanced: rebuild this archive') }}</summary>
            <p>{{
              t(
                '不会自动覆盖已有目录。只有明确确认重建，才会用浏览器数据替换旧副本。',
                'Existing folders are never overwritten automatically. Rebuilding explicitly replaces the old copy with browser data.'
              )
            }}</p>
            <button
              type="button"
              class="auto-backup-secondary"
              :disabled="busy"
              @click="rebuildCurrent"
              >{{ t('重建 / 完成上次重建', 'Rebuild / Finish interrupted rebuild') }}</button
            >
          </details>
          <p v-if="recoveryProgress" class="auto-backup-notice" role="status">{{
            recoveryProgress
          }}</p>
          <p v-if="recoveryError" class="auto-backup-notice error" role="alert">{{
            recoveryError
          }}</p>
        </div>
        <footer class="confirm-dialog-actions"
          ><button
            type="button"
            class="confirm-dialog-button ghost dialog-action-control"
            :disabled="busy"
            @click="closeRecovery"
            >{{ t('关闭', 'Close') }}</button
          >
          <button
            v-if="recoveryMode === 'inspect'"
            type="button"
            class="confirm-dialog-button primary"
            :disabled="busy"
            @click="recoveryMode = 'restore'"
            >{{ t('从该目录恢复', 'Restore this folder') }}</button
          >
          <button
            v-else
            type="button"
            class="confirm-dialog-button primary"
            :disabled="busy || !selected.length"
            @click="confirmRestore"
            >{{
              busy ? t('处理中…', 'Processing…') : t('恢复所选模块', 'Restore selected modules')
            }}</button
          ></footer
        >
      </dialog>
      <dialog
        ref="confirmationDialog"
        class="auto-backup-dialog auto-backup-confirm"
        @cancel.prevent="answer(false)"
      >
        <header
          ><AlertTriangle
            v-if="confirmation.danger"
            :size="22"
            class="auto-backup-error-text"
          /><h2>{{ confirmation.title }}</h2></header
        >
        <div class="auto-backup-dialog-content"
          ><p class="auto-backup-confirm-copy">{{ confirmation.body }}</p></div
        >
        <footer class="confirm-dialog-actions"
          ><button
            type="button"
            class="confirm-dialog-button ghost dialog-action-control"
            @click="answer(false)"
            >{{ t('取消', 'Cancel') }}</button
          >
          <button type="button" class="confirm-dialog-button primary" @click="answer(true)">{{
            confirmation.confirm
          }}</button></footer
        >
      </dialog>
    </Teleport>
  </div>
</template>

<style scoped>
.auto-backup-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
/* 角标脱离文档流，不改变按钮、文字和箭头尺寸，也不创建额外的点击目标。 */
.auto-backup-status {
  position: absolute;
  top: -3px;
  right: -3px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface-strong);
  color: var(--notice-error);
  pointer-events: none;
}
.auto-backup-status[data-state='pending'] {
  background: transparent;
}
.auto-backup-status[data-state='pending']::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 2px var(--surface-strong);
}
.auto-backup-status[data-state='success'] {
  color: var(--notice-success);
}
.auto-backup-status[data-state='warning'] {
  color: var(--notice-warning);
}
.auto-backup-status[data-state='syncing'] {
  color: var(--pink-deep);
}
.auto-backup-panel {
  position: fixed;
  z-index: 65;
  width: min(490px, calc(100vw - 24px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--ui-radius);
  background: var(--menu-bg);
  backdrop-filter: blur(16px) saturate(1.5);
  box-shadow: var(--shadow);
  color: var(--text);
  font-size: 13px;
  line-height: 1.6;
}
.auto-backup-heading,
.auto-backup-module-heading {
  display: flex;
  align-items: center;
  gap: 9px;
}
.auto-backup-heading > div {
  display: grid;
  gap: 2px;
}
.auto-backup-heading strong {
  font-size: 16px;
  color: var(--heading);
}
.auto-backup-heading small,
.auto-backup-caption,
.auto-backup-date,
.auto-backup-directory,
.auto-backup-dialog small {
  color: var(--muted);
}
.auto-backup-close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--icon-button-bg);
  color: var(--text);
  cursor: pointer;
}
.auto-backup-close:hover {
  background: var(--icon-button-hover-bg);
}
.auto-backup-caption {
  margin: 10px 0;
  font-size: 12px;
  line-height: 1.65;
}
.auto-backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}
.auto-backup-actions button,
.auto-backup-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  transition:
    background var(--motion-fast),
    border-color var(--motion-fast),
    transform var(--motion-fast);
}
.auto-backup-actions button:hover:not(:disabled),
.auto-backup-secondary:hover:not(:disabled) {
  background: var(--menu-hover-bg);
  border-color: var(--menu-hover-border);
  color: var(--menu-hover-text);
}
.auto-backup-actions button:active:not(:disabled),
.auto-backup-secondary:active:not(:disabled) {
  transform: scale(0.98);
}
.auto-backup-panel button:focus-visible,
.auto-backup-dialog button:focus-visible,
.auto-backup-panel summary:focus-visible {
  outline: 2px solid var(--focus-ring-color);
  outline-offset: 3px;
}
.auto-backup-directory-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.auto-backup-directory-row .auto-backup-actions {
  flex: none;
  flex-wrap: nowrap;
}
.auto-backup-directory-row .auto-backup-actions button {
  white-space: nowrap;
}
.auto-backup-directory {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  background: var(--surface-accent-subtle);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-sm);
  font-size: 12px;
}
@media (max-width: 600px) {
  .auto-backup-panel {
    width: min(390px, calc(100vw - 24px));
  }
  .auto-backup-directory-row {
    flex-direction: column;
    align-items: stretch;
    gap: 0;
  }
  .auto-backup-directory-row .auto-backup-actions {
    order: -1;
    flex-wrap: wrap;
  }
}
.auto-backup-directory span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.auto-backup-directory svg {
  flex: none;
}
.auto-backup-module {
  padding: 14px 0;
  border-bottom: 1px solid var(--line-soft);
}
.auto-backup-module-heading strong {
  color: var(--heading);
  font-size: 13px;
  font-weight: 600;
}
.auto-backup-module-heading > svg {
  color: var(--pink-deep);
}
.auto-backup-switch {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  width: 36px;
  height: 21px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-soft);
  flex: none;
}
.auto-backup-switch span {
  display: block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--muted);
  transition:
    transform var(--motion-base),
    background var(--motion-base);
}
.auto-backup-switch[aria-checked='true'] {
  background: var(--primary-button-bg);
  border-color: var(--primary-button-bg);
}
.auto-backup-switch[aria-checked='true'] span {
  transform: translateX(15px);
  background: var(--primary-text);
}
.auto-backup-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 7px;
  font-size: 12px;
}
.auto-backup-meta b {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.auto-backup-state {
  color: var(--muted);
}
.auto-backup-state[data-state='synced'] {
  color: var(--notice-success);
}
.auto-backup-state[data-state='waiting'],
.auto-backup-state[data-state='initializing'],
.auto-backup-state[data-state='paused'],
.auto-backup-state[data-state='protected'] {
  color: var(--notice-warning);
}
.auto-backup-state[data-state='error'],
.auto-backup-state[data-state='permission'],
.auto-backup-error-text {
  color: var(--notice-error);
}
.auto-backup-date {
  margin: 3px 0 0;
  font-size: 11px;
}
.auto-backup-progress {
  display: grid;
  gap: 3px;
  margin-top: 8px;
}
.auto-backup-progress progress {
  width: 100%;
  height: 5px;
  accent-color: var(--pink-deep);
}
.auto-backup-progress small {
  color: var(--muted);
  font-size: 11px;
}
.auto-backup-bottom {
  margin-bottom: 8px;
}
.auto-backup-tools summary {
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
}
.auto-backup-limits {
  border-top: 1px solid var(--line-soft);
  padding-top: 10px;
  margin-bottom: 0;
}
.auto-backup-notice {
  display: block;
  margin: 10px 0 0;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--surface-accent-subtle);
  color: var(--text);
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.7;
}
.auto-backup-notice svg {
  vertical-align: -2px;
  margin-right: 4px;
}
.auto-backup-notice.error {
  color: var(--notice-error);
}
.auto-backup-dialog {
  position: fixed;
  inset: 0;
  margin: auto;
  width: min(650px, calc(100vw - 32px));
  max-height: 86vh;
  max-height: 86dvh;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-strong);
  color: var(--text);
  box-shadow: var(--dialog-shadow);
  font-size: 13px;
  line-height: 1.7;
}
.auto-backup-dialog[open] {
  display: flex;
  flex-direction: column;
}
.auto-backup-dialog::backdrop {
  background: var(--overlay-bg);
}
.auto-backup-dialog > header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--line-soft);
  flex: none;
}
.auto-backup-dialog > header > svg {
  color: var(--pink-deep);
}
.auto-backup-dialog h2 {
  margin: 0;
  font-size: 17px;
  color: var(--heading);
}
.auto-backup-dialog-content {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 22px;
}
.auto-backup-dialog-content > p {
  margin: 0 0 14px;
}
.auto-backup-restore-module {
  padding: 14px;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  margin-top: 10px;
  background: var(--surface-soft);
}
.auto-backup-restore-module label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--heading);
}
.auto-backup-restore-counts {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 8px 0 2px;
  font-variant-numeric: tabular-nums;
}
.auto-backup-restore-module p {
  margin: 5px 0 0;
  font-size: 12px;
}
.auto-backup-secondary {
  margin-top: 8px;
}
.auto-backup-dialog > footer {
  --dialog-accent: var(--primary-button-bg);
  --dialog-primary-dark-text: var(--primary-text);
  padding: 12px 22px;
  border-top: 1px solid var(--line-soft);
  flex: none;
}
.auto-backup-existing {
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid var(--line-soft);
}
.auto-backup-existing p {
  margin: 0;
}
.auto-backup-confirm {
  width: min(510px, calc(100vw - 32px));
}
.auto-backup-confirm-copy {
  white-space: pre-line;
}
@media (prefers-reduced-motion: no-preference) {
  .auto-backup-panel {
    animation: auto-backup-in var(--motion-base) ease-out;
  }
  .auto-backup-spinning {
    animation: auto-backup-spin 1s linear infinite;
  }
}
@keyframes auto-backup-in {
  from {
    opacity: 0;
    translate: 0 -5px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}
@keyframes auto-backup-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
