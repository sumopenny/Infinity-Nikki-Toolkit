import { reportError } from '../errorReporting/errorReporter'
import { backupErrorState, BackupValidationError } from './repository'

export function reportDirectoryBackupError(error: unknown, action: string, backupModule?: string) {
  // Bound cause traversal even if an external error contains a cycle.
  let current = error
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    if (current instanceof BackupValidationError || backupErrorState(current) !== 'error') return
    current = (current as { cause?: unknown }).cause
  }
  reportError(error, {
    module: 'directory-backup',
    action,
    context: backupModule ? { backupModule } : {}
  })
}
