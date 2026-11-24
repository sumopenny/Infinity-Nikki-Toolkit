import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import { defaultWallpaperId, homeWallpapers, wallpaperUrl } from '../data/homeWallpapers'
import { readCustomWallpaper, writeCustomWallpaper } from '../utils/homeWallpaperStorage'
import { readLocalStorage, writeLocalStorage } from '../utils/localStorage'
import { MAX_IMAGE_BYTES, snapshotImageFile, convertImageToWebp } from '../utils/image'
import { inspectStoredImage } from '../utils/storedImage'
import { useLatestRequest } from './useLatestRequest'

const key = 'infinity-nikki-home-wallpaper'
const defaultLightness = 100
const formats = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif'])
type WallpaperId = string | null
type Failure = 'load' | 'upload' | 'storage'
type Settings = { wallpaperId: WallpaperId; textLightness: number; backgroundBlur: number }

function normalizeLightness(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : defaultLightness
}

function normalizeBlur(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(20, Math.round(value)))
    : 0
}

function readSettings(): Settings {
  const defaults = { wallpaperId: defaultWallpaperId(), textLightness: defaultLightness, backgroundBlur: 0 }
  try {
    const stored = readLocalStorage(key)
    if (!stored) return defaults
    const value = JSON.parse(stored)
    if (!value || typeof value !== 'object') return defaults
    return {
      wallpaperId:
        value.wallpaperId === 'custom' ||
        homeWallpapers.some((item) => item.id === value.wallpaperId)
          ? value.wallpaperId
          : defaults.wallpaperId,
      textLightness: normalizeLightness(value.textLightness),
      backgroundBlur: normalizeBlur(value.backgroundBlur)
    }
  } catch {
    return defaults
  }
}

/** 加载成功才交给 CSS；取消或超时会释放临时图片及监听。 */
export function preloadWallpaper(url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const finish = (error?: Error) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      image.onload = image.onerror = null
      if (error) {
        image.removeAttribute('src')
        reject(error)
      } else resolve()
    }
    const abort = () => finish(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => finish(new Error('Wallpaper load timed out')), 15000)
    image.onload = () =>
      image.naturalWidth && image.naturalHeight
        ? finish()
        : finish(new Error('Invalid wallpaper dimensions'))
    image.onerror = () => finish(new Error('Wallpaper load failed'))
    if (signal.aborted) abort()
    else {
      signal.addEventListener('abort', abort, { once: true })
      try {
        image.src = url
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    }
  })
}

export function useHomeWallpaper(notify: (failure: Failure) => void) {
  const settings = readSettings()
  const selected = ref<WallpaperId>(null)
  const lightness = ref(settings.textLightness)
  const blur = ref(settings.backgroundBlur)
  const source = ref('')
  const customUrl = shallowRef('')
  const pending = ref<WallpaperId>(null)
  const uploading = ref(false)
  const request = useLatestRequest()
  let disposed = false
  let customRead: Promise<string> | undefined

  function persist() {
    if (!disposed)
      writeLocalStorage(
        key,
        JSON.stringify({
          wallpaperId: selected.value,
          textLightness: lightness.value,
          backgroundBlur: blur.value
        })
      )
  }

  // 同一主页生命周期只读一次；失败允许重试。
  function loadCustom(): Promise<string> {
    if (!customRead) {
      customRead = readCustomWallpaper()
        .then(async (blob) => {
          if (disposed || !blob) return ''
          const checked = await inspectStoredImage(blob, false)
          if (!formats.has(checked.extension)) throw new Error('Unsupported wallpaper')
          if (disposed) return ''
          customUrl.value = URL.createObjectURL(checked.blob)
          return customUrl.value
        })
        .catch((error) => {
          customRead = undefined
          throw error
        })
    }
    return customRead
  }

  async function select(id: WallpaperId, force = false) {
    if (disposed || uploading.value || (!force && id === selected.value && !pending.value))
      return false
    const task = request.begin()
    pending.value = id
    try {
      const preset = homeWallpapers.find((item) => item.id === id)
      const url = id === 'custom' ? await loadCustom() : preset ? wallpaperUrl(preset) : ''
      if (!task.isCurrent()) return false
      if (id !== null && !url) throw new Error('Wallpaper unavailable')
      if (url) await preloadWallpaper(url, task.signal)
      if (!task.isCurrent()) return false
      source.value = url
      selected.value = id
      persist()
      return true
    } catch {
      if (task.isCurrent()) notify('load')
      return false
    } finally {
      if (task.isCurrent()) pending.value = null
    }
  }

  async function restore() {
    const taskId = settings.wallpaperId
    if (taskId === null) return
    const ok = await select(taskId, true)
    if (!ok && !disposed && !pending.value && selected.value === null && !uploading.value) {
      const fallback = defaultWallpaperId()
      if (fallback && fallback !== taskId) await select(fallback, true)
    }
  }

  async function upload(file: File) {
    if (disposed || uploading.value) return
    request.invalidate()
    pending.value = null
    uploading.value = true
    let candidate = ''
    let saving = false
    const task = request.begin()
    try {
      if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('Invalid size')
      const snapshot = await snapshotImageFile(file)
      const checked = await inspectStoredImage(snapshot, false)
      if (!formats.has(checked.extension)) throw new Error('Unsupported wallpaper format')
      const normalized = new File([checked.blob], 'wallpaper.' + checked.extension, {
        type: checked.blob.type
      })
      const blob = await convertImageToWebp(normalized, { maxEdge: 3840 })
      if (blob.type !== 'image/webp') throw new Error('WebP encoder unavailable')
      if (!task.isCurrent()) return
      candidate = URL.createObjectURL(blob)
      await preloadWallpaper(candidate, task.signal)
      if (!task.isCurrent()) return
      saving = true
      await writeCustomWallpaper(blob)
      if (!task.isCurrent()) return
      const old = customUrl.value
      customUrl.value = candidate
      customRead = Promise.resolve(candidate)
      source.value = candidate
      selected.value = 'custom'
      candidate = ''
      if (old) URL.revokeObjectURL(old)
      persist()
    } catch {
      if (task.isCurrent()) notify(saving ? 'storage' : 'upload')
    } finally {
      if (candidate) URL.revokeObjectURL(candidate)
      if (task.isCurrent()) uploading.value = false
    }
  }

  async function prepareCustom() {
    try {
      await loadCustom()
    } catch {
      if (!disposed) notify('load')
    }
  }

  function setLightness(value: number) {
    lightness.value = normalizeLightness(value)
  }

  function setBlur(value: number) {
    blur.value = normalizeBlur(value)
  }

  async function reset() {
    if (uploading.value) return
    const ok = await select(defaultWallpaperId(), true)
    if (ok && !disposed) {
      lightness.value = defaultLightness
      blur.value = 0
      persist()
    }
  }

  const style = computed(() => ({
    '--home-wallpaper': source.value ? 'url(' + JSON.stringify(source.value) + ')' : 'none',
    '--home-text-lightness': lightness.value + '%',
    '--home-background-blur': blur.value + 'px'
  }))

  onMounted(() => {
    void restore()
  })
  onScopeDispose(() => {
    disposed = true
    if (customUrl.value) URL.revokeObjectURL(customUrl.value)
  })

  return {
    selected,
    lightness,
    blur,
    source,
    customUrl,
    pending,
    uploading,
    style,
    select,
    upload,
    prepareCustom,
    setLightness,
    setBlur,
    persist,
    reset
  }
}
