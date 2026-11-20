<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowRight, AlertTriangle, UserRound } from 'lucide-vue-next'
import CloudDialog from './CloudDialog.vue'
import CloudAuthFields from './CloudAuthFields.vue'
import { useArchiveCloud } from '../composables/useArchiveCloudSync'
import { archiveCloudMessages } from '../i18n/messages/archiveCloud'
import { archiveModules, type ArchiveModule } from '../utils/cloud/archiveSchema'
import { reportError } from '../utils/errorReporting/errorReporter'
import type { ConfirmableStatus } from '../composables/useOperationNotice'

const props = defineProps<{ language: 'zh' | 'en' }>()
const emit = defineEmits<{
  notice: [status: ConfirmableStatus]
  restored: [modules: ArchiveModule[]]
}>()
const sync = useArchiveCloud()
const {
  visible,
  action,
  phase,
  local,
  remote,
  account,
  selected,
  moduleErrors,
  pending,
  busy,
  auth,
  eligible,
  canSubmit,
  error,
  traceId,
  localWardrobe
} = sync
const t = computed(() => archiveCloudMessages[props.language])
const username = ref(''),
  password = ref(''),
  confirmation = ref('')
watch(visible, () => {
  password.value = ''
  confirmation.value = ''
})
const message = computed(
  () => t.value.errors[error.value as keyof typeof t.value.errors] || t.value.errors.SERVER_ERROR
)
const description = computed(() =>
  action.value === 'upload'
    ? t.value.uploadDescription
    : action.value === 'download'
      ? t.value.downloadDescription
      : t.value.deleteDescription
)
const columns = computed(() =>
  action.value === 'upload' ? ['local', 'cloud'] : ['cloud', 'local']
)
const controlsLocked = computed(() => busy.value || !!pending.value || phase.value !== 'ready')
const regionMismatch = computed(
  () =>
    action.value !== 'delete' &&
    selected.value.includes('wardrobe') &&
    localWardrobe.value &&
    remote.value?.wardrobe.summary &&
    localWardrobe.value.regionScope !== remote.value.wardrobe.summary.regionScope
)
const emptyWardrobe = computed(
  () =>
    selected.value.includes('wardrobe') &&
    (action.value === 'upload'
      ? localWardrobe.value?.ownedCount === 0
      : action.value === 'download' && remote.value?.wardrobe.summary?.ownedCount === 0)
)
const region = (value: 'cn' | 'global') => t.value[value]
const formatDate = (value: number) =>
  new Intl.DateTimeFormat(props.language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(value)
function count(module: ArchiveModule, side: string) {
  if (module === 'resonance')
    return side === 'local' ? local.value?.resonance?.length : remote.value?.resonance.count
  return side === 'local'
    ? localWardrobe.value?.ownedCount
    : remote.value?.wardrobe.summary?.ownedCount
}
function exists(module: ArchiveModule, side: string) {
  if (side === 'cloud') return !!remote.value?.[module].active_snapshot
  return module === 'resonance' ? !!local.value?.resonance?.length : !!localWardrobe.value
}
function unavailable(module: ArchiveModule) {
  const code = moduleErrors.value[module]
  return code
    ? t.value.errors[code as keyof typeof t.value.errors] || t.value.unavailable
    : action.value === 'upload'
      ? t.value.emptyLocal
      : ''
}
async function submit() {
  if (auth.value) {
    if (busy.value) return
    sync.authBusy.value = true
    error.value = ''
    try {
      await sync.session.authenticate(
        action.value as 'login' | 'register',
        username.value,
        password.value,
        confirmation.value
      )
      const text = action.value === 'login' ? t.value.loginSuccess : t.value.registerSuccess
      sync.authBusy.value = false
      sync.close()
      emit('notice', { message: text, tone: 'success', source: 'archive-cloud' })
    } catch (cause) {
      reportError(cause, { module: 'archive-cloud', action: action.value })
      error.value = cause instanceof Error ? cause.message : 'SERVER_ERROR'
    } finally {
      sync.authBusy.value = false
      password.value = ''
      confirmation.value = ''
    }
    return
  }
  const result = await sync.submit()
  if (!result) return
  const labels = result.modules.map(
    (k) =>
      `${t.value[k]} ${k === 'resonance' ? (result.action === 'upload' ? result.local.resonance!.length : result.remote.resonance.count) : result.action === 'upload' ? localWardrobe.value!.ownedCount : result.remote.wardrobe.summary!.ownedCount} ${k === 'resonance' ? t.value.records : t.value.count}`
  )
  emit('notice', {
    message: `${result.action === 'upload' ? t.value.uploadSuccess : result.action === 'download' ? t.value.downloadSuccess : t.value.deleteSuccess}：${labels.join(' · ')}`,
    tone: 'success',
    source: 'archive-cloud'
  })
  if (result.action === 'download') emit('restored', result.modules)
}
</script>

<template>
  <CloudDialog
    :visible="visible"
    :busy="busy"
    :title="t[action]"
    :cancel-label="t.cancel"
    :archive="!auth"
    :destructive="action === 'delete'"
    @close="sync.close"
    @submit="submit"
  >
    <CloudAuthFields
      v-if="auth"
      :language="language"
      :registering="action === 'register'"
      :busy="busy"
      v-model:username="username"
      v-model:password="password"
      v-model:confirmation="confirmation"
    />
    <template v-else>
      <div class="archive-cloud-intro">
        <p>{{ description }}</p>
        <p class="archive-cloud-account"
          ><UserRound :size="15" aria-hidden="true" />{{ t.account }}:
          <strong>{{ account?.username }}</strong></p
        >
      </div>
      <fieldset
        v-if="remote && local && phase !== 'preparing'"
        class="archive-cloud-selection"
        :disabled="controlsLocked"
      >
        <div
          v-for="module in archiveModules"
          :key="module"
          class="archive-cloud-module"
          :class="{
            'is-unavailable': !eligible.includes(module),
            'is-selected': selected.includes(module)
          }"
        >
          <label class="archive-cloud-module-label">
            <input
              type="checkbox"
              v-model="selected"
              :value="module"
              :disabled="!eligible.includes(module)"
            />
            <strong>{{ t[module] }}</strong>
            <span
              v-if="selected.includes(module) && action === 'delete'"
              class="archive-cloud-badge"
              >{{ t.deleteTarget }}</span
            >
          </label>
          <p
            v-if="!eligible.includes(module) && unavailable(module)"
            class="archive-cloud-unavailable"
            >{{ unavailable(module) }}</p
          >
          <div class="archive-cloud-comparison" :class="{ 'is-delete': action === 'delete' }">
            <template
              v-for="(side, index) in action === 'delete' ? ['cloud'] : columns"
              :key="side"
            >
              <ArrowRight
                v-if="index === 1"
                class="archive-cloud-arrow"
                :size="18"
                aria-hidden="true"
              />
              <section
                :aria-label="`${t[module]} · ${side === 'local' ? t.localColumn : t.cloudColumn}`"
              >
                <div class="archive-cloud-save-heading"
                  ><span>{{ side === 'local' ? t.localColumn : t.cloudColumn }}</span>
                  <span
                    v-if="action !== 'delete'"
                    class="archive-cloud-badge"
                    :class="{ 'is-target': index === 1 }"
                    >{{
                      index === 0
                        ? t.source
                        : exists(module, side)
                          ? t.replaceTarget
                          : t.createTarget
                    }}</span
                  ></div
                >
                <p v-if="exists(module, side)" class="archive-cloud-count"
                  ><strong>{{ count(module, side)?.toLocaleString(language) }}</strong>
                  {{ module === 'resonance' ? t.records : t.count }}</p
                >
                <p v-else class="archive-cloud-empty">{{ t.noSave }}</p>
                <p
                  v-if="module === 'wardrobe' && exists(module, side)"
                  class="archive-cloud-region"
                  >{{
                    region(
                      side === 'local'
                        ? localWardrobe!.regionScope
                        : remote.wardrobe.summary!.regionScope
                    )
                  }}</p
                >
                <p v-if="side === 'cloud' && exists(module, side)" class="archive-cloud-date"
                  >{{ t.updated }}
                  <time :datetime="new Date(remote[module].updated_at).toISOString()">{{
                    formatDate(remote[module].updated_at)
                  }}</time></p
                >
              </section>
            </template>
          </div>
        </div>
      </fieldset>
      <div v-if="regionMismatch || emptyWardrobe" class="archive-cloud-warning"
        ><AlertTriangle :size="18" aria-hidden="true" /><div>
          <p v-if="regionMismatch && action !== 'delete'"
            ><strong
              >{{ action === 'download' ? t.regionChange : t.uploadRegionChange }}
              {{
                region(
                  action === 'download'
                    ? remote!.wardrobe.summary!.regionScope
                    : localWardrobe!.regionScope
                )
              }}</strong
            ><span class="archive-cloud-region-change"
              >{{
                region(
                  action === 'download'
                    ? localWardrobe!.regionScope
                    : remote!.wardrobe.summary!.regionScope
                )
              }}<ArrowRight :size="14" aria-hidden="true" />{{
                region(
                  action === 'download'
                    ? remote!.wardrobe.summary!.regionScope
                    : localWardrobe!.regionScope
                )
              }}</span
            ></p
          >
          <p v-if="emptyWardrobe">{{ action === 'upload' ? t.emptyUpload : t.emptyDownload }}</p>
        </div></div
      >
    </template>
    <div v-if="error" class="archive-cloud-error" role="alert"
      ><p>{{ message }}</p
      ><p v-if="traceId" class="archive-cloud-trace">{{ t.traceId }}: {{ traceId }}</p></div
    >
    <template #footer>
      <span v-if="!auth && remote" class="archive-cloud-footer-count"
        >{{ t.selected }} {{ selected.length }} {{ t.moduleUnit }}</span
      >
      <button
        type="button"
        class="confirm-dialog-button ghost"
        :disabled="busy"
        @click="sync.close"
        >{{ t.cancel }}</button
      >
      <button
        v-if="!auth && (phase === 'conflict' || phase === 'error')"
        type="button"
        class="confirm-dialog-button ghost"
        :disabled="busy || !sync.session.user.value"
        @click="sync.prepare()"
        >{{ t.refresh }}</button
      >
      <button
        v-else
        type="submit"
        class="confirm-dialog-button primary archive-cloud-confirm"
        :class="{ 'is-danger': action === 'delete' }"
        :disabled="auth ? busy : !canSubmit"
        >{{ busy ? t.working : pending ? t.retry : auth ? t[action] : t.confirm }}</button
      >
    </template>
  </CloudDialog>
</template>

<style scoped>
.archive-cloud-intro,
.archive-cloud-selection,
.archive-cloud-warning,
.archive-cloud-error,
.archive-cloud-footer-count {
  --archive-secondary: #756662;
  --archive-warning: #765019;
  --archive-danger: #a13e48;
  min-width: 0;
}
.archive-cloud-intro p,
.archive-cloud-module p,
.archive-cloud-warning p,
.archive-cloud-error p {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
}
.archive-cloud-intro .archive-cloud-account {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  color: var(--archive-secondary);
  font-size: 13px;
}
.archive-cloud-account strong {
  color: var(--heading);
  overflow-wrap: anywhere;
}
.archive-cloud-selection {
  padding: 0;
  margin: 0;
  border: 0;
  display: grid;
  gap: 12px;
}
.archive-cloud-module {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 18px;
  transition: border-color var(--motion-base) ease;
}
.archive-cloud-module.is-selected {
  border-color: var(--pink-deep);
}
.archive-cloud-module .archive-cloud-module-label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 15px;
}
.archive-cloud-module-label input {
  appearance: none;
  display: inline-grid;
  place-content: center;
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface-strong);
  cursor: pointer;
  flex: none;
}
.archive-cloud-module-label input::after {
  content: '';
  width: 7px;
  height: 4px;
  border-bottom: 2px solid var(--primary-text);
  border-left: 2px solid var(--primary-text);
  transform: translateY(-1px) rotate(-45deg);
  visibility: hidden;
}
.archive-cloud-module-label input:checked {
  border-color: var(--pink-deep);
  background: var(--pink-deep);
}
.archive-cloud-module-label input:checked::after {
  visibility: visible;
}
.archive-cloud-module-label input:hover:not(:disabled) {
  border-color: var(--pink-deep);
}
.archive-cloud-module-label input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.archive-cloud-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--soft-accent);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
}
.archive-cloud-badge.is-target {
  background: var(--yellow-soft);
  color: var(--archive-warning);
}
.archive-cloud-comparison {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  margin-top: 8px;
}
.archive-cloud-comparison.is-delete {
  grid-template-columns: minmax(0, 1fr);
}
.archive-cloud-save-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--archive-secondary);
}
.archive-cloud-arrow {
  margin-top: 36px;
  color: var(--archive-secondary);
}
.archive-cloud-count {
  color: var(--archive-secondary);
}
.archive-cloud-count strong {
  color: var(--heading);
  font-size: 26px;
  line-height: 1.2;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.archive-cloud-module .archive-cloud-region {
  margin-top: 4px;
  font-size: 13px;
  color: var(--archive-secondary);
}
.archive-cloud-module .archive-cloud-date {
  margin-top: 10px;
  color: var(--archive-secondary);
  font-size: 11px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.archive-cloud-empty,
.archive-cloud-unavailable {
  color: var(--archive-secondary);
}
.archive-cloud-module .archive-cloud-unavailable {
  font-size: 13px;
  margin: 4px 0 12px;
}
.archive-cloud-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--yellow-soft);
  color: var(--archive-warning);
}
.archive-cloud-warning > svg {
  flex: none;
  margin-top: 3px;
}
.archive-cloud-warning p + p {
  margin-top: 10px;
}
.archive-cloud-warning strong {
  font-weight: 600;
}
.archive-cloud-region-change {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 13px;
}
.archive-cloud-error {
  border: 1px solid var(--archive-danger);
  border-radius: 12px;
  padding: 14px 16px;
  color: var(--archive-danger);
}
.archive-cloud-error .archive-cloud-trace {
  font-size: 12px;
  margin-top: 8px;
  overflow-wrap: anywhere;
}
.archive-cloud-footer-count {
  margin-right: auto;
  color: var(--archive-secondary);
  font-size: 12px;
}
.archive-cloud-module input:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 4px;
}
:where(:root[data-theme='dark']) .archive-cloud-intro,
:where(:root[data-theme='dark']) .archive-cloud-selection,
:where(:root[data-theme='dark']) .archive-cloud-warning,
:where(:root[data-theme='dark']) .archive-cloud-error,
:where(:root[data-theme='dark']) .archive-cloud-footer-count {
  --archive-secondary: #c9b9b5;
  --archive-warning: #f0d294;
  --archive-danger: #ffb2b9;
}
@media (prefers-reduced-motion: reduce) {
  .archive-cloud-module {
    transition: none;
  }
}
@media (max-width: 540px) {
  .archive-cloud-comparison {
    gap: 10px;
    grid-template-columns: minmax(0, 1fr);
  }
  .archive-cloud-arrow {
    margin: 0;
    transform: rotate(90deg);
  }
  .archive-cloud-module {
    padding: 12px;
  }
  .archive-cloud-count strong {
    font-size: 23px;
  }
  .archive-cloud-module .archive-cloud-date {
    font-size: 11px;
  }
  .archive-cloud-footer-count {
    flex-basis: 100%;
  }
  .archive-cloud-save-heading {
    min-height: 42px;
    align-content: start;
  }
}
@media (max-width: 360px) {
  .archive-cloud-comparison {
    grid-template-columns: minmax(0, 1fr);
  }
  .archive-cloud-arrow {
    margin: 0;
    transform: rotate(90deg);
  }
  .archive-cloud-save-heading {
    min-height: 0;
  }
}
</style>
