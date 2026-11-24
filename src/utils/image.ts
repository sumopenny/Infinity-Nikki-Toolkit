import { annotateDiagnosticError, trackDiagnostic } from './errorReporting/errorReporter'
// 通用图片处理：负责图片格式识别、WebP 转换、尺寸校验。
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'])
export const MAX_IMAGE_BYTES = 64 * 1024 * 1024
const MAX_IMAGE_PIXELS = 40_000_000

export function imageExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

export function isSupportedImage(fileName: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(imageExtension(fileName))
}

// 立即通过 FileReader 获取真实字节，避免只包装原 File 后仍依赖手机文件提供器。
async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    const finish = () => {
      clearTimeout(timer)
      reader.onload = reader.onerror = reader.onabort = null
    }
    const timer = setTimeout(() => {
      finish()
      reader.abort()
      reject(new Error('FileReader timeout (15000ms)'))
    }, 15000)
    reader.onload = () => {
      const result = reader.result
      finish()
      if (result instanceof ArrayBuffer) resolve(result)
      else reject(new Error('FileReader returned a non-buffer result'))
    }
    reader.onerror = () => {
      const error = reader.error ?? new Error('FileReader error without native reason')
      finish()
      reject(error)
    }
    reader.onabort = () => {
      finish()
      reject(new Error('FileReader aborted'))
    }
    try {
      reader.readAsArrayBuffer(blob)
    } catch (error) {
      finish()
      reject(error)
    }
  })
}

// 从实际字节创建独立文件，保留名称、类型和时间；失败时不交出原始引用。
export async function snapshotImageFile(file: File): Promise<File> {
  if (file.size > MAX_IMAGE_BYTES)
    throw imageDiagnosticError('selected:snapshot', file, new Error('Image is too large'))
  try {
    const bytes = await readBlobBytes(file)
    if (!bytes.byteLength || bytes.byteLength !== file.size)
      throw new Error('Image snapshot byte count mismatch')
    return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified })
  } catch (error) {
    throw imageDiagnosticError('selected:snapshot', file, error)
  }
}

// 保留失败阶段和浏览器原始异常；img 的 error 事件通常不会提供底层解码原因。
export function imageDiagnosticError(stage: string, blob: Blob, error: unknown): Error {
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const environment = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const detail = `[${stage}] ${reason}; type=${blob.type || 'unknown'}; bytes=${blob.size}; browser=${environment}`
  const diagnostic = new Error(detail, { cause: error })
  return annotateDiagnosticError(diagnostic, {
    stage,
    context: { mimeType: blob.type, sizeBytes: blob.size }
  })
}

function validateImageDimensions(width: number, height: number): void {
  if (!width || !height) throw new Error('Image dimensions are invalid')
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('Image dimensions are too large')
}

// 统一供转换和校验使用；部分手机浏览器能显示图片，但无法通过 ImageBitmap 解码。
async function decodeImage(blob: Blob): Promise<{
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}> {
  let bitmapFailure = 'unavailable'
  if (typeof createImageBitmap === 'function') {
    try {
      // 默认使用图片自身方向，避免旧浏览器拒绝显式的 from-image 参数。
      trackDiagnostic('image', 'decode', {
        decoder: 'createImageBitmap',
        mimeType: blob.type,
        sizeBytes: blob.size
      })
      const bitmap = await createImageBitmap(blob)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close()
      }
    } catch (error) {
      bitmapFailure = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      // 使用与图片预览一致的加载路径重试。
    }
  }

  trackDiagnostic('image', 'decode-fallback', {
    decoder: 'HTMLImageElement',
    bitmapFailure,
    mimeType: blob.type,
    sizeBytes: blob.size
  })
  const url = URL.createObjectURL(blob)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () =>
        reject(
          new Error(
            `Image could not be decoded; img error event (no native reason); createImageBitmap=${bitmapFailure}; complete=${image.complete}; dimensions=${image.naturalWidth}x${image.naturalHeight}`
          )
        )
      image.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => {
        image.removeAttribute('src')
        URL.revokeObjectURL(url)
      }
    }
  } catch (error) {
    image.removeAttribute('src')
    URL.revokeObjectURL(url)
    throw imageDiagnosticError('decode:img-blob-url', blob, error)
  } finally {
    image.onload = null
    image.onerror = null
  }
}

export async function validateImageBlob(blob: Blob): Promise<void> {
  if (!blob.size) throw new Error('Image is empty')
  const bitmap = await decodeImage(blob)
  try {
    validateImageDimensions(bitmap.width, bitmap.height)
  } finally {
    bitmap.release()
  }
}
async function readImageBytes(file: File): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer()
  } catch {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result)
        else reject(new Error('Image file could not be read'))
      }
      reader.onerror = () => reject(reader.error ?? new Error('Image file could not be read'))
      reader.onabort = () => reject(new Error('Image file reading was aborted'))
      reader.readAsArrayBuffer(file)
    })
  }
}

async function convertImageToWebpInternal(
  file: File,
  options?: { maxEdge: number }
): Promise<Blob> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image is too large')
  if (!options && (imageExtension(file.name) === 'webp' || file.type === 'image/webp')) {
    let bytes: ArrayBuffer | undefined
    try {
      bytes = await readImageBytes(file)
    } catch {
      // 原文件字节无法读取时，尝试与其他格式一样解码并重新生成 WebP。
    }
    if (bytes) {
      const webp = new Blob([bytes], { type: 'image/webp' })
      await validateImageBlob(webp)
      return webp
    }
  }
  const bitmap = await decodeImage(file)
  try {
    validateImageDimensions(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    const scale = options ? Math.min(1, options.maxEdge / Math.max(bitmap.width, bitmap.height)) : 1
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    try {
      if (scale === 1) context.drawImage(bitmap.source, 0, 0)
      else context.drawImage(bitmap.source, 0, 0, canvas.width, canvas.height)
    } catch (error) {
      throw imageDiagnosticError('canvas:drawImage', file, error)
    }
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(
                imageDiagnosticError(
                  'canvas:toBlob',
                  file,
                  new Error('WebP conversion failed (null output)')
                )
              ),
        'image/webp',
        0.9
      )
    })
  } finally {
    bitmap.release()
  }
}

// 顶层补充文件上下文，同时保留解码、绘制、导出的阶段信息。
export async function convertImageToWebp(file: File, options?: { maxEdge: number }): Promise<Blob> {
  try {
    return await convertImageToWebpInternal(file, options)
  } catch (error) {
    throw imageDiagnosticError('save:convertImageToWebp', file, error)
  }
}
