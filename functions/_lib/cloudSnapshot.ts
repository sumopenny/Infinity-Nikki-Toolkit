/** 两种存档共用的准备结果；准备函数不切换活跃指针，由调用方决定提交范围。 */
export type SnapshotStage =
  'validation' | 'receipt-read' | 'revision-read' | 'staging' | 'commit' | 'cleanup'
export type PreparedSnapshot =
  { kind: 'staged'; count: number; fingerprint: string } | { kind: 'replayed' }
