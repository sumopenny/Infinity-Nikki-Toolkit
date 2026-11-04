import 'fake-indexeddb/auto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import {
  OUTFITS_STORE,
  OUTFIT_IMAGES_STORE,
  runStoreRequest
} from '../../src/utils/file-system/database'
import { databaseRequest, runDatabaseTransaction } from '../../src/utils/file-system/transaction'
import { loadConfig, saveConfig } from '../../src/utils/directory-backup/engine'
import { previewRestore, restoreSelected } from '../../src/utils/directory-backup/restore'
import { digest } from '../../src/utils/directory-backup/disk'
import { NativeDirectory, NativeDisk, nativeHandle } from '../helpers/directoryBackupNativeFs'
import { resetDatabase, outfit, sync } from '../helpers/directoryBackupFs'

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data])
  let c = 0xffffffff
  for (const value of body) c = crcTable[(c ^ value) & 255] ^ (c >>> 8)
  const head = Buffer.alloc(4),
    tail = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  tail.writeUInt32BE((c ^ 0xffffffff) >>> 0)
  return Buffer.concat([head, body, tail])
}
/** 确定性生成真实可解码 PNG，不用伪装成图片的随机字节充数。 */
function largePng(seed: number) {
  const width = 1024,
    height = 1024,
    raw = Buffer.alloc((width * 3 + 1) * height)
  let state = seed
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width * 3; x++) {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      raw[y * (width * 3 + 1) + 1 + x] = state & 255
    }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return new Blob(
    [
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 1 })),
        chunk('IEND', Buffer.alloc(0))
      ])
    ],
    { type: 'image/png' }
  )
}
const enabled = process.env.RUN_BACKUP_LARGE === '1'
describe.runIf(enabled)('Windows 实际文件系统 · 10000 条记录 + 大图片', () => {
  it('真实读写、增量范围与完整恢复性能记录', async () => {
    await resetDatabase()
    const root = await fs.mkdtemp(path.resolve('.temp/backup-native-'))
    const disk = new NativeDisk(root),
      directory = new NativeDirectory(disk)
    const config = await loadConfig()
    config.handle = nativeHandle(directory)
    config.directoryName = directory.name
    config.enabled.outfits = true
    await saveConfig(config)
    const image = largePng(1945),
      sha256 = await digest(await image.arrayBuffer())
    const report: any = {
      date: new Date().toISOString(),
      environment: {
        platform: process.platform,
        node: process.version,
        filesystem: 'Windows native fs adapter',
        database: 'fake-indexeddb (not browser IndexedDB)',
        root
      },
      dataset: {
        records: 10000,
        images: 24,
        width: 1024,
        height: 1024,
        imageBytes: image.size,
        totalImageBytes: image.size * 24
      },
      phases: {}
    }
    let peakRss = process.memoryUsage().rss,
      peakHeap = process.memoryUsage().heapUsed
    const sample = setInterval(() => {
      const m = process.memoryUsage()
      peakRss = Math.max(peakRss, m.rss)
      peakHeap = Math.max(peakHeap, m.heapUsed)
    }, 20)
    const measure = async (name: string, action: () => Promise<void>) => {
      disk.events = []
      const start = performance.now(),
        r = disk.reads,
        w = disk.writes,
        rb = disk.readBytes,
        wb = disk.writtenBytes
      await action()
      const eventSummary = {
        imageReads: disk.events.filter((e) => e.kind === 'read' && e.path.includes('/图片/'))
          .length,
        imageWrites: disk.events.filter((e) => e.kind === 'written' && e.path.includes('/图片/'))
          .length,
        recordWrites: disk.events.filter(
          (e) => e.kind === 'written' && e.path.includes('/当前记录/')
        ).length,
        enumerations: disk.events.filter((e) => e.kind === 'enumerate').map((e) => e.path)
      }
      report.phases[name] = {
        milliseconds: Math.round(performance.now() - start),
        reads: disk.reads - r,
        writes: disk.writes - w,
        readBytes: disk.readBytes - rb,
        writtenBytes: disk.writtenBytes - wb,
        ...eventSummary
      }
      if (name === 'initial' || name === 'restore') delete report.phases[name].enumerations
      await fs.writeFile('.temp/backup-native-results.json', JSON.stringify(report, null, 2))
      console.log(name, report.phases[name].milliseconds + 'ms')
    }
    try {
      await measure('seed', async () => {
        for (let start = 0; start < 10000; start += 200)
          await runDatabaseTransaction(
            [OUTFITS_STORE, OUTFIT_IMAGES_STORE],
            'readwrite',
            async (tx) => {
              for (let i = start; i < Math.min(start + 200, 10000); i++) {
                const id = `N${String(i).padStart(5, '0')}`
                tx.objectStore(OUTFITS_STORE).put(outfit(id, '', i < 24 ? image : undefined))
                if (i < 24)
                  tx.objectStore(OUTFIT_IMAGES_STORE).put({
                    id,
                    blob: image,
                    size: image.size,
                    sha256,
                    extension: 'png'
                  })
              }
            }
          )
      })
      await measure('initial', async () => {
        const result = await sync(config)
        expect(result.error).toBeUndefined()
        expect(result.count).toBe(10000)
        expect(result.state).toBe('synced')
      })
      await measure('rename', async () => {
        const spy = vi.spyOn(IDBObjectStore.prototype, 'get')
        await runDatabaseTransaction([OUTFITS_STORE], 'readwrite', async (tx) => {
          const store = tx.objectStore(OUTFITS_STORE),
            value = await databaseRequest(store.get('N00000'))
          store.put({ ...value, note: '改名测试' })
        })
        expect((await sync(config)).state).toBe('synced')
        const imageReads = spy.mock.instances.filter(
          (store) => (store as unknown as IDBObjectStore).name === OUTFIT_IMAGES_STORE
        ).length
        spy.mockRestore()
        expect(imageReads).toBe(0)
        report.renameDatabaseImageReads = imageReads
      })
      expect(report.phases.rename.imageReads).toBe(0)
      expect(report.phases.rename.imageWrites).toBe(0)
      expect(report.phases.rename.recordWrites).toBe(1)
      await measure('replaceImage', async () => {
        const image2 = largePng(1946),
          sha2 = await digest(await image2.arrayBuffer())
        await runDatabaseTransaction(
          [OUTFITS_STORE, OUTFIT_IMAGES_STORE],
          'readwrite',
          async (tx) => {
            const store = tx.objectStore(OUTFITS_STORE),
              value = await databaseRequest(store.get('N00000'))
            store.put({ ...value, imageSize: image2.size })
            tx.objectStore(OUTFIT_IMAGES_STORE).put({
              id: 'N00000',
              blob: image2,
              size: image2.size,
              sha256: sha2,
              extension: 'png'
            })
          }
        )
        expect((await sync(config)).state).toBe('synced')
      })
      await measure('delete', async () => {
        await runDatabaseTransaction(
          [OUTFITS_STORE, OUTFIT_IMAGES_STORE],
          'readwrite',
          async (tx) => {
            tx.objectStore(OUTFITS_STORE).delete('N00000')
            tx.objectStore(OUTFIT_IMAGES_STORE).delete('N00000')
          }
        )
        expect((await sync(config)).count).toBe(9999)
      })
      await runDatabaseTransaction(
        [OUTFITS_STORE, OUTFIT_IMAGES_STORE],
        'readwrite',
        async (tx) => {
          tx.objectStore(OUTFITS_STORE).clear()
          tx.objectStore(OUTFIT_IMAGES_STORE).clear()
        }
      )
      let preview: Awaited<ReturnType<typeof previewRestore>>
      await measure('preview', async () => {
        preview = await previewRestore(nativeHandle(directory))
        expect(preview.modules[0].ready).toBe(true)
      })
      await measure('restore', async () => {
        await restoreSelected(nativeHandle(directory), preview!, ['outfits'], (text) => {
          if (text.includes('正在提交')) {
            report.finalCommitStartedAt = performance.now()
            console.log('final atomic transaction started')
          }
        })
        if (report.finalCommitStartedAt) {
          report.finalCommitMs = Math.round(performance.now() - report.finalCommitStartedAt)
          delete report.finalCommitStartedAt
        }
        expect(await runStoreRequest(OUTFITS_STORE, 'readonly', (s) => s.count())).toBe(9999)
        expect(await runStoreRequest(OUTFIT_IMAGES_STORE, 'readonly', (s) => s.count())).toBe(23)
      })
      report.result = 'passed'
      report.peakRssBytes = peakRss
      report.peakHeapBytes = peakHeap
      report.peakTemporaryPayloadBytes = disk.peakTemporaryBytes
      report.peakTotalDiskBytes = disk.peakTotalBytes
      report.finalDiskBytes = disk.totalBytes
      report.remainingTemporaryPayloadBytes = disk.temporaryBytes
      report.memoryNote =
        '包括 Node、Vitest、fake-indexeddb 与测试适配器；不是浏览器进程峰值。文件系统底层原子替换临时文件不包含在应用暂存统计中。'
      report.browserFinalCommitBenchmark = 'not measured in this harness'
      expect(disk.temporaryBytes).toBe(0)
    } finally {
      clearInterval(sample)
      await fs.writeFile('.temp/backup-native-results.json', JSON.stringify(report, null, 2))
    }
  }, 1200000)
})
