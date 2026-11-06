import { computed, inject, onMounted, ref, shallowRef, type InjectionKey } from 'vue'
import { useCloudSession } from './useCloudSession'
import {
  archiveModules,
  validateArchiveWrite,
  type ArchiveAction,
  type ArchiveHead,
  type ArchiveLocal,
  type ArchiveModule,
  type ArchiveWrite
} from '../utils/cloud/archiveSchema'
import {
  archiveBaseline,
  readArchiveLocal,
  readArchiveLocalPreview,
  type ArchiveLocalPreview,
  replaceArchiveLocal
} from '../utils/cloud/archiveStorage'
import { getArchiveHead, getArchiveSnapshot, writeArchive } from '../utils/cloud/archiveClient'
import { hasWardrobeSnapshot } from '../utils/wardrobe/wardrobeSchema'
import { summarizeWardrobe } from '../utils/wardrobe/wardrobeCloudSchema'
import { validateCloudRecords } from '../utils/resonance/cloudSchema'
import { createUuid } from '../utils/uuid'
import { reportError } from '../utils/errorReporting/errorReporter'
import type { CloudUser } from '../utils/cloud/cloudClient'

export type ArchiveDialogAction = ArchiveAction | 'login' | 'register'
type Phase = 'idle' | 'preparing' | 'ready' | 'submitting' | 'conflict' | 'uncertain' | 'error'
export function useArchiveCloudSync(
  run: <T>(task: () => Promise<T>) => Promise<T> = (task) => task()
) {
  const session = useCloudSession()
  const visible = ref(false),
    checking = ref(true),
    authBusy = ref(false)
  const action = ref<ArchiveDialogAction>('upload'),
    phase = ref<Phase>('idle')
  const local = shallowRef<Partial<ArchiveLocal> | null>(null),
    remote = shallowRef<ArchiveHead | null>(null),
    account = shallowRef<CloudUser | null>(null)
  const selected = ref<ArchiveModule[]>([]),
    error = ref(''),
    traceId = ref('')
  const moduleErrors = ref<Partial<Record<ArchiveModule, string>>>({})
  const pending = shallowRef<ArchiveWrite | null>(null)
  const logoutNotice = ref(0)
  const busy = computed(
    () => authBusy.value || phase.value === 'preparing' || phase.value === 'submitting'
  )
  const auth = computed(() => action.value === 'login' || action.value === 'register')
  const localWardrobe = computed(() =>
    local.value?.wardrobe && hasWardrobeSnapshot(local.value.wardrobe)
      ? summarizeWardrobe(local.value.wardrobe)
      : null
  )
  const eligible = computed(() =>
    archiveModules.filter(
      (k) =>
        (action.value === 'delete' || !moduleErrors.value[k]) &&
        (action.value === 'upload'
          ? k === 'resonance'
            ? !!local.value?.resonance?.length
            : !!localWardrobe.value
          : !!remote.value?.[k].active_snapshot)
    )
  )
  const canSubmit = computed(
    () =>
      !busy.value &&
      !!selected.value.length &&
      selected.value.every((k) => eligible.value.includes(k)) &&
      ['ready', 'uncertain'].includes(phase.value)
  )
  let generation = 0
  function failure(cause: unknown) {
    reportError(cause, { module: 'archive-cloud', action: action.value })
    error.value = cause instanceof Error ? cause.message : 'SERVER_ERROR'
    traceId.value =
      cause && typeof cause === 'object' && 'traceId' in cause ? String(cause.traceId ?? '') : ''
    phase.value = ['CONFLICT', 'LOCAL_CHANGED'].includes(error.value)
      ? 'conflict'
      : pending.value &&
          ['NETWORK', 'SERVER_ERROR', 'UPLOAD_PENDING', 'RATE_LIMIT'].includes(error.value)
        ? 'uncertain'
        : 'error'
    if (['ACCOUNT_CHANGED', 'LOGIN_REQUIRED'].includes(error.value)) session.invalidate()
  }
  async function prepare(initial = false) {
    if (busy.value || auth.value || !account.value) return
    const current = ++generation
    phase.value = 'preparing'
    error.value = ''
    traceId.value = ''
    pending.value = null
    try {
      await run(async () => {
        const [saved, head] = await Promise.all([
          (action.value === 'delete'
            ? Promise.resolve<ArchiveLocalPreview>({ data: {}, errors: {} })
            : readArchiveLocalPreview()
          ).catch((cause) => {
            throw new Error('LOCAL_READ_FAILED', { cause })
          }),
          getArchiveHead(account.value!)
        ])
        if (current !== generation) return
        local.value = saved.data
        remote.value = head
        moduleErrors.value = saved.errors
        if (action.value === 'upload' && saved.data.resonance?.length)
          try {
            validateCloudRecords(saved.data.resonance)
          } catch (cause) {
            moduleErrors.value.resonance = cause instanceof Error ? cause.message : 'INVALID_DATA'
          }
        if (
          action.value === 'upload' &&
          saved.data.wardrobe &&
          hasWardrobeSnapshot(saved.data.wardrobe)
        )
          try {
            validateArchiveWrite(
              {
                requestId: createUuid(),
                modules: {
                  wardrobe: { revision: head.wardrobe.revision, data: saved.data.wardrobe }
                }
              },
              false
            )
          } catch (cause) {
            moduleErrors.value.wardrobe = cause instanceof Error ? cause.message : 'INVALID_DATA'
          }
        selected.value = initial
          ? action.value === 'delete'
            ? []
            : [...eligible.value]
          : selected.value.filter((k) => eligible.value.includes(k))
        phase.value = 'ready'
      })
    } catch (cause) {
      if (current === generation) failure(cause)
    }
  }
  async function open(next: ArchiveDialogAction) {
    if (busy.value || checking.value) return
    action.value = next
    visible.value = true
    phase.value = 'idle'
    local.value = null
    remote.value = null
    error.value = ''
    traceId.value = ''
    pending.value = null
    selected.value = []
    account.value = session.user.value ? { ...session.user.value } : null
    if (!auth.value) await prepare(true)
  }
  function close() {
    if (busy.value) return
    generation++
    visible.value = false
    pending.value = null
    error.value = ''
    local.value = null
    remote.value = null
    account.value = null
    moduleErrors.value = {}
  }
  async function logout() {
    if (busy.value) return
    authBusy.value = true
    try {
      await run(session.logout)
      logoutNotice.value++
    } catch (cause) {
      action.value = 'login'
      visible.value = true
      failure(cause)
    } finally {
      authBusy.value = false
    }
  }
  async function submit() {
    if (!canSubmit.value || !account.value || !local.value || !remote.value) return
    const modules = [...selected.value],
      operation = action.value as ArchiveAction
    phase.value = 'submitting'
    error.value = ''
    traceId.value = ''
    try {
      return await run(async () => {
        if (session.user.value?.id !== account.value!.id) throw new Error('ACCOUNT_CHANGED')
        if (operation === 'download') {
          const snapshot = await getArchiveSnapshot(account.value!, modules)
          if (modules.some((k) => snapshot[k]?.revision !== remote.value![k].revision))
            throw new Error('CONFLICT')
          if (modules.some((k) => !snapshot[k]?.active_snapshot)) throw new Error('EMPTY_CLOUD')
          if (session.user.value?.id !== account.value!.id) throw new Error('ACCOUNT_CHANGED')
          try {
            await replaceArchiveLocal(local.value!, snapshot, modules)
          } catch (cause) {
            if (cause instanceof Error && cause.message === 'LOCAL_CHANGED') throw cause
            throw new Error('LOCAL_SAVE_FAILED', { cause })
          }
        } else {
          if (!pending.value) {
            if (operation === 'upload') {
              const latest = await readArchiveLocal(modules).catch((cause) => {
                throw new Error('LOCAL_READ_FAILED', { cause })
              })
              if (
                modules.some(
                  (k) => archiveBaseline(k, latest[k]!) !== archiveBaseline(k, local.value![k]!)
                )
              )
                throw new Error('LOCAL_CHANGED')
            }
            const payload: ArchiveWrite['modules'] = {}
            if (modules.includes('resonance'))
              payload.resonance = {
                revision: remote.value!.resonance.revision,
                ...(operation === 'upload' ? { records: local.value!.resonance } : {})
              }
            if (modules.includes('wardrobe'))
              payload.wardrobe = {
                revision: remote.value!.wardrobe.revision,
                ...(operation === 'upload' ? { data: local.value!.wardrobe } : {})
              }
            pending.value = structuredClone(
              validateArchiveWrite(
                { requestId: createUuid(), modules: payload },
                operation === 'delete'
              )
            )
          }
          await writeArchive(operation, account.value!, pending.value!)
        }
        pending.value = null
        phase.value = 'idle'
        visible.value = false
        return { action: operation, modules, local: local.value!, remote: remote.value! }
      })
    } catch (cause) {
      failure(cause)
    }
  }
  onMounted(async () => {
    try {
      await session.refresh()
    } catch {
      /* 本地功能不依赖云服务。 */
    } finally {
      checking.value = false
    }
  })
  return {
    session,
    visible,
    checking,
    authBusy,
    action,
    phase,
    local,
    remote,
    account,
    selected,
    error,
    traceId,
    moduleErrors,
    pending,
    busy,
    auth,
    localWardrobe,
    eligible,
    canSubmit,
    logoutNotice,
    prepare,
    open,
    close,
    submit,
    logout
  }
}
export type ArchiveCloudSync = ReturnType<typeof useArchiveCloudSync>
export const archiveCloudKey: InjectionKey<ArchiveCloudSync> = Symbol('archive-cloud')
export function useArchiveCloud() {
  const sync = inject(archiveCloudKey, null)
  if (!sync) throw new Error('Archive cloud provider missing')
  return sync
}
