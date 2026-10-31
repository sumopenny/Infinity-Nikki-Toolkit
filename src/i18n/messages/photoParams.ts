import type { PhotoParamsStage } from '../../utils/photo-params/types'

type PhotoParamsImageField =
  | 'bloomIntensity'
  | 'bloomRange'
  | 'brightness'
  | 'exposure'
  | 'contrast'
  | 'saturation'
  | 'vibrance'
  | 'highlights'
  | 'shadows'

export interface PhotoParamsMessages {
  title: string
  eyebrow: string
  close: string
  copy: string
  copied: string
  copyFailed: string
  noValue: string
  capture: string
  camera: string
  image: string
  action: string
  light: string
  filter: string
  raw: string
  uidPrompt: string
  uidPlaceholder: string
  uidParse: string
  uidParsing: string
  uidRetryFailed: string
  uidMismatch: string
  upload: string
  uploadHint: string
  authorizationRequired: string
  nonOriginalPhotoHint: string
  originalFolderHint: string
  stages: Record<PhotoParamsStage, string>
  labels: {
    gameTime: string
    weather: string
    focalLength: string
    zoom: string
    aperture: string
    vignette: string
    imageFields: Record<PhotoParamsImageField, string>
  }
  errors: {
    descriptions: Record<string, string>
    unknownMeaning: string
    format: (code: string, meaning: string) => string
  }
}

export const photoParamsZh: PhotoParamsMessages = {
  title: '照片参数',
  eyebrow: 'PHOTO PARAMETERS',
  close: '关闭',
  copy: '复制参数',
  copied: '已复制',
  copyFailed: '复制失败',
  noValue: '无',
  capture: '环境',
  camera: '相机',
  image: '画面',
  action: '动作',
  light: '灯光',
  filter: '滤镜',
  raw: '相机参数',
  uidPrompt: '请输入拍摄此照片所用账号的 UID',
  uidPlaceholder: '填写账号 UID',
  uidParse: '解析',
  uidParsing: '解析中…',
  uidRetryFailed: '本次解析失败。',
  uidMismatch: '未能使用该 UID 解析照片，请确认填写的是拍摄这张照片的账号 UID。',
  upload: '上传图片解析',
  uploadHint: '选择本地游戏原图进行解析',
  authorizationRequired: '请先授权 X6Game 文件夹。',
  nonOriginalPhotoHint: '该照片可能不是游戏拍摄原图，请检查是否经过压缩、转发或其他处理。',
  originalFolderHint:
    '温馨提示：照片参数解析需使用游戏相册 HighQuality 文件夹中的原始照片。其他文件夹如 ScreenShot 文件夹中的图片不包含内置相机参数，无法解析。',
  stages: {
    idle: '',
    resolvingUid: '正在识别照片账号…',
    readingPhoto: '正在读取照片数据…',
    loadingWasm: '正在加载本地解析模块…',
    decryptingPhoto: '正在解密照片参数…',
    parsingCamera: '正在整理相机参数…',
    ready: '解析完成',
    error: '解析失败'
  },
  labels: {
    gameTime: '游戏时间',
    weather: '天气',
    focalLength: '焦距',
    zoom: '缩放',
    aperture: '光圈',
    vignette: '晕影',
    imageFields: {
      bloomIntensity: '柔光强度',
      bloomRange: '柔光范围',
      brightness: '亮度',
      exposure: '曝光',
      contrast: '对比度',
      saturation: '饱和度',
      vibrance: '自然饱和',
      highlights: '高光',
      shadows: '阴影'
    }
  },
  errors: {
    descriptions: {
      jpeg_tail_not_found: '未找到 JPEG 参数尾段',
      jpeg_second_end_marker_missing: '缺少第二个 JPEG 结束标记',
      base64_invalid: '照片尾部不是有效的 Base64 数据',
      photo_structure_invalid: '未找到有效 UID 账号',
      camera_params_missing: '照片中没有 CameraParams 参数',
      camera_base64_invalid: 'CameraParams 不是有效的 Base64 数据',
      camera_decrypt_failed: 'CameraParams 解密失败',
      camera_params_invalid_length: 'CameraParams 数组长度不是支持的 31、32、40 或 44 项',
      camera_params_encode_failed: 'CameraParams 原始数组不存在或格式无效',
      photo_parse_failed: '照片参数解析失败'
    },
    unknownMeaning: '未知解析错误',
    format: (code, meaning) => `错误码：${code}；含义：${meaning}`
  }
}

export const photoParamsEn: PhotoParamsMessages = {
  title: 'Photo parameters',
  eyebrow: 'PHOTO PARAMETERS',
  close: 'Close',
  copy: 'Copy parameters',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  noValue: 'None',
  capture: 'Environment',
  camera: 'Camera',
  image: 'Image',
  action: 'Action',
  light: 'Light',
  filter: 'Filter',
  raw: 'Camera parameters',
  uidPrompt: 'Enter the UID used to take this photo',
  uidPlaceholder: 'Enter account UID',
  uidParse: 'Parse',
  uidParsing: 'Parsing…',
  uidRetryFailed: 'This parsing attempt failed.',
  uidMismatch:
    'Unable to parse the photo with this UID. Check that it belongs to the account that took this photo.',
  upload: 'Parse local image',
  uploadHint: 'Choose an original game photo from this device',
  authorizationRequired: 'Authorize the X6Game folder first.',
  nonOriginalPhotoHint:
    'This may not be an original in-game photo. Check whether it has been compressed, forwarded, or otherwise modified.',
  originalFolderHint:
    'Tip: Photo parameter parsing requires original photos from the game album’s HighQuality folder. Images from other folders, such as ScreenShot, do not contain embedded camera parameters and cannot be parsed.',
  stages: {
    idle: '',
    resolvingUid: 'Resolving photo account...',
    readingPhoto: 'Reading photo data...',
    loadingWasm: 'Loading local parser...',
    decryptingPhoto: 'Decrypting photo parameters...',
    parsingCamera: 'Preparing camera parameters...',
    ready: 'Parsed',
    error: 'Parsing failed'
  },
  labels: {
    gameTime: 'Game time',
    weather: 'Weather',
    focalLength: 'Focal length',
    zoom: 'Zoom',
    aperture: 'Aperture',
    vignette: 'Vignette',
    imageFields: {
      bloomIntensity: 'Bloom',
      bloomRange: 'Bloom range',
      brightness: 'Brightness',
      exposure: 'Exposure',
      contrast: 'Contrast',
      saturation: 'Saturation',
      vibrance: 'Vibrance',
      highlights: 'Highlights',
      shadows: 'Shadows'
    }
  },
  errors: {
    descriptions: {
      jpeg_tail_not_found: 'The JPEG parameter tail was not found',
      jpeg_second_end_marker_missing: 'The second JPEG end marker is missing',
      base64_invalid: 'The photo tail is not valid Base64 data',
      photo_structure_invalid: 'No valid UID account found',
      camera_params_missing: 'The photo does not contain CameraParams',
      camera_base64_invalid: 'CameraParams is not valid Base64 data',
      camera_decrypt_failed: 'CameraParams decryption failed',
      camera_params_invalid_length:
        'The CameraParams array length is not a supported 31, 32, 40, or 44 items',
      camera_params_encode_failed: 'The raw CameraParams array is missing or invalid',
      photo_parse_failed: 'The photo parameters could not be parsed'
    },
    unknownMeaning: 'Unknown parsing error',
    format: (code, meaning) => `Error code: ${code}; Meaning: ${meaning}`
  }
}
