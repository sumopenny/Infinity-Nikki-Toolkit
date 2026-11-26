import { reactive } from 'vue'

export interface ProfileAvatar {
  image: string
  frameId: string
  zoom: number
  x: number
  y: number
}

const avatars = reactive(new Map<string, ProfileAvatar | null>())
const key = (uid: string) => `nikki-profile-avatar:${uid}`

export function useProfileAvatar() {
  function load(uid: string) {
    if (avatars.has(uid)) return
    let value: ProfileAvatar | null = null
    try {
      const saved = JSON.parse(localStorage.getItem(key(uid)) ?? 'null')
      if (
        saved &&
        typeof saved.image === 'string' &&
        saved.image.startsWith('data:image/png;base64,') &&
        typeof saved.frameId === 'string' &&
        Number.isFinite(saved.zoom) &&
        saved.zoom >= 1 &&
        saved.zoom <= 4 &&
        Number.isFinite(saved.x) &&
        Number.isFinite(saved.y)
      )
        value = saved
    } catch {
      // 损坏或不可读的偏好不影响原始头像显示。
    }
    avatars.set(uid, value)
  }

  function save(uid: string, value: ProfileAvatar) {
    // 写入成功后再更新界面；空间不足等错误由编辑器显示并允许重试。
    localStorage.setItem(key(uid), JSON.stringify(value))
    avatars.set(uid, value)
  }

  return { avatars, load, save }
}
