import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import * as diagnostics from '../../../src/utils/errorReporting/errorReporter'
import type { ErrorEventPayload } from '../../../src/utils/errorReporting/schema'
import { sampleEvent } from './fixture'
import { reportDirectoryBackupError } from '../../../src/utils/directory-backup/diagnostics'
import {
  BackupStateError,
  BackupValidationError
} from '../../../src/utils/directory-backup/repository'
import { permanentlyDeleteRecentlyDeleted } from '../../../src/utils/file-system/trashFileSystem'
import type { RecentlyDeletedPhoto } from '../../../src/utils/photoGrouping'
import { useOperationNotice } from '../../../src/composables/useOperationNotice'
import { messages } from '../../../src/i18n'

let payloads: ErrorEventPayload[]
let reporter: ReturnType<typeof diagnostics.createErrorReporter>
beforeEach(() => {
  payloads = []
  reporter = diagnostics.createErrorReporter({
    enabled: true,
    build: sampleEvent().build,
    environment: () => ({ device: {}, runtime: {}, network: {}, storage: {} }),
    transport: vi.fn(async (_url, init) => {
      const event = JSON.parse(String(init?.body))
      payloads.push(event)
      return Response.json({ accepted: true, eventId: event.eventId })
    }) as typeof fetch
  })
  vi.spyOn(diagnostics, 'reportError').mockImplementation(reporter.report)
})
afterEach(() => vi.restoreAllMocks())

it('reports transaction aborts while leaving picker cancellation silent', async () => {
  const notice = useOperationNotice(computed(() => messages.en))
  const cancelled = new DOMException('Picker cancelled', 'AbortError')
  const aborted = diagnostics.annotateDiagnosticError(
    new DOMException('Transaction aborted', 'AbortError'),
    { stage: 'indexeddb-transaction', context: { stores: ['camera-params'], mode: 'readwrite' } }
  )
  expect(notice.createErrorStatus(cancelled, { type: 'readFailed' })).toMatchObject({
    tone: 'info'
  })
  expect(notice.createErrorStatus(aborted, { type: 'readFailed' })).toMatchObject({ tone: 'error' })
  await reporter.flush()
  expect(payloads).toHaveLength(1)
  expect(payloads[0]).toMatchObject({
    stage: 'indexeddb-transaction',
    error: { name: 'AbortError' }
  })
})

it('reports a database version failure before presenting the upgrade notice', async () => {
  const notice = useOperationNotice(computed(() => messages.en))
  const result = notice.createErrorStatus(new DOMException('Version is too low', 'VersionError'), {
    type: 'readFailed'
  })
  expect(result).toMatchObject({ source: 'database-version' })
  await reporter.flush()
  expect(payloads).toHaveLength(1)
})

it('keeps backup permission, protection, wrong-folder and picker states local', async () => {
  for (const error of [
    new BackupStateError('permission', 'permission required'),
    new BackupStateError('protected', 'empty browser'),
    new DOMException('Permission required', 'NotAllowedError'),
    new DOMException('Cancelled', 'AbortError'),
    new BackupValidationError('没有找到暖立方备份目录'),
    new BackupValidationError('目录在预览后已变化，请重新预览')
  ])
    reportDirectoryBackupError(error, 'preview-restore')
  await reporter.flush()
  expect(payloads).toEqual([])
})

it('retains wrapped restore causes and deduplicates the same failure across boundaries', async () => {
  const cause = diagnostics.annotateDiagnosticError(
    new DOMException('Storage full', 'QuotaExceededError'),
    {
      stage: 'indexeddb-transaction'
    }
  )
  const error = new Error('Restore failed', { cause })
  reportDirectoryBackupError(error, 'restore', 'camera')
  reportDirectoryBackupError(error, 'refresh-status')
  await reporter.flush()
  expect(payloads).toHaveLength(1)
  expect(payloads[0]).toMatchObject({
    module: 'directory-backup',
    action: 'restore',
    stage: 'indexeddb-transaction',
    context: { backupModule: 'camera' },
    error: { causes: [{ name: 'QuotaExceededError', message: 'Storage full' }] }
  })
})

it('reports a failing delete batch once with the original cause and aggregate counts', async () => {
  let index = 0
  const directoryHandle = {
    removeEntry: vi.fn(async () => {
      index++
      throw new DOMException('Delete failed ' + index, 'NoModificationAllowedError')
    })
  }
  const photos = Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    originalName: 'private-' + i + '.jpg',
    trashName: 'trash-' + i,
    directoryHandle
  })) as unknown as RecentlyDeletedPhoto[]
  const result = await permanentlyDeleteRecentlyDeleted(photos)
  await reporter.flush()
  expect(result.failedNames).toHaveLength(5)
  expect(payloads).toHaveLength(1)
  expect(payloads[0]).toMatchObject({
    module: 'album-trash',
    action: 'delete',
    error: { name: 'NoModificationAllowedError' },
    context: { failedCount: 5, succeededCount: 0 }
  })
  expect(JSON.stringify(payloads)).not.toContain('private-')
})

it('filters typed backup validation through nested causes without relying on the message', async () => {
  const expected = new BackupValidationError('New translated wording')
  reportDirectoryBackupError(
    new Error('outer', { cause: new Error('inner', { cause: expected }) }),
    'restore'
  )
  reportDirectoryBackupError(new Error('没有找到暖立方备份目录'), 'restore')
  await reporter.flush()
  expect(payloads).toHaveLength(1)
  expect(payloads[0].error.name).toBe('Error')
})
