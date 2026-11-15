import {
  cacheGeneration,
  isCurrentCacheGeneration,
  persistCacheIfCurrent
} from '../utils/cacheLifecycle'
import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'
import type { Language } from '../i18n'
import type { PhotoActionInfo, PhotoItem } from '../utils/photoGrouping'
import {
  getSavedPhotoActionCaches,
  savePhotoActionCache,
  savePhotoActionCaches,
  type PhotoActionCacheEntry
} from '../utils/file-system/directoryStorage'
import {
  parsePhotoAction,
  photoActionFingerprint,
  PHOTO_ACTION_PARSER_VERSION
} from '../utils/photo-params/photoActionParser'
import { PHOTO_ACTION_CATALOG_VERSION } from '../utils/photo-params/resourceManifest'
import { runWithConcurrency } from '../utils/concurrency'

export interface PhotoActionParseProgress {
  running: boolean
  completed: number
  total: number
  failed: number
}

function toInfo(entry: PhotoActionCacheEntry): PhotoActionInfo {
  return {
    status: entry.status,
    actionId: entry.actionId,
    actionName: entry.actionName,
    actionImageUrl: entry.actionImageUrl,
    errorCode: entry.errorCode,
    fingerprint: entry.fingerprint,
    parsedAt: entry.parsedAt
  }
}

export function usePhotoActionParsing(options: {
  language: Ref<Language>
  onError?: (error: unknown) => void
}) {
  const actionInfo = ref(new Map<string, PhotoActionInfo>())
  const progress = ref<PhotoActionParseProgress>({
    running: false,
    completed: 0,
    total: 0,
    failed: 0
  })
  // Only deterministic photo/UID failures are reusable; transient I/O and WASM failures retry normally.
  const cacheableFailures = new Set([
    'jpeg_tail_not_found',
    'jpeg_second_end_marker_missing',
    'base64_invalid',
    'photo_structure_invalid',
    'camera_params_missing',
    'camera_base64_invalid',
    'camera_decrypt_failed',
    'camera_params_invalid_length',
    'uid_missing'
  ])
  const uidDependentFailures = new Set([
    'photo_structure_invalid',
    'camera_decrypt_failed',
    'uid_missing'
  ])
  // No raw account identifiers enter the cache. Used only for comparing the candidate UID set.
  function uidSignature(uids: string[]): string {
    let hash = 2166136261
    for (const char of [...new Set(uids)].sort().join('|')) {
      hash ^= char.charCodeAt(0)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
  }
  let runId = 0
  let controller: AbortController | null = null

  function cancel() {
    controller?.abort()
    runId += 1
    progress.value = { ...progress.value, running: false }
  }

  // 缓存始终加载；开关只决定是否继续解析未命中的照片。
  async function start(
    photos: PhotoItem[],
    albumKey: string,
    resolveCandidateUids: () => Promise<string[]>,
    parseMissing = true,
    retryFailed = false
  ) {
    cancel()
    controller = new AbortController()
    const signal = controller.signal
    const generation = cacheGeneration()
    const run = ++runId
    progress.value = { running: parseMissing, completed: 0, total: photos.length, failed: 0 }
    actionInfo.value = new Map()
    const next = new Map<string, PhotoActionInfo>()
    const pending: PhotoItem[] = []
    let candidateUids: string[] | undefined
    const getUids = async () => (candidateUids ??= await resolveCandidateUids())

    try {
      const caches = await getSavedPhotoActionCaches(albumKey)
      for (const photo of photos) {
        const fingerprint = photoActionFingerprint(albumKey, photo)
        const cache = caches.get(photo.name)
        if (run !== runId || signal.aborted || !isCurrentCacheGeneration(generation)) return
        if (
          cache &&
          cache.fingerprint === fingerprint &&
          cache.parserVersion === PHOTO_ACTION_PARSER_VERSION &&
          cache.catalogVersion === PHOTO_ACTION_CATALOG_VERSION
        ) {
          // Explicit off -> on retries failures. UID-dependent cached results are invalidated
          // if the candidate accounts change, even when the file itself is unchanged.
          const retry =
            cache.status === 'unparsed' &&
            parseMissing &&
            (retryFailed ||
              (uidDependentFailures.has(cache.errorCode ?? '') &&
                cache.uidSignature !== uidSignature(await getUids())))
          if (!retry) {
            next.set(photo.id, { ...toInfo(cache), fingerprint })
            continue
          }
        }
        next.set(photo.id, { status: parseMissing ? 'pending' : 'unparsed', fingerprint })
        pending.push(photo)
      }
      if (run !== runId || signal.aborted || !isCurrentCacheGeneration(generation)) return
      actionInfo.value = next
      const cachedCount = photos.length - pending.length
      const cachedFailed = [...next.values()].filter((item) => item.status === 'unparsed').length
      progress.value = { ...progress.value, completed: cachedCount, failed: cachedFailed }
      // 关闭时仅展示缓存，不获取 UID、不弹授权，也不读取原图解码。
      if (!parseMissing) {
        progress.value = { running: false, completed: cachedCount, total: photos.length, failed: 0 }
        return
      }
      if (!pending.length) {
        progress.value = {
          running: false,
          completed: photos.length,
          total: photos.length,
          failed: cachedFailed
        }
        return
      }

      candidateUids = await getUids()
      if (run !== runId || signal.aborted || !isCurrentCacheGeneration(generation)) return
      const parsed = candidateUids.length
        ? await runWithConcurrency(
            pending,
            (photo) => parsePhotoAction(photo, candidateUids ?? [], options.language.value),
            {
              concurrency: 15,
              signal,
              onItemComplete: (photo, _index, result) => {
                if (run !== runId || signal.aborted || !isCurrentCacheGeneration(generation)) return
                const fingerprint = photoActionFingerprint(albumKey, photo)
                const info = { ...result, fingerprint }
                actionInfo.value.set(photo.id, info)
                progress.value = {
                  ...progress.value,
                  completed: progress.value.completed + 1,
                  failed: progress.value.failed + (result.status === 'unparsed' ? 1 : 0)
                }
                if (result.status !== 'unparsed' || cacheableFailures.has(result.errorCode ?? '')) {
                  void persistCacheIfCurrent(generation, () =>
                    savePhotoActionCache(albumKey, photo.name, {
                      fingerprint,
                      parserVersion: PHOTO_ACTION_PARSER_VERSION,
                      catalogVersion: PHOTO_ACTION_CATALOG_VERSION,
                      status: result.status as PhotoActionCacheEntry['status'],
                      actionId: result.actionId,
                      actionName: result.actionName,
                      actionImageUrl: result.actionImageUrl,
                      errorCode: result.errorCode,
                      parsedAt: result.parsedAt ?? Date.now(),
                      ...(result.status === 'unparsed' &&
                      uidDependentFailures.has(result.errorCode ?? '')
                        ? { uidSignature: uidSignature(candidateUids ?? []) }
                        : {})
                    })
                  ).catch(() => undefined)
                }
              }
            }
          )
        : []
      if (run !== runId || signal.aborted || !isCurrentCacheGeneration(generation)) return
      if (!candidateUids.length) {
        const updated = new Map(actionInfo.value)
        for (const photo of pending) {
          const fingerprint = photoActionFingerprint(albumKey, photo)
          const info: PhotoActionInfo = {
            status: 'unparsed',
            fingerprint,
            errorCode: 'uid_missing',
            parsedAt: Date.now()
          }
          updated.set(photo.id, info)
        }
        actionInfo.value = updated
        // Missing UID is a stable result until credentials change or the user retries.
        // 串行提交小批次，取消或清缓存后不再分派，避免为每张照片同时打开数据库。
        const batchSize = 128
        for (let offset = 0; offset < pending.length; offset += batchSize) {
          if (run !== runId || signal.aborted || !isCurrentCacheGeneration(generation)) return
          const entries = pending.slice(offset, offset + batchSize).map(
            (photo) =>
              [
                photo.name,
                {
                  fingerprint: photoActionFingerprint(albumKey, photo),
                  parserVersion: PHOTO_ACTION_PARSER_VERSION,
                  catalogVersion: PHOTO_ACTION_CATALOG_VERSION,
                  status: 'unparsed',
                  errorCode: 'uid_missing',
                  uidSignature: uidSignature([]),
                  parsedAt: Date.now()
                }
              ] as const
          )
          await persistCacheIfCurrent(generation, () =>
            savePhotoActionCaches(albumKey, entries)
          ).catch(() => undefined)
        }
        if (run !== runId || signal.aborted || !isCurrentCacheGeneration(generation)) return
        progress.value = {
          running: false,
          completed: photos.length,
          total: photos.length,
          failed: pending.length
        }
        return
      }
      progress.value = {
        running: false,
        completed: photos.length,
        total: photos.length,
        failed: parsed.filter((item) => item.status === 'unparsed').length + cachedFailed
      }
    } catch (error) {
      // 旧任务失败不得覆盖新任务；准备阶段失败也应结束 pending，而不是悬挂进度。
      if (run !== runId || signal.aborted || !isCurrentCacheGeneration(generation)) return
      controller?.abort()
      const updated = new Map(actionInfo.value)
      for (const photo of photos) {
        if (!updated.has(photo.id) || updated.get(photo.id)?.status === 'pending') {
          updated.set(photo.id, {
            status: 'unparsed',
            errorCode: 'prepare_failed',
            fingerprint: photoActionFingerprint(albumKey, photo)
          })
        }
      }
      actionInfo.value = updated
      progress.value = {
        running: false,
        completed: photos.length,
        total: photos.length,
        failed: [...updated.values()].filter((item) => item.status === 'unparsed').length
      }
      options.onError?.(error)
    } finally {
      if (run === runId) progress.value = { ...progress.value, running: false }
    }
  }

  function reset() {
    cancel()
    actionInfo.value = new Map()
    progress.value = { running: false, completed: 0, total: 0, failed: 0 }
  }
  if (getCurrentScope()) onScopeDispose(cancel)
  return { actionInfo, progress, start, cancel, reset }
}
