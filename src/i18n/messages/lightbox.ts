// 大图预览文案：前后切换、缩放、收藏、删除、恢复和备注编辑等操作文字。
import type { LocaleMessages } from '../types'

export const lightboxZh: LocaleMessages['lightbox'] = {
  rotateSource: '顺时针旋转 90° 并保存原图',
  rotating: '正在旋转并保存…',
  rotateSaved: '已旋转并保存',
  rotateFailed: '旋转保存失败，请重试。',
  rotateUnsupported: '此图片暂不支持安全旋转。原文件支持静态 JPG、PNG，本地封面还支持 WebP。',
  rotateConflict: '图片已发生变化，请刷新后重试。',
  rotatePermission: '请允许修改相册文件后重试。',
  rotateRefreshFailed: '图片已保存，预览刷新失败，请重新打开。',
  previousAria: '查看上一张图片',
  nextAria: '查看下一张图片',
  closeAria: '关闭预览',
  deleteCurrent: '移到最近删除',
  restoreCurrent: '恢复此图片',
  permanentlyDeleteCurrent: '永久删除',
  favorite: '收藏当前图片',
  removeFavorite: '取消收藏当前图片',
  zoomIn: '放大图片',
  dragToolbar: '按住拖动工具栏，松手贴顶或贴底；也可用上下方向键移动',
  zoomOut: '缩小图片',
  resetZoom: '恢复 100% 缩放',
  editNote: '编辑备注',
  noteLabel: '备注',
  parsePhoto: '解析照片参数'
}
export const lightboxEn: LocaleMessages['lightbox'] = {
  rotateSource: 'Rotate 90° clockwise and save source',
  rotating: 'Rotating and saving…',
  rotateSaved: 'Rotated and saved',
  rotateFailed: 'Could not save rotation. Please try again.',
  rotateUnsupported:
    'Cannot safely rotate this image. Source files support static JPG/PNG; stored covers also support WebP.',
  rotateConflict: 'The image has changed. Refresh and try again.',
  rotatePermission: 'Allow access to modify album files and try again.',
  rotateRefreshFailed: 'Image saved, but preview refresh failed. Please reopen it.',
  previousAria: 'View previous photo',
  nextAria: 'View next photo',
  closeAria: 'Close preview',
  deleteCurrent: 'Move to Recently deleted',
  restoreCurrent: 'Restore this photo',
  permanentlyDeleteCurrent: 'Delete permanently',
  favorite: 'Favorite current photo',
  removeFavorite: 'Remove current photo from favorites',
  zoomIn: 'Zoom in',
  dragToolbar: 'Drag to dock at the top or bottom, or use the up/down arrow keys',
  zoomOut: 'Zoom out',
  resetZoom: 'Reset zoom to 100%',
  editNote: 'Edit note',
  noteLabel: 'Note',
  parsePhoto: 'Parse photo parameters'
}
