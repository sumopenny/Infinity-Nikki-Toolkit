export interface BackupLimits {
  bytes: number
  entries: number
  records: number
  manifest: number
  image: number
}

// 导出分包、类型识别与实际导入共用限制，避免生成的备份被自己的入口拒绝。
export const HOME_BACKUP_LIMITS: BackupLimits = {
  bytes: 128 * 1024 ** 2,
  entries: 500,
  records: 10000,
  manifest: 4 * 1024 ** 2,
  image: 64 * 1024 ** 2
}
export const OUTFIT_BACKUP_LIMITS: BackupLimits = {
  bytes: 512 * 1024 ** 2,
  entries: 2000,
  records: 10000,
  manifest: 4 * 1024 ** 2,
  image: 64 * 1024 ** 2
}
export const CAMERA_BACKUP_LIMITS: BackupLimits = {
  bytes: 1024 ** 3,
  entries: 10001,
  records: 10000,
  manifest: 20 * 1024 ** 2,
  image: 1024 ** 3
}
export const ALL_DATA_BACKUP_LIMITS: BackupLimits = {
  bytes: 2 * 1024 ** 3,
  entries: 10000,
  records: 10000,
  manifest: 4 * 1024 ** 2,
  image: 1024 ** 3
}
