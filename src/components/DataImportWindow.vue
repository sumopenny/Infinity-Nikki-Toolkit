<script setup lang="ts">
import {
  reportError as captureDiagnosticError,
  trackDiagnostic,
  reportPartialFailure,
  diagnosticMetadata
} from '../utils/errorReporting/errorReporter'
import { computed, nextTick, ref, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import ResonanceImportDialog from './ResonanceImportDialog.vue'
import PearpalRegionPicker from './PearpalRegionPicker.vue'
import { messages } from '../i18n'
import type { Language } from '../i18n/types'
import { useCompactLayout } from '../composables/useCompactLayout'
import { useLatestRequest } from '../composables/useLatestRequest'
import { useModuleOperation } from '../composables/useOperationCoordinator'
import { useModalFocus } from '../composables/useModalFocus'
import { useBodyScrollLock } from '../utils/bodyScrollLock'
import { copyTextToClipboard } from '../utils/clipboard'
import { readLocalStorage, writeLocalStorage } from '../utils/localStorage'
import { isWardrobeItemAvailable, wardrobeRegionScope } from '../utils/wardrobe/wardrobeRegion'
import {
  fetchPearpalSnapshot,
  PEARPAL_AUTH_FAILED,
  PEARPAL_REGION_MISMATCH,
  PEARPAL_UID_MISMATCH
} from '../utils/resonance/resonanceImport'
import {
  parseResonanceCookie,
  resonanceBookmarkScript,
  resonanceConsoleScript
} from '../utils/resonance/resonanceScripts'
import { loadResonanceRecords } from '../utils/resonance/resonanceStorage'
import { loadWardrobe } from '../utils/wardrobe/wardrobeStorage'
import {
  parseDataPreview,
  saveDataImport,
  type DataPreview,
  type DataPreviewStage
} from '../utils/unifiedDataImport'
import { sortResonanceRecords } from '../utils/resonance/resonanceView'
import {
  isPearpalRegion,
  PEARPAL_REGIONS,
  type PearpalRegion
} from '../utils/resonance/pearpalRegions'

const props = withDefaults(
  defineProps<{ visible: boolean; language?: Language; disabled?: boolean }>(),
  { language: 'zh' }
)
const emit = defineEmits<{
  close: []
  imported: []
  notice: [message: string, tone: 'success' | 'error' | 'warning']
}>()
const text = (zh: string, en: string) => (props.language === 'zh' ? zh : en)
const REGION_KEY = 'nikki-pearpal-region'
// 只记住服务器选择，不保存角色或凭据；存储失败沿用网站统一的会话回退。
const savedRegion = readLocalStorage(REGION_KEY)
const region = ref<PearpalRegion>(isPearpalRegion(savedRegion) ? savedRegion : 'cn')
const regionConfig = computed(() => PEARPAL_REGIONS[region.value])
const t = computed(() => ({
  ...messages[props.language].resonance,
  addTitle: text('导入数据', 'Import data'),
  importing: text('正在获取数据，请稍候…', 'Loading data, please wait…'),
  loginPearpalDesc: text(
    `打开${region.value === 'cn' ? '国服美鸭梨并登录叠纸账号' : '国际服 Pear-Pal 并登录对应账号'}，确认当前角色属于“${regionConfig.value.name.zh}”，再按下方步骤获取凭据。`,
    `Sign in to ${region.value === 'cn' ? 'Chinese Pear-Pal with your Papergames account' : 'global Pear-Pal with your account'}, confirm your current role is on ${regionConfig.value.name.en}, then follow the steps below to get credentials.`
  ),
  fileDescription: text(
    '支持原始手账 JSON、共鸣记录 JSON 和衣橱备份（最大 10 MB）。预览后选择要导入的记录；文件未包含的数据类型不可选。',
    'Accepts raw notebook JSON, resonance JSON and wardrobe backups (up to 10 MB). Choose which records to import after previewing; unavailable data types are disabled.'
  )
}))
const compact = useCompactLayout()
const method = ref<'pearpal' | 'file'>('pearpal'),
  cookieMethod = ref<'bookmark' | 'console' | 'userscript'>('bookmark')
const cookieInput = ref(''),
  roleid = ref(''),
  token = ref(''),
  openid = ref(''),
  fileName = ref('')
const importing = ref(false),
  confirming = ref(false),
  error = ref('')
const panel = ref<HTMLElement | null>(null)
const preview = ref<DataPreview | null>(null)
type ImportStage = 'source' | DataPreviewStage | 'preview'
const progress = ref<{
  stage: ImportStage
  stages: ImportStage[] | null
  failed: boolean
} | null>(null)
const progressStep = computed(() =>
  progress.value?.stages ? progress.value.stages.indexOf(progress.value.stage) + 1 : 0
)
const progressLabel = computed(
  () =>
    ({
      source:
        method.value === 'file'
          ? text('正在读取文件…', 'Reading file…')
          : text('正在获取手账数据…', 'Fetching notebook data…'),
      check: text('正在检查数据格式…', 'Checking data format…'),
      wardrobe: text(
        '正在加载图鉴并解析衣橱记录…',
        'Loading the catalog and parsing wardrobe records…'
      ),
      resonance: text('正在解析共鸣记录…', 'Parsing resonance records…'),
      preview: text(
        '正在核对本地记录并生成预览…',
        'Checking local records and preparing the preview…'
      )
    })[progress.value?.stage ?? 'source']
)
const selectedResonance = ref(true),
  selectedWardrobe = ref(true)
const base = ref({ resonance: '', wardrobe: '' })
let fileBytes: Promise<{ content: string } | { error: unknown }> | null = null
const request = useLatestRequest()
const track = useModuleOperation('data-import')
const visible = computed(() => props.visible)
useBodyScrollLock(visible)
useModalFocus(visible, panel, close)
const bookmark = computed(() =>
  resonanceBookmarkScript(
    text('请在美鸭梨网站使用此书签。', 'Use this bookmark on the Pear-Pal website.')
  )
)
const canConfirm = computed(
  () =>
    !!preview.value &&
    ((selectedResonance.value && preview.value.resonance !== null) ||
      (selectedWardrobe.value && preview.value.wardrobe !== null))
)
const wardrobeCount = computed(() => {
  const snapshot = preview.value?.wardrobe
  return snapshot
    ? Object.entries(snapshot.entries).filter(
        ([id, entry]) => entry.owned && isWardrobeItemAvailable(id, wardrobeRegionScope(snapshot))
      ).length
    : 0
})
/** 仅滚动导入正文，把当前阶段带入视口，避免手机长凭据教程遮住进度。 */
function revealProgress() {
  const body = panel.value?.querySelector<HTMLElement>('.resonance-import-body')
  const node = body?.querySelector<HTMLElement>('.data-import-progress')
  if (!body || !node) return
  const overflow = node.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom
  if (overflow > 0) body.scrollTop += overflow + 12
}
function invalidate() {
  request.invalidate()
  importing.value = false
  preview.value = null
  error.value = ''
  progress.value = null
}
function reset() {
  invalidate()
  cookieInput.value = roleid.value = token.value = openid.value = fileName.value = ''
  fileBytes = null

  method.value = 'pearpal'
  cookieMethod.value = compact.value ? 'userscript' : 'bookmark'
  selectedResonance.value = selectedWardrobe.value = true
}
watch(visible, () => reset(), { immediate: true })
watch([roleid, token, openid], invalidate, { flush: 'sync' })
watch(
  region,
  (value) => {
    // 同步废弃请求和预览，防止旧区服请求完成后重新出现可确认的数据。
    invalidate()
    cookieInput.value = roleid.value = token.value = openid.value = ''
    writeLocalStorage(REGION_KEY, value)
  },
  { flush: 'sync' }
)
watch(cookieInput, (value) => {
  invalidate()
  if (!value.trim()) return
  try {
    const parsed = parseResonanceCookie(value)
    roleid.value = parsed.roleid
    token.value = parsed.token
    openid.value = parsed.id

    emit('notice', t.value.pasteSuccess, 'success')
  } catch {
    error.value = t.value.pasteFailed
  }
})
watch(method, () => {
  invalidate()
  fileName.value = ''
  fileBytes = null
})
function close() {
  if (!confirming.value) {
    reset()
    emit('close')
  }
}
function selectFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  invalidate()
  fileName.value = file?.name ?? ''
  // 选取即读取字节，避免手机文件引用失效；解析仍等待“获取预览”。
  fileBytes = !file
    ? null
    : file.size > 10 * 1024 * 1024
      ? Promise.resolve({ error: new Error('FILE_TOO_LARGE') })
      : file.text().then(
          (content) => ({ content }),
          (error) => ({ error })
        )
}
function report(cause: unknown) {
  if (!(
    cause instanceof SyntaxError &&
    method.value === 'file' &&
    progress.value?.stage === 'check'
  ))
    captureDiagnosticError(cause, {
      module: 'data-import',
      action: confirming.value ? 'save' : 'preview',
      stage: progress.value?.stage ?? (confirming.value ? 'storage' : 'unknown'),
      context: {
        method: method.value,
        region: region.value,
        importStage: progress.value?.stage ?? null,
        resonance: selectedResonance.value,
        wardrobe: selectedWardrobe.value
      }
    })
  const message = cause instanceof Error ? cause.message : ''
  const diagnosticCode = diagnosticMetadata(cause).code
  if (message === 'MISSING_CREDENTIALS') {
    emit('notice', t.value.credentialsRequired, 'error')
    return
  }
  if (message === PEARPAL_REGION_MISMATCH) {
    emit('notice', t.value.regionMismatch, 'error')
    return
  }
  const errorMessage =
    method.value === 'pearpal' &&
    [
      'PEARPAL_RESPONSE_INVALID',
      'PEARPAL_NOTEBOOK_DECODE_FAILED',
      'PEARPAL_RESPONSE_CODE_INVALID'
    ].includes(diagnosticCode ?? '')
      ? text(
          '美鸭梨返回的数据格式暂时无法识别，请稍后重试；持续出现时请反馈给站点维护者。',
          'Pear-Pal returned data in an unrecognized format. Try again later; if it persists, contact the site maintainer.'
        )
      : diagnosticCode === 'PEARPAL_ROLE_MISSING' || diagnosticCode === 'PEARPAL_UID_MISSING'
        ? t.value.authFailed
        : diagnosticCode === 'PEARPAL_HTTP_ERROR' || diagnosticCode === 'PEARPAL_NETWORK_FAILED'
          ? text('美鸭梨连接失败，请稍后重试。', 'Could not connect to Pear-Pal. Try again later.')
          : message === PEARPAL_UID_MISMATCH
            ? t.value.uidMismatch
            : message === PEARPAL_AUTH_FAILED
              ? t.value.authFailed
              : message === 'LOCAL_CHANGED'
                ? text(
                    '记录已在其他页面变更，请重新获取预览。',
                    'Records changed in another tab. Preview again.'
                  )
                : confirming.value
                  ? t.value.saveError
                  : method.value === 'file'
                    ? t.value.fileInvalid
                    : t.value.importError
  emit('notice', errorMessage, 'error')
}
async function createPreview() {
  if (props.disabled || importing.value || confirming.value) return
  if (method.value === 'file' && !fileBytes) {
    error.value = t.value.fileRequired
    return
  }
  const current = request.begin()
  importing.value = true
  error.value = ''

  preview.value = null
  const bytes = fileBytes
  // 阶段切换先让页面绘制；所有回调都绑定当前任务，旧读取不能覆盖新进度。
  const showProgress = async (stage: ImportStage, stages: ImportStage[] | null = null) => {
    if (!current.isCurrent()) throw new DOMException('Import cancelled', 'AbortError')
    trackDiagnostic('import', 'stage', { stage, method: method.value, region: region.value })
    progress.value = { stage, stages, failed: false }
    await nextTick()
    revealProgress()
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
    if (!current.isCurrent()) throw new DOMException('Import cancelled', 'AbortError')
  }
  try {
    await showProgress('source')
    let raw: unknown
    if (method.value === 'file') {
      const result = await bytes!
      if ('error' in result) throw result.error
      await showProgress('check')
      raw = JSON.parse(result.content)
    } else {
      const credentials = {
        roleid: roleid.value.trim(),
        token: token.value.trim(),
        id: openid.value.trim()
      }
      if (!credentials.roleid || !credentials.token || !credentials.id)
        throw new Error('MISSING_CREDENTIALS')
      raw = await fetchPearpalSnapshot(credentials, current.signal, region.value)
    }
    const parsed = await parseDataPreview(raw, {
      // 原始手账文件也使用明确选择的区服；备份内区服的优先级由解析层统一处理。
      regionScope: region.value === 'cn' ? 'cn' : 'global',
      signal: current.signal,
      onProgress: (stage, stages) => showProgress(stage, ['source', ...stages, 'preview'])
    })
    await showProgress('preview', progress.value?.stages ?? null)
    const [resonance, wardrobe] = await Promise.all([
      parsed.resonance === null ? null : loadResonanceRecords(),
      parsed.wardrobe === null ? null : loadWardrobe()
    ])
    if (!current.isCurrent()) return
    reportPartialFailure('data-import', 'parse-resonance-pools', parsed.skippedPools, {
      region: region.value,
      method: method.value
    })
    base.value = { resonance: JSON.stringify(resonance), wardrobe: JSON.stringify(wardrobe) }
    preview.value = parsed
    progress.value = null
    selectedResonance.value = parsed.resonance !== null
    selectedWardrobe.value = parsed.wardrobe !== null
    await nextTick()
    if (!current.isCurrent()) return
    const body = panel.value?.querySelector<HTMLElement>('.resonance-import-body')
    body?.scrollTo?.({
      top: body.scrollHeight,
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth'
    })
  } catch (cause) {
    if (current.isCurrent()) {
      if (progress.value) progress.value.failed = true
      report(cause)
      await nextTick()
      if (current.isCurrent()) revealProgress()
    }
  } finally {
    if (current.isCurrent()) importing.value = false
  }
}
async function confirm() {
  if (!canConfirm.value || confirming.value || props.disabled) return
  confirming.value = true
  error.value = ''
  try {
    const data = JSON.parse(JSON.stringify(preview.value)) as DataPreview
    await track(() =>
      saveDataImport(
        data,
        { resonance: selectedResonance.value, wardrobe: selectedWardrobe.value },
        base.value
      )
    )
    emit('imported')
    confirming.value = false
    close()
    emit(
      'notice',
      data.skippedPools
        ? t.value.partialImport(data.skippedPools)
        : text('所选记录已导入。', 'Selected records imported.'),
      data.skippedPools ? 'warning' : 'success'
    )
  } catch (cause) {
    report(cause)
  } finally {
    confirming.value = false
  }
}
async function copyScript(kind: 'bookmark' | 'console') {
  if (await copyTextToClipboard(kind === 'bookmark' ? bookmark.value : resonanceConsoleScript)) {
    emit('notice', t.value.copyCodeSuccess, 'success')
  } else {
    emit('notice', text('复制代码失败，请重试。', 'Failed to copy code. Please retry.'), 'error')
  }
}
</script>

<template>
  <ResonanceImportDialog
    :visible="visible"
    :t="t"
    title-id="data-import-title"
    :import-method="method"
    :cookie-method="cookieMethod"
    show-mobile-credential-tip
    :file-name="fileName"
    :bookmark-script="bookmark"
    :pearpal-url="regionConfig.home"
    :importing="importing"
    :confirming="confirming"
    :disabled="disabled"
    :confirm-disabled="!canConfirm"
    :has-preview="!!preview"
    v-model:cookie-input="cookieInput"
    v-model:roleid="roleid"
    v-model:token="token"
    v-model:openid="openid"
    @panel="panel = $event"
    @close="close"
    @select-method="method = $event"
    @select-cookie-method="cookieMethod = $event"
    @select-file="selectFile"
    @copy-script="copyScript"
    @preview="createPreview"
    @confirm="confirm"
  >
    <template #import-options>
      <div class="data-import-region-row">
        <PearpalRegionPicker
          v-model="region"
          :language="language"
          :disabled="confirming || disabled"
        />
        <p class="data-import-region-hint">{{
          method === 'file'
            ? text(
                '原始手账 JSON 使用所选区服；衣橱备份优先使用备份内的区服，旧备份未记录区服时使用此选择。切换后需重新预览。',
                'Raw notebook JSON uses the selected server. Wardrobe backups use their saved region first; legacy backups without a region use this selection. Preview again after switching.'
              )
            : text(
                '国服与国际服共用一份数据。切换服务器后，需重新获取凭据和预览。',
                'All servers share one data set. After switching servers, get fresh credentials and preview again.'
              )
        }}</p>
      </div>
    </template>
    <section
      v-if="progress"
      class="data-import-progress"
      :role="progress.failed ? 'alert' : 'status'"
      aria-live="polite"
      :aria-busy="importing"
    >
      <div class="data-import-progress-heading">
        <p>{{
          progress.failed
            ? text('失败阶段：', 'Failed stage: ') +
              progressLabel.replace(/^正在/, '').replace(/…$/, '')
            : progressLabel
        }}</p>
        <span v-if="progress.stages" class="data-import-progress-step"
          >{{ text('步骤', 'Step') }} {{ progressStep }}/{{ progress.stages.length }}</span
        >
      </div>
      <div
        class="progress-track"
        :class="{
          'is-indeterminate': !progress.stages && !progress.failed,
          'is-failed': progress.failed
        }"
        role="progressbar"
        :aria-valuemin="0"
        :aria-valuemax="progress.stages?.length ?? 1"
        :aria-valuenow="progress.stages ? progressStep - 1 : undefined"
        :aria-label="progressLabel"
      >
        <span
          class="progress-fill"
          :style="{
            width: progress.stages
              ? `${((progressStep - 1) / progress.stages.length) * 100}%`
              : progress.failed
                ? '0%'
                : undefined
          }"
        ></span>
      </div>
      <p v-if="progress.failed">{{
        text('此阶段失败，请重试。', 'This stage failed. Please retry.')
      }}</p>
    </section>
    <p v-if="error" class="data-import-error" role="alert">{{ error }}</p>
    <section v-if="preview" class="resonance-preview">
      <p v-if="method === 'pearpal'" class="data-import-identity">
        {{ text('服务器：', 'Server: ') }}{{ regionConfig.name[language] }} · UID:
        {{ roleid.trim() }}
      </p>
      <h3
        >{{ t.previewTitle
        }}<template v-if="preview.resonance !== null">
          ({{ preview.resonance.length }})</template
        ></h3
      >
      <p v-if="preview.skippedPools">{{ t.partialImport(preview.skippedPools) }}</p>
      <div v-if="preview.resonance !== null" class="fortune-time-table-wrap resonance-preview-wrap">
        <table class="fortune-time-table"
          ><thead
            ><tr
              ><th>{{ t.previewBanner }}</th
              ><th>{{ t.previewOutfit }}</th
              ><th>{{ t.previewRarity }}</th
              ><th>{{ t.previewSet1 }}</th></tr
            ></thead
          >
          <tbody
            ><tr v-for="record in sortResonanceRecords(preview.resonance)" :key="record.id"
              ><td>{{ record.bannerName[language] }}</td
              ><td>{{ record.outfitName[language] }}</td
              ><td>{{ t.rarity(record.rarity) }}</td
              ><td>{{
                record.sets
                  .flatMap((set) => set.parts)
                  .reduce((sum, part) => sum + Math.max(0, part.pullNumber), 0)
              }}</td></tr
            ></tbody
          >
        </table>
      </div>
      <p v-if="preview.wardrobe !== null">{{
        text(`衣橱：${wardrobeCount} 件已拥有部件`, `Wardrobe: ${wardrobeCount} owned pieces`)
      }}</p>
      <p v-if="preview.wardrobe !== null" class="data-import-wardrobe-region">{{
        text('衣橱区服：', 'Wardrobe region: ') +
        (wardrobeRegionScope(preview.wardrobe) === 'cn'
          ? text('国服', 'China')
          : text('国际服', 'Global'))
      }}</p>
      <div
        class="data-import-targets"
        role="group"
        :aria-label="text('选择导入内容', 'Choose data to import')"
      >
        <label class="cleanup-account-all"
          ><input
            v-model="selectedResonance"
            type="checkbox"
            :disabled="confirming || preview.resonance === null"
          /><span
            class="date-select-button"
            :class="{ active: selectedResonance }"
            aria-hidden="true"
            ><Check :size="16" /></span
          ><span>{{ text('导入共鸣记录', 'Import resonance records') }}</span></label
        >
        <label class="cleanup-account-all"
          ><input
            v-model="selectedWardrobe"
            type="checkbox"
            :disabled="confirming || preview.wardrobe === null"
          /><span
            class="date-select-button"
            :class="{ active: selectedWardrobe }"
            aria-hidden="true"
            ><Check :size="16" /></span
          ><span>{{ text('导入衣橱记录', 'Import wardrobe records') }}</span></label
        >
      </div>
      <p v-if="preview.resonance === null">{{
        text(
          '数据中没有可导入的共鸣记录，此项不可选。',
          'No importable resonance records; this option is unavailable.'
        )
      }}</p>
      <p v-if="preview.wardrobe === null">{{
        text(
          '数据不包含衣橱清单，此项不可选。',
          'This data does not include a wardrobe list; this option is unavailable.'
        )
      }}</p>
      <p class="data-import-warning">{{
        text(
          '国服与国际服共用一份数据。确认后整份覆盖勾选的记录，包括之前其他服务器或账号的记录；未勾选的记录保持不变。建议先导出备份。',
          'All servers share one data set. Confirmation entirely replaces selected records, including records from other servers or accounts. Unselected records stay unchanged. Export a backup first.'
        )
      }}</p>
    </section>
  </ResonanceImportDialog>
</template>
<style scoped>
.data-import-identity {
  overflow-wrap: anywhere;
}
.data-import-progress {
  --progress-track-height: 8px;
  margin-top: 16px;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.data-import-progress-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-bottom: 8px;
}
.data-import-progress-heading p {
  flex: 1 1 180px;
  min-width: 0;
}
.data-import-progress-step {
  margin-left: auto;
  white-space: nowrap;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.data-import-progress p {
  margin: 0;
}
.data-import-progress .progress-track + p {
  margin-top: 8px;
}
.data-import-progress:has(.is-failed) {
  color: var(--notice-error);
}
.resonance-preview {
  margin-top: 18px;
}
.resonance-preview h3 {
  margin-bottom: 8px;
}
.resonance-preview-wrap {
  max-height: 240px;
  overflow: auto;
}
/* 保留原生复选框语义，外观复用日期选择按钮；两个选项固定同行。 */
.data-import-targets {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  margin: 16px 0;
}
.data-import-targets label {
  position: relative;
  min-width: 0;
  flex: 0 1 auto;
}
.data-import-targets input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.data-import-targets .date-select-button {
  margin-left: 0;
  flex-shrink: 0;
}
.data-import-targets input:focus-visible + .date-select-button {
  outline: 2px solid var(--pink-deep);
  outline-offset: 2px;
}
.data-import-targets input:disabled ~ span {
  opacity: 0.5;
}
.data-import-targets input:disabled + .date-select-button {
  border-color: var(--line);
  color: transparent;
}
.data-import-error {
  color: var(--notice-error);
}
.data-import-warning {
  color: var(--notice-warning);
}
/* 避免区服控件的外边距与正文间距叠加。 */
.data-import-region-row :deep(.data-import-region) {
  margin: 0;
}
.data-import-region-row {
  margin: 0;
}
.data-import-region-hint {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
@media (min-width: 900px) {
  .data-import-region-row {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    align-items: end;
    gap: 16px;
    margin: 0;
  }
  .data-import-region-row :deep(.data-import-region) {
    margin: 0;
  }
  .data-import-region-row .data-import-region-hint {
    margin: 0;
    padding-bottom: 8px;
  }
}
</style>
