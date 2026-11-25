<script setup lang="ts">
import { useModuleOperation } from '../composables/useOperationCoordinator'
import CollectionActions from './CollectionActions.vue'
import TreeCollapse from './TreeCollapse.vue'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  DatabaseBackup,
  Download,
  X,
  AlertTriangle,
  ShieldCheck,
  Pause,
  FolderPlus,
  Shirt,
  House,
  Camera,
  Folder,
  ChevronRight,
  RotateCcw
} from 'lucide-vue-next'

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
import { browserBaseline, type BrowserBaseline } from '../utils/directory-backup/repository'
import { rebuildBackupDirectory } from '../utils/directory-backup/rebuild'
import type { BackupModule } from '../utils/directory-backup/changeJournal'
import {
  getBackupButtonStatus,
  backupButtonStatusMessages
} from '../utils/directory-backup/buttonStatus'

const props = defineProps<{ language: 'zh' | 'en' }>()
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
// 多个模块遇到同一异常时，在共用目录栏展示一次原因。
const sharedError = computed(() => {
  const errors = MODULES.map((module) => statuses[module].error).filter((error): error is string =>
    Boolean(error)
  )
  return errors.find((error) => errors.filter((value) => value === error).length > 1) ?? ''
})
const busy = ref(false)
const recoveryHandle = shallowRef<FileSystemDirectoryHandle | null>(null)
const recoveryPreview = shallowRef<RestorePreview | null>(null)
const previewOpen = ref(false)
const previewTrigger = ref<HTMLButtonElement | null>(null)
const restoreTrigger = ref<HTMLButtonElement | null>(null)
const confirmationDialog = ref<HTMLDialogElement | null>(null)
const confirmation = ref({ title: '', body: '', confirm: '', danger: false })
const recoveryMode = ref<'restore' | 'inspect' | 'existing'>('restore')
const selected = ref<BackupModule[]>([])
const recoveryProgress = ref('')
const recoveryError = ref('')
const sourceOwned = computed(
  () => !!recoveryPreview.value && recoveryPreview.value.sourceId === config.value?.sourceId
)
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
    const state = buttonStatus.value.state
    notifyBackup(
      BACKUP_RUN_SOURCE,
      state === 'success'
        ? t('备份检查完成，状态已更新。', 'Backup check completed. Status updated.')
        : buttonStatusLabel.value,
      false,
      state === 'warning' ? 'error' : state === 'success' ? 'success' : 'info'
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
  recoveryError.value = ''
  recoveryProgress.value = ''
  const preview = await previewRestore(handle)
  recoveryHandle.value = handle
  recoveryMode.value = mode
  recoveryPreview.value = preview
  selected.value = preview.modules.filter((item) => item.ready).map((item) => item.module)
  previewOpen.value = true
  finishNotice(
    t('目录检查已完成，请查看各模块结果。', 'Folder checked. Review each module.'),
    'info'
  )
}
async function selectDirectory() {
  if (
    !(await ask(
      t('选择专用备份文件夹', 'Choose a dedicated backup folder'),
      t(
        '请在文档或自己的资料目录中新建专用空文件夹，再选择它。不要直接选择桌面、磁盘根目录或混有其他资料的文件夹。',
        'Create a dedicated empty folder in Documents or your data directory, then select it. Avoid the desktop, disk root, or folders containing other files.'
      )
    ))
  )
    return
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
  if (!diff.backupCount || (diff.added === 0 && diff.updated === 0 && diff.removed === 0))
    return true
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
  if (!current || busy.value || running.value) return
  busy.value = true
  beginNotice(t(`正在核对${titleFor(module)}备份状态…`, `Checking ${titleFor(module)} backup…`))
  try {
    if (current.enabled[module]) {
      await setModuleEnabled(module, false)
      await refreshDirectoryBackup()
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
    if (current.handle) scheduleDirectoryBackup(false)
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
        const invalid = preview.modules.filter((item) => !item.ready && !item.missing)
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
    const result = await coordinate(() =>
      restoreSelected(
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
    )
    await refreshDirectoryBackup()
    previewOpen.value = false
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
  previewOpen.value = false
  await selectDirectory()
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
    previewOpen.value = false
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
  let baseline: BrowserBaseline
  try {
    baseline = await browserBaseline()
    counts = await Promise.all(
      MODULES.map(
        async (module) => titleFor(module) + ' ' + baseline.counts[module] + t(' 条', ' records')
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
    await coordinate(() =>
      rebuildBackupDirectory(
        handle,
        (text) => {
          recoveryProgress.value = text
          beginNotice(text)
        },
        baseline
      )
    )
    await refreshDirectoryBackup()
    previewOpen.value = false
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
  if (busy.value) return
  previewOpen.value = false
  const trigger = previewTrigger.value?.disabled ? restoreTrigger.value : previewTrigger.value
  trigger?.focus({ preventScroll: true })
}
onBeforeUnmount(() => {
  resolveConfirmation?.(false)
  if (confirmationDialog.value?.open) confirmationDialog.value.close()
})

const coordinate = useModuleOperation('directory-backup')
const text = t
const modules = computed(() => MODULES.map((id) => ({ id, name: titleFor(id), icon: icons[id] })))
</script>
<template>
  <section class="backup-page">
    <header class="gallery-header backup-heading">
      <div class="collection-title-row"
        ><h2>{{ text('数据备份', 'Data backup') }}</h2></div
      >
      <CollectionActions :label="text('备份操作', 'Backup actions')">
        <button
          class="primary-button"
          type="button"
          :disabled="
            busy || running || !config?.handle || !hasEnabled || !supported || config?.paused
          "
          @click="runManualBackup"
          ><Download :size="15" aria-hidden="true" /><span class="collection-action-label">{{
            text('立即备份', 'Back up now')
          }}</span></button
        >
        <template #secondary
          ><button
            ref="restoreTrigger"
            type="button"
            :disabled="busy || running || !supported"
            @click="restorePicker"
            ><RotateCcw :size="15" aria-hidden="true" />{{
              text('从目录恢复', 'Restore from folder')
            }}</button
          ></template
        >
      </CollectionActions>
    </header>
    <div class="backup-directory">
      <Folder class="backup-icon" :size="28" aria-hidden="true" />
      <strong>{{ text('备份目录', 'Backup folder') }}</strong>
      <span class="backup-directory-name">{{
        config?.directoryName || text('尚未选择', 'No folder selected')
      }}</span>
      <span v-if="sharedError" class="backup-directory-error" role="alert">{{ sharedError }}</span>
      <div class="backup-directory-actions"
        ><button
          class="backup-button"
          ref="previewTrigger"
          type="button"
          :disabled="busy || running || !config?.handle || !supported"
          :aria-expanded="previewOpen"
          aria-controls="backup-directory-preview"
          @click="inspectCurrent"
          >{{ text('目录预览', 'Folder preview') }}</button
        ><button
          class="backup-button"
          type="button"
          :disabled="busy || running || !supported"
          @click="selectDirectory"
          >{{ text('选择目录', 'Choose folder') }}</button
        ></div
      >
    </div>
    <TreeCollapse :open="previewOpen">
      <section
        v-if="recoveryPreview"
        id="backup-directory-preview"
        class="backup-preview"
        aria-labelledby="backup-preview-title"
      >
        <header
          ><DatabaseBackup :size="23" /><div
            ><h2 id="backup-preview-title"
              >{{ t('目录预览', 'Folder preview') }} · {{ recoveryHandle?.name }}</h2
            ></div
          ><button
            type="button"
            class="auto-backup-close"
            :disabled="busy"
            :aria-label="t('收起预览', 'Collapse preview')"
            @click="closeRecovery"
            ><X :size="19" /></button
        ></header>
        <div class="backup-preview-content">
          <p>{{
            t(
              '先只读检查完整性。恢复会按模块完整替换浏览器数据，不是合并导入；坏记录或缺图只阻止对应模块。',
              'Read-only verification comes first. Restoration replaces complete modules rather than merging. Corruption blocks only the affected module.'
            )
          }}</p>
          <section
            v-for="item in recoveryPreview?.modules"
            :key="item.module"
            class="backup-preview-row"
            :class="{ invalid: !item.ready }"
          >
            <label class="app-checkbox-label"
              ><input
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
            <small>{{ date(item.lastSuccess) }}</small>
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
                '仅选择已有目录不会覆盖或清空它。可先恢复，也可选择其他空目录保存当前数据。',
                'Selecting an existing folder never overwrites it. Restore it, or choose another empty folder for current data.'
              )
            }}</p
            ><div class="auto-backup-actions">
              <button type="button" :disabled="busy" @click="createSeparateArchive"
                ><FolderPlus :size="15" />{{
                  t('选择其他空目录', 'Choose another empty folder')
                }}</button
              >
            </div></div
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
        <footer class="confirm-dialog-actions">
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
          >
          <button
            v-if="recoveryMode === 'existing' && sourceOwned"
            type="button"
            class="confirm-dialog-button ghost dialog-action-control"
            :disabled="busy"
            @click="useExisting"
            >{{ t('确认绑定此目录', 'Bind this folder') }}</button
          >
        </footer>
      </section>
    </TreeCollapse>
    <div class="backup-modules">
      <article v-for="item in modules" :key="item.id" class="backup-module">
        <header
          ><component :is="item.icon" class="backup-icon" :size="28" aria-hidden="true" /><h2>{{
            item.name
          }}</h2
          ><button
            class="backup-toggle"
            type="button"
            role="switch"
            :aria-checked="config?.enabled[item.id] ?? false"
            :aria-label="text(`自动备份${item.name}`, `Automatically back up ${item.name}`)"
            :disabled="busy || running || !supported || initialStatusLoading"
            @click="toggleModule(item.id)"
            ><span /></button
        ></header>
        <div
          class="backup-state"
          :class="{
            success: statuses[item.id].state === 'synced',
            problem: ['error', 'protected', 'permission'].includes(statuses[item.id].state),
            working: ['initializing', 'syncing'].includes(statuses[item.id].state)
          }"
          >{{
            initialStatusLoading ? t('读取中…', 'Loading…') : stateLabel(statuses[item.id])
          }}</div
        ><div class="backup-progress-slot"
          ><progress
            v-if="['initializing', 'syncing'].includes(statuses[item.id].state)"
            class="backup-progress"
            :value="statuses[item.id].processed"
            :max="Math.max(1, statuses[item.id].total ?? 1)"
        /></div>
        <template v-if="statuses[item.id].lastSuccess"
          ><div class="backup-count"
            >{{ statuses[item.id].count.toLocaleString()
            }}<span>{{ t('条', 'records') }}</span></div
          ><p class="backup-time">{{ date(statuses[item.id].lastSuccess) }}</p></template
        >
        <p v-else class="backup-empty">{{ text('尚无成功备份', 'No successful backup yet') }}</p>
        <p
          v-if="statuses[item.id].error && statuses[item.id].error !== sharedError"
          class="backup-error"
          >{{ statuses[item.id].error }}</p
        ></article
      >
    </div>
    <details class="backup-safety">
      <summary
        ><ChevronRight :size="18" aria-hidden="true" />{{
          text('校验与安全复制', 'Verification and safe copying')
        }}</summary
      >
      <div class="backup-safety-body"
        ><p>{{
          text(
            '复制前请暂停写盘并完成校验；暂停期间的新修改不会包含在副本中。',
            'Pause writes and verify before copying. Changes made while paused are not included.'
          )
        }}</p
        ><div class="backup-actions"
          ><button
            class="backup-button"
            type="button"
            :disabled="busy || running || !config?.handle || !supported"
            @click="inspectCurrent"
            ><ShieldCheck :size="17" aria-hidden="true" />{{
              text('完整性检查', 'Check integrity')
            }}</button
          ><button
            class="backup-button"
            type="button"
            :disabled="busy || running || !config?.handle || !supported"
            @click="pauseOrResume"
            ><Pause :size="17" aria-hidden="true" />{{
              config?.paused ? t('恢复自动备份', 'Resume backup') : text('暂停写盘', 'Pause writes')
            }}</button
          ></div
        ></div
      >
    </details>
    <button v-if="hasPermissionIssue" class="backup-button" @click="authorize">{{
      t('重新授权', 'Reauthorize')
    }}</button
    ><p v-if="!supported" class="backup-hint">{{
      t(
        '此浏览器不支持目录备份，可使用手动 ZIP 备份。',
        'Folder backup is unavailable. Use manual ZIP backups.'
      )
    }}</p
    ><p v-if="serviceError && serviceError !== sharedError" class="backup-error" role="alert">{{
      serviceError
    }}</p>
  </section>
  <Teleport to="body">
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
</template>

<style scoped>
.backup-spinner {
  flex-shrink: 0;
  color: var(--pink-deep);
  animation: backup-loading-spin 1s linear infinite;
}
@keyframes backup-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .backup-spinner {
    animation: none;
  }
}
.backup-page {
  padding: 8px 0 28px;
  color: var(--text);
  --backup-secondary: var(--text);
  --backup-secondary: color-mix(in srgb, var(--text) 80%, var(--surface));
  --backup-success: var(--notice-success);
  --backup-success: color-mix(in srgb, var(--notice-success) 70%, var(--heading));
}
.backup-actions,
.backup-directory,
.backup-module header,
.backup-preview header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.backup-heading {
  margin-bottom: 20px;
}
h2,
p {
  margin: 0;
}
.backup-module h2 {
  font-size: 19px;
  line-height: 1.4;
  color: var(--heading);
}
.backup-actions {
  flex-wrap: wrap;
}
.backup-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 9px 18px;
  background: var(--surface-strong);
  border: 1px solid var(--line);
  border-radius: calc(var(--radius-sm) + 2px);
  color: var(--heading);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast),
    border-color var(--motion-fast);
}
.backup-button:hover:not(:disabled) {
  background: var(--interactive-hover-bg);
  border-color: var(--interactive-hover-border);
}
.backup-button.primary {
  background: var(--primary-button-bg);
  border-color: var(--primary-button-bg);
  color: var(--heading);
}
.backup-button.primary:hover:not(:disabled) {
  background: var(--primary-button-bg-hover);
}
button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
button:focus-visible,
summary:focus-visible,
input:focus-visible {
  outline: 3px solid var(--focus-ring-color);
  outline-offset: 4px;
}
.backup-directory {
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius-md) + 4px);
  background: var(--surface);
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.backup-directory strong {
  font-size: 17px;
}
.backup-icon {
  color: var(--pink-deep);
  flex-shrink: 0;
}
.backup-directory-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--backup-secondary);
  overflow-wrap: anywhere;
  min-width: 0;
}
.backup-directory-error {
  flex: 1 1 260px;
  color: var(--notice-error);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.backup-directory-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}
.backup-permission {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 9px;
  border-radius: 6px;
  background: var(--soft-accent);
  color: var(--text);
}
.backup-permission.granted {
  background: var(--surface-soft);
  background: color-mix(in srgb, var(--notice-success) 15%, var(--surface));
  color: var(--backup-success);
}
.backup-hint {
  font-size: 13px;
  line-height: 1.7;
  color: var(--backup-secondary);
  margin: -8px 0 20px;
}
.backup-modules {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 22px;
}
.backup-module {
  border: 1px solid var(--line);
  border-radius: calc(var(--radius-md) + 4px);
  background: var(--surface);
  padding: 24px;
  min-width: 0;
}
.backup-module header {
  margin-bottom: 22px;
  gap: 10px;
}
.backup-module h2 {
  flex: 1;
}
.backup-toggle {
  width: 44px;
  min-width: 44px;
  height: 26px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--line);
  padding: 3px;
  cursor: pointer;
}
.backup-toggle span {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-strong);
  transition: transform var(--motion-base);
}
.backup-toggle[aria-checked='true'] {
  background: var(--primary-button-bg);
  border-color: var(--primary-button-bg);
}
.backup-toggle[aria-checked='true'] span {
  transform: translateX(18px);
}
.backup-state {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--backup-secondary);
  line-height: 1.5;
}
.backup-state.success {
  color: var(--backup-success);
}
.backup-state.problem {
  color: var(--notice-error);
}
.backup-count {
  font-size: 32px;
  font-weight: 650;
  line-height: 1.35;
  margin-top: 8px;
  font-variant-numeric: tabular-nums;
  color: var(--heading);
}
.backup-count span {
  font-size: 16px;
  margin-left: 5px;
}
.backup-time {
  font-size: 13px;
  color: var(--backup-secondary);
  margin-top: 8px;
  line-height: 1.6;
}
.backup-empty {
  font-size: 17px;
  color: var(--backup-secondary);
  margin-top: 20px;
  line-height: 1.5;
}
.backup-error {
  font-size: 13px;
  line-height: 1.6;
  color: var(--notice-error);
  overflow-wrap: anywhere;
  margin-top: 14px;
}
.backup-safety {
  border: 1px solid var(--line);
  border-radius: calc(var(--radius-md) + 4px);
  background: var(--surface);
}
.backup-safety summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 22px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}
.backup-safety summary::-webkit-details-marker {
  display: none;
}
.backup-safety[open] summary svg {
  transform: rotate(90deg);
}
.backup-safety-body {
  padding: 0 22px 22px;
}
.backup-safety-body > p {
  font-size: 14px;
  line-height: 1.7;
  max-width: 72ch;
  margin-bottom: 16px;
  color: var(--backup-secondary);
}
.backup-safety-body .backup-hint {
  margin: 16px 0;
}
.backup-rebuild {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 22px;
  font-size: 13px;
  color: var(--backup-secondary);
}
.backup-link {
  font: inherit;
  color: var(--heading);
  background: none;
  border: 0;
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
  padding: 8px 0;
}
.backup-footnote {
  font-size: 13px;
  line-height: 1.8;
  color: var(--backup-secondary);
  margin-top: 16px;
  text-wrap: pretty;
}
.backup-progress-slot {
  height: 12px;
  margin-top: 6px;
}
.backup-progress {
  display: block;
  appearance: none;
  width: 100%;
  height: 4px;
  border: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--line-soft);
  accent-color: var(--pink-deep);
}
.backup-progress::-webkit-progress-bar {
  background: var(--line-soft);
}
.backup-progress::-webkit-progress-value {
  background: var(--pink-deep);
  border-radius: var(--radius-sm);
  transition: width var(--motion-fast);
}
.backup-progress::-moz-progress-bar {
  background: var(--pink-deep);
}
.backup-progress:indeterminate {
  background: linear-gradient(
    90deg,
    var(--line-soft) 25%,
    var(--pink-deep) 50%,
    var(--line-soft) 75%
  );
  background-size: 200% 100%;
  animation: backup-progress-flow 1.4s linear infinite;
}
.backup-progress:indeterminate::-webkit-progress-bar {
  background: transparent;
}
.backup-progress.complete {
  animation: backup-progress-finish 1.2s forwards;
}
.backup-progress.complete::-webkit-progress-value {
  background: var(--backup-success);
}
.backup-progress.stopped {
  opacity: 0.5;
}
.backup-state.working::before {
  content: '';
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  border: 2px solid var(--line);
  border-top-color: var(--pink-deep);
  border-radius: 50%;
  animation: backup-progress-spin 1s linear infinite;
}
@keyframes backup-progress-flow {
  to {
    background-position: -200% 0;
  }
}
@keyframes backup-progress-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes backup-progress-finish {
  0%,
  65% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .backup-progress,
  .backup-state.working::before {
    animation: none;
  }
  .backup-progress.complete {
    opacity: 0;
  }
  .backup-progress::-webkit-progress-value {
    transition: none;
  }
}
.backup-skeleton {
  height: 24px;
  width: 65%;
  background: var(--line-soft);
  border-radius: 4px;
  margin-top: 16px;
}
.backup-skeleton.short {
  width: 40%;
  height: 14px;
}
.backup-preview {
  margin-bottom: 20px;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius-md) + 4px);
  padding: 22px;
  background: var(--surface);
}
.backup-preview > header {
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.backup-preview > header > svg {
  flex: none;
  color: var(--pink-deep);
}
.backup-preview > header > div {
  flex: 1;
  min-width: 0;
}
.backup-preview h2 {
  color: var(--heading);
  font-size: 18px;
  overflow-wrap: anywhere;
}
.backup-preview-content > p {
  font-size: 14px;
  line-height: 1.7;
  margin-bottom: 16px;
}
.backup-preview-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) auto;
  align-items: center;
  gap: 6px 24px;
  padding: 16px 0;
  border-top: 1px solid var(--line-soft);
}
.backup-preview-row label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: var(--heading);
}
.backup-preview-row .auto-backup-restore-counts {
  margin: 0;
}
.backup-preview-row > p {
  margin: 0;
  text-align: right;
  font-size: 13px;
  line-height: 1.7;
}
.backup-preview-row > button {
  grid-column: 1 / -1;
  justify-self: start;
}
.backup-preview-row small {
  display: block;
  font-size: 13px;
  line-height: 1.7;
  color: var(--backup-secondary);
  overflow-wrap: anywhere;
}
.backup-preview > footer {
  --dialog-accent: var(--primary-button-bg);
  --dialog-primary-dark-text: var(--primary-text);
  margin-top: 20px;
  padding: 0;
  flex-wrap: wrap;
}
@media (max-width: 1100px) {
  .backup-module {
    padding: 18px;
  }
  .backup-module header {
    flex-wrap: wrap;
  }
  .backup-module h2 {
    font-size: 17px;
  }
}
@media (max-width: 760px) {
  .backup-modules {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .backup-module {
    padding: 20px;
  }
  .backup-module header {
    margin-bottom: 16px;
  }
  .backup-directory {
    padding: 16px;
  }
  .backup-directory-actions {
    margin-left: 0;
    width: 100%;
  }
  .backup-count {
    font-size: 30px;
  }
  .backup-preview {
    padding: 16px;
  }
  .backup-preview-row {
    grid-template-columns: 1fr;
  }
  .backup-preview-row > p {
    text-align: left;
  }
  .backup-safety summary {
    padding: 17px;
  }
  .backup-safety-body {
    padding: 0 17px 17px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .backup-toggle span,
  .backup-button {
    transition: none;
  }
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
.auto-backup-directory-row .auto-backup-actions {
  flex: none;
  flex-wrap: nowrap;
}
.auto-backup-directory-row .auto-backup-actions button {
  white-space: nowrap;
}
.auto-backup-directory-row .auto-backup-actions {
  order: -1;
  flex-wrap: wrap;
}
.auto-backup-tools summary {
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
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

.auto-backup-error-text {
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
.auto-backup-restore-counts {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 8px 0 2px;
  font-variant-numeric: tabular-nums;
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
    transform-origin: top right;
    animation: auto-backup-in 260ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .auto-backup-spinning {
    animation: auto-backup-spin 1s linear infinite;
  }
}
@keyframes auto-backup-in {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes auto-backup-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
