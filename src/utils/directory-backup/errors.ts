export class BackupStateError extends Error {
  constructor(
    public readonly state: 'protected' | 'permission',
    message: string
  ) {
    super(message)
    this.name = 'BackupStateError'
  }
}
export function backupErrorState(error: unknown): 'protected' | 'permission' | 'error' {
  if (error instanceof BackupStateError) return error.state
  const name = (error as DOMException | null)?.name
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'permission' : 'error'
}
