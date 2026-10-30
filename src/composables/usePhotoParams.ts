import { readPhotoFile, isAlbumPhoto } from '../utils/photoGrouping'
import { formatCameraParams } from '../utils/photo-params/formatCameraParams'
import {
  computed,
  nextTick,
  onScopeDispose,
  ref,
  shallowRef,
  type ComputedRef,
  type Ref
} from 'vue'
import { PhotoParseError } from '../utils/photo-params/parseError'
import type { Language } from '../i18n'
import type { PhotoParamsMessages } from '../i18n/messages/photoParams'
import type { FilePhotoItem, PhotoItem } from '../utils/photoGrouping'
import { listGamePlayPhotoAccounts } from '../utils/file-system/directoryAccess'
import {
  addSavedCameraParamUid,
  getSavedCameraParamUids,
  getSavedX6GameDirectoryHandle
} from '../utils/file-system/directoryStorage'
import { decodeCameraParams, decodePhoto } from '../utils/photo-params/wasmClient'
import type {
  PhotoParamsProgress,
  PhotoParamsResult,
  PhotoParamsStage
} from '../utils/photo-params/types'

type DecodedPhoto = Pick<PhotoParamsResult, 'outfit' | 'rawOutfit'> & {
  rawCameraParams: string
  photo: Record<string, unknown>
  camera: Record<string, unknown>
}

export function usePhotoParams(options: {
  language: Readonly<Ref<Language>>
  messages: ComputedRef<PhotoParamsMessages>
}) {
  const { language, messages } = options
  const photo = ref<PhotoItem | { name: string } | null>(null)
  const uploadFile = ref<File | null>(null)
  const isVisible = ref(false)
  const result = ref<PhotoParamsResult | null>(null)
  const failure = shallowRef<unknown>(null)
  const errorCodes = computed(() =>
    failure.value instanceof PhotoParseError ? failure.value.codes : []
  )
  const error = computed(() => {
    if (failure.value === null) return null
    if (failure.value instanceof PhotoParseError)
      return failure.value.codes.map(describeError).join('；')
    return failure.value instanceof Error ? failure.value.message : String(failure.value)
  })
  const uidRequired = ref(false)
  const progress = ref<PhotoParamsProgress>({ stage: 'idle', percent: 0, message: '' })
  let runId = 0
  let photoBytes: Uint8Array | null = null

  function setStage(stage: PhotoParamsStage, percent: number) {
    progress.value = { stage, percent, message: messages.value.stages[stage] }
  }

  function describeError(code: string): string {
    const errorMessages = messages.value.errors
    return errorMessages.format(
      code,
      errorMessages.descriptions[code] ?? errorMessages.unknownMeaning
    )
  }

  function requiresUid(errorCode: string | undefined): boolean {
    return errorCode === 'photo_structure_invalid'
  }

  function presentCameraParams(
    camera: Record<string, unknown>,
    rawCameraParams: string,
    photoData?: Record<string, unknown>,
    dressing?: Pick<PhotoParamsResult, 'outfit' | 'rawOutfit'>
  ) {
    result.value = formatCameraParams(
      camera,
      rawCameraParams,
      language.value,
      messages.value,
      photoData
    )
    if (dressing)
      Object.assign(result.value!, { outfit: dressing.outfit, rawOutfit: dressing.rawOutfit })
  }

  async function parsePhotoBytes(bytes: Uint8Array, candidateUids: string[], run: number) {
    setStage('loadingWasm', 50)
    await nextTick()
    if (run !== runId) return null
    setStage('decryptingPhoto', 70)
    let decoded: Awaited<ReturnType<typeof decodePhoto<DecodedPhoto>>> | null = null
    const errors: string[] = []
    for (const uid of candidateUids) {
      const attempt = await decodePhoto<DecodedPhoto>(bytes, uid)
      if (run !== runId) return null
      if (attempt.ok && attempt.value) {
        decoded = attempt
        break
      }
      if (attempt.errorCode && !errors.includes(attempt.errorCode)) errors.push(attempt.errorCode)
    }
    if (run !== runId) return null
    if (!decoded?.value) {
      // 只有“未找到有效 UID 账号”才需要用户输入 UID；其它照片结构或参数错误直接展示错误信息。
      uidRequired.value = errors.length > 0 && errors.every((code) => requiresUid(code))
      throw new PhotoParseError(errors)
    }
    return decoded.value
  }

  async function openForPhoto(selectedPhoto: PhotoItem) {
    if (selectedPhoto.source === 'file') return openForFile(selectedPhoto.file, selectedPhoto)
    const run = ++runId
    photoBytes = null
    isVisible.value = true
    photo.value = selectedPhoto
    uploadFile.value = null
    result.value = null
    failure.value = null
    uidRequired.value = false
    try {
      setStage('resolvingUid', 10)
      await nextTick()
      if (run !== runId) return null
      const x6Game = await getSavedX6GameDirectoryHandle()
      if (run !== runId) return
      if (!x6Game) throw new Error(messages.value.authorizationRequired)
      setStage('readingPhoto', 30)
      await nextTick()
      if (run !== runId) return null
      const bytes = new Uint8Array(await (await readPhotoFile(selectedPhoto)).arrayBuffer())
      if (run !== runId) return
      photoBytes = bytes
      const directoryUids = await listGamePlayPhotoAccounts(x6Game)
      if (run !== runId) return
      const savedUids = await getSavedCameraParamUids()
      if (run !== runId) return
      const candidateUids = [...new Set([...directoryUids, ...savedUids])]
      const decoded = await parsePhotoBytes(bytes, candidateUids, run)
      if (!decoded || run !== runId) return
      setStage('parsingCamera', 90)
      presentCameraParams(decoded.camera, decoded.rawCameraParams, decoded.photo, decoded)
      setStage('ready', 100)
    } catch (caught) {
      if (run !== runId) return
      failure.value = caught
      setStage('error', 100)
    }
  }

  async function openForFile(file: File, sourcePhoto?: FilePhotoItem) {
    const run = ++runId
    photoBytes = null
    isVisible.value = true
    photo.value = sourcePhoto ?? { name: file.name }
    uploadFile.value = file
    result.value = null
    failure.value = null
    uidRequired.value = false
    try {
      setStage('readingPhoto', 30)
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (run !== runId) return
      photoBytes = bytes
      const x6Game = sourcePhoto ? null : await getSavedX6GameDirectoryHandle()
      if (run !== runId) return
      const directoryUids = x6Game ? await listGamePlayPhotoAccounts(x6Game) : []
      if (run !== runId) return
      const savedUids = await getSavedCameraParamUids()
      if (run !== runId) return
      const candidateUids = [...new Set([...directoryUids, ...savedUids])]
      if (!candidateUids.length) {
        uidRequired.value = true
        throw new PhotoParseError(['photo_structure_invalid'])
      }
      const decoded = await parsePhotoBytes(bytes, candidateUids, run)
      if (!decoded || run !== runId) return
      setStage('parsingCamera', 90)
      presentCameraParams(decoded.camera, decoded.rawCameraParams, decoded.photo, decoded)
      setStage('ready', 100)
    } catch (caught) {
      if (run !== runId) return
      failure.value = caught
      setStage('error', 100)
    }
  }

  async function submitUid(uid: string) {
    const selectedPhoto = photo.value
    const normalized = uid.trim()
    if (!selectedPhoto || !normalized) return
    const run = ++runId
    result.value = null
    failure.value = null
    // UID 输入只在解析器明确报告 UID 无效时显示；其它异常不能留下旧的输入表单状态。
    uidRequired.value = false
    setStage('readingPhoto', 30)
    try {
      const bytes =
        photoBytes ??
        (uploadFile.value
          ? new Uint8Array(await uploadFile.value.arrayBuffer())
          : isAlbumPhoto(selectedPhoto)
            ? new Uint8Array(await (await readPhotoFile(selectedPhoto)).arrayBuffer())
            : null)
      if (!bytes || run !== runId) return
      photoBytes = bytes
      const decoded = await decodePhoto<DecodedPhoto>(bytes, normalized)
      if (run !== runId) return
      if (!decoded.ok || !decoded.value) {
        uidRequired.value = requiresUid(decoded.errorCode)
        throw new PhotoParseError([decoded.errorCode ?? 'photo_parse_failed'])
      }
      await addSavedCameraParamUid(normalized)
      // 保存 UID 期间也可能切换或关闭窗口，旧结果不能再写入界面。
      if (run !== runId) return
      presentCameraParams(
        decoded.value.camera,
        decoded.value.rawCameraParams,
        decoded.value.photo,
        decoded.value
      )
      setStage('ready', 100)
    } catch (caught) {
      if (run !== runId) return
      failure.value = caught
      setStage('error', 100)
    }
  }

  async function loadSourcePhoto(): Promise<Blob> {
    // Use an owned in-memory copy; mobile file-provider references may expire.
    if (photoBytes)
      return new Blob([photoBytes.slice().buffer], { type: uploadFile.value?.type || 'image/jpeg' })
    if (uploadFile.value) return uploadFile.value
    if (photo.value && isAlbumPhoto(photo.value)) return readPhotoFile(photo.value)
    throw new Error('Source photo unavailable')
  }

  function openCameraParamsTool() {
    runId += 1
    photoBytes = null
    isVisible.value = true
    photo.value = null
    uploadFile.value = null
    result.value = null
    failure.value = null
    uidRequired.value = false
    progress.value = { stage: 'idle', percent: 0, message: '' }
  }

  async function parseRawCameraParams(raw: string) {
    const run = ++runId
    result.value = null
    failure.value = null
    uidRequired.value = false
    setStage('loadingWasm', 40)
    try {
      const decoded = await decodeCameraParams<Record<string, unknown>>(raw)
      if (run !== runId) return
      if (!decoded.ok || !decoded.value)
        throw new PhotoParseError([decoded.errorCode ?? 'camera_decrypt_failed'])
      presentCameraParams(decoded.value, raw)
      setStage('ready', 100)
    } catch (caught) {
      if (run !== runId) return
      failure.value = caught
      setStage('error', 100)
    }
  }

  function close() {
    runId += 1
    photoBytes = null
    isVisible.value = false
    photo.value = null
    uploadFile.value = null
    result.value = null
    failure.value = null
    uidRequired.value = false
    progress.value = { stage: 'idle', percent: 0, message: '' }
  }

  onScopeDispose(() => {
    runId += 1
    photoBytes = null
  })

  return {
    loadSourcePhoto,
    uploadFile,
    photo,
    isVisible,
    result,
    error,
    errorCodes,
    uidRequired,
    progress,
    openForPhoto,
    openForFile,
    submitUid,
    openCameraParamsTool,
    parseRawCameraParams,
    close
  }
}
