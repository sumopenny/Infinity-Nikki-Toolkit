import { runStoreRequest } from './file-system/database'

const store = 'album-handles'
const key = 'home-wallpaper-custom'

// 独立外观设置，不参与业务备份或解析缓存清理；完整站点重置会清除。
export function readCustomWallpaper(): Promise<Blob | undefined> {
  return runStoreRequest(store, 'readonly', (items) => items.get(key))
}

export async function writeCustomWallpaper(blob: Blob): Promise<void> {
  await runStoreRequest(store, 'readwrite', (items) => items.put(blob, key))
}
