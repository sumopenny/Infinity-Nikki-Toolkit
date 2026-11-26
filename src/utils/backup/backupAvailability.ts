import {
  runStoreRequest,
  OUTFITS_STORE,
  OUTFIT_TAGS_STORE,
  OUTFIT_IGNORED_CODES_STORE,
  HOME_SCHEMES_STORE,
  HOME_TAGS_STORE,
  CAMERA_PARAMS_STORE,
  CAMERA_TAGS_STORE
} from '../file-system/database'
import { hasWardrobeSnapshot, validateWardrobe } from '../wardrobe/wardrobeSchema'
import { loadResonanceRecords } from '../resonance/resonanceStorage'

/** 仅检查本地数据存在性，不加载 ZIP 编解码和各模块导入导出实现。 */
export async function hasAllBackupData(): Promise<boolean> {
  const counts = await Promise.all(
    [OUTFITS_STORE, HOME_SCHEMES_STORE, CAMERA_PARAMS_STORE, OUTFIT_IGNORED_CODES_STORE].map(
      (name) => runStoreRequest(name, 'readonly', (store) => store.count())
    )
  )
  if (counts.some(Boolean)) return true
  const tags = await Promise.all([
    runStoreRequest(OUTFIT_TAGS_STORE, 'readonly', (store) => store.get('default')),
    runStoreRequest(HOME_TAGS_STORE, 'readonly', (store) => store.get('default')),
    runStoreRequest(CAMERA_TAGS_STORE, 'readonly', (store) => store.get('order'))
  ])
  return (
    tags.some((value) => Array.isArray(value) && value.length > 0) ||
    (await loadResonanceRecords()).length > 0 ||
    (await hasWardrobeBackupData())
  )
}

async function hasWardrobeBackupData(): Promise<boolean> {
  // 存在性检查只读原始快照；不触发 loadWardrobe 的图鉴下载和旧数据迁移。
  const value = await runStoreRequest('wardrobe', 'readonly', (store) => store.get('current'))
  return value !== undefined && hasWardrobeSnapshot(validateWardrobe(value))
}
