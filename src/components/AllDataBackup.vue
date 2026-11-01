<script setup lang="ts">
import { takeDownloadFiles } from '../utils/backup/downloadFallback'
import { reportError as captureDiagnosticError } from '../utils/errorReporting/errorReporter'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { lazyFeature } from '../utils/lazyFeature'
const CameraImportConflictDialog = lazyFeature(
  () => import('./CameraImportConflictDialog.vue'),
  () => props.language,
  { active: () => conflict.value !== null, cancel: () => finishChoices(null) }
)
const WardrobeRestoreRegionDialog = lazyFeature(
  () => import('./WardrobeRestoreRegionDialog.vue'),
  () => props.language,
  { active: () => regionConflict.value !== null, cancel: () => finishRegion(null) }
)
import { hasAllBackupData } from '../utils/backup/backupAvailability'
import type {
  BackupModule,
  CameraChoices,
  ModuleImportResult,
  WardrobeRegionConflict
} from '../utils/backup/allDataBackup'
import type { WardrobeRegionScope } from '../utils/wardrobe/wardrobeRegion'
import type { ImportPlan } from '../utils/photo-params/favorites'
const props = defineProps<{ language: 'zh' | 'en'; disabled: boolean }>()
const emit = defineEmits<{
  busy: [value: boolean]
  availability: [value: boolean]
  changed: []
  status: [
    message: string,
    tone: 'success' | 'warning' | 'error' | 'info',
    loading?: boolean,
    downloadFiles?: File[]
  ]
}>()
const picker = ref<HTMLInputElement | null>(null),
  busy = ref(false)
const conflict = ref<ImportPlan | null>(null)
let resolveChoices: ((choices: CameraChoices | null) => void) | null = null
const regionConflict = ref<WardrobeRegionConflict | null>(null)
const cameraConflictLoaded = ref(false)
const regionConflictLoaded = ref(false)
// 首次出现才下载；关闭后保留实例，让原有焦点恢复和退出动画完成。
watch(
  conflict,
  (value) => {
    if (value) cameraConflictLoaded.value = true
  },
  { flush: 'sync' }
)
watch(
  regionConflict,
  (value) => {
    if (value) regionConflictLoaded.value = true
  },
  { flush: 'sync' }
)
let resolveRegion: ((region: WardrobeRegionScope | null) => void) | null = null
function finishRegion(value: WardrobeRegionScope | null) {
  regionConflict.value = null
  resolveRegion?.(value)
  resolveRegion = null
}
let disposed = false,
  availabilityGeneration = 0
const t = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const moduleName = (module: BackupModule) =>
  ({
    outfits: t('搭配码', 'Outfits'),
    home: t('家园方案', 'Home schemes'),
    camera: t('相机参数', 'Camera parameters'),
    resonance: t('共鸣记录', 'Resonance records'),
    wardrobe: t('个人衣橱', 'Personal wardrobe')
  })[module]
async function refreshAvailability() {
  const generation = ++availabilityGeneration
  try {
    const value = await hasAllBackupData()
    if (!disposed && generation === availabilityGeneration) emit('availability', value)
  } catch {
    if (!disposed && generation === availabilityGeneration) emit('availability', false)
  }
}
function setBusy(value: boolean) {
  busy.value = value
  emit('busy', value)
}
function report(error: unknown, action: string, file?: File) {
  if (error instanceof Error && error.message === 'backup_file_not_zip') {
    emit(
      'status',
      t(
        '所选文件不是 ZIP 备份，请选择通过“导出全部数据”生成的 ZIP 文件。',
        'This file is not a ZIP backup. Choose the ZIP file created by Export all data.'
      ),
      'warning'
    )
    return
  }
  captureDiagnosticError(error, {
    module: 'backup',
    action,
    context: file ? { fileSize: file.size, fileType: file.type } : {}
  })
  const message = error instanceof Error ? error.message : String(error)
  emit(
    'status',
    t('全部数据备份操作失败：', 'Backup operation failed: ') +
      (message === '无法读取总 ZIP / Unable to read backup ZIP'
        ? t(
            '无法解压所选文件，请确认它是完整的 ZIP 备份。',
            'The selected file could not be unzipped. Check that it is a complete ZIP backup.'
          )
        : message === 'WARDROBE_CHANGED'
          ? t(
              '衣橱已在其他页面变更，请重新选择备份并确认区服。',
              'The wardrobe changed in another tab. Select the backup again and confirm the region.'
            )
          : message),
    'error'
  )
}
async function exportData() {
  if (busy.value || props.disabled) return
  setBusy(true)
  emit('status', t('正在导出全部数据…', 'Exporting all data…'), 'info', true)
  try {
    if (!(await hasAllBackupData())) {
      emit('status', t('暂无可导出的数据', 'No data to export'), 'info')
      return
    }
    const { exportAllDataBackup } = await import('../utils/backup/allDataBackup')
    if (disposed) return
    const name = await exportAllDataBackup()
    emit(
      'status',
      t('已生成全部数据备份：', 'All-data backup created: ') + name,
      'success',
      false,
      takeDownloadFiles('all-data')
    )
  } catch (error) {
    report(error, 'exportData')
  } finally {
    takeDownloadFiles('all-data')
    setBusy(false)
    void refreshAvailability()
  }
}
function chooseImport() {
  if (!busy.value && !props.disabled) picker.value?.click()
}
function finishChoices(value: CameraChoices | null) {
  conflict.value = null
  resolveChoices?.(value)
  resolveChoices = null
}
function resultSummary(results: ModuleImportResult[]) {
  return results
    .map(
      (result) =>
        moduleName(result.module) +
        ': ' +
        t(
          '保存 ' + result.saved + '，跳过 ' + result.skipped + '，失败 ' + result.failed,
          'saved ' + result.saved + ', skipped ' + result.skipped + ', failed ' + result.failed
        ) +
        (result.rejectedTags
          ? t('，未导入标签 ' + result.rejectedTags, ', rejected tags ' + result.rejectedTags)
          : '') +
        (result.error ? t('；模块未完整完成：', '; module incomplete: ') + result.error : '')
    )
    .join('；')
}
async function importData(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file || busy.value || props.disabled) return
  setBusy(true)
  emit(
    'status',
    t('正在检查总备份及各模块文件…', 'Checking the bundle and all modules…'),
    'info',
    true
  )
  let started = false
  try {
    const { prepareAllDataBackup, applyAllDataBackup } =
      await import('../utils/backup/allDataBackup')
    if (disposed) return
    const plan = await prepareAllDataBackup(file)
    if (disposed) return
    const results = await applyAllDataBackup(
      plan,
      (cameraPlan) => {
        emit(
          'status',
          t('请选择相机参数冲突记录的保留方式', 'Choose how to resolve camera conflicts'),
          'info'
        )
        conflict.value = cameraPlan
        return new Promise((resolve) => {
          resolveChoices = resolve
        })
      },
      (module) => {
        started = true
        emit('status', t('正在导入', 'Importing ') + moduleName(module) + '…', 'info', true)
      },
      (value) => {
        if (disposed) return Promise.resolve(null)
        emit(
          'status',
          t('请选择恢复后的衣橱展示区服', 'Choose the wardrobe display region after restoring'),
          'info'
        )
        regionConflict.value = value
        return new Promise((resolve) => {
          resolveRegion = resolve
        })
      }
    )
    if (!results) {
      emit('status', t('已取消导入，数据未修改', 'Import cancelled; data unchanged'), 'info')
      return
    }
    for (const result of results) {
      if (result.failed || result.error)
        captureDiagnosticError(new Error(result.error || 'Partial backup import failure'), {
          module: 'backup',
          action: 'import-partial',
          context: { module: result.module, failed: result.failed, saved: result.saved }
        })
    }
    emit(
      'status',
      resultSummary(results),
      results.some((result) => result.failed || result.error || result.rejectedTags)
        ? 'warning'
        : 'success'
    )
  } catch (error) {
    report(error, 'importData', file)
  } finally {
    if (started) emit('changed')
    setBusy(false)
    void refreshAvailability()
  }
}
onMounted(() => {
  void refreshAvailability()
})
onBeforeUnmount(() => {
  disposed = true
  availabilityGeneration++
  finishChoices(null)
  finishRegion(null)
})
defineExpose({ exportData, chooseImport, refreshAvailability })
</script>
<template>
  <input ref="picker" type="file" accept=".zip,application/zip" hidden @change="importData" />
  <CameraImportConflictDialog
    v-if="cameraConflictLoaded"
    :plan="conflict"
    :language="language"
    @confirm="finishChoices"
    @cancel="finishChoices(null)"
  />
  <WardrobeRestoreRegionDialog
    v-if="regionConflictLoaded"
    :conflict="regionConflict"
    :language="language"
    @confirm="finishRegion"
    @cancel="finishRegion(null)"
  />
</template>
