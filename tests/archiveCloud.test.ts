import { compatibilityDate } from './fixtures/runtimeConfig'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { handleArchiveCloud } from '../functions/_lib/archiveCloud'
import { digest, type CloudDB } from '../functions/_lib/cloudShared'
import { archiveUpload } from './fixtures/archiveCloud'

let mf: Miniflare, db: CloudDB
const token = 'a'.repeat(64)
async function request(
  action: string,
  body?: unknown,
  database?: CloudDB,
  overrides: Record<string, string> = {},
  onFailure?: Parameters<typeof handleArchiveCloud>[2]
) {
  const req = new Request(`https://example.test/api/archive/cloud?action=${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: 'https://example.test',
      'Content-Type': 'application/json',
      'X-Resonance-Request': '1',
      'X-Resonance-Account': 'user-a',
      Cookie: `resonance_session=${token}`,
      ...overrides
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  if (database) return handleArchiveCloud(req, { RESONANCE_DB: database }, onFailure)
  const response = await mf.dispatchFetch(req.url, {
    method: req.method,
    headers: Object.fromEntries(req.headers),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: Object.fromEntries(response.headers)
  })
}
beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents:
        "import {handleArchiveCloud} from './functions/_lib/archiveCloud.ts'; export default {fetch:handleArchiveCloud}",
      resolveDir: process.cwd(),
      loader: 'ts'
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    metafile: true
  })
  expect(Object.keys(bundle.metafile!.inputs).join(' ')).not.toMatch(
    /wardrobeCatalog|file-system|data\/gongeo|\.vue|argon2/
  )
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate,
      d1Databases: ['RESONANCE_DB']
    })
  )
  const engine = await mf.getD1Database('RESONANCE_DB')
  db = engine as unknown as CloudDB
  for (const file of ['0001_cloud.sql', '0002_wardrobe_cloud.sql', '0003_archive_cloud.sql'])
    await engine.exec(
      (await readFile('migrations-resonance/' + file, 'utf8'))
        .replace(/--[^\n]*/g, '')
        .replace(/\s+/g, ' ')
    )
}, 30000)
beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM cloud_users'),
    db.prepare('DELETE FROM cloud_rate_limits')
  ])
  await db
    .prepare('INSERT INTO cloud_users(id,username,password_hash) VALUES(?,?,?)')
    .bind('user-a', 'nikki', 'existing')
    .run()
  await db
    .prepare('INSERT INTO cloud_sessions(token_hash,user_id,created_at) VALUES(?,?,?)')
    .bind(await digest(token), 'user-a', 1)
    .run()
})
afterAll(async () => {
  await mf?.dispose()
})
const head = async () => (await (await request('summary')).json()) as any
describe('unified archive cloud transactions', () => {
  it('reads empty legacy databases without creating saves and enforces account and origin', async () => {
    expect(await head()).toMatchObject({
      resonance: { revision: 0, count: 0, active_snapshot: null },
      wardrobe: { revision: 0, summary: null }
    })
    expect(
      (await request('upload', archiveUpload(), undefined, { Origin: 'https://other.test' })).status
    ).toBe(403)
    expect(
      (await request('summary', undefined, undefined, { 'X-Resonance-Account': 'other' })).status
    ).toBe(409)
    expect((await request('summary', undefined, undefined, { Cookie: '' })).status).toBe(401)
  })
  it('uploads both modules, downloads their complete snapshots and replays one receipt', async () => {
    const body = archiveUpload()
    expect(await (await request('upload', body)).json()).toEqual({
      revisions: { resonance: 1, wardrobe: 1 },
      replayed: false
    })
    expect(await (await request('upload', body)).json()).toEqual({
      revisions: { resonance: 1, wardrobe: 1 },
      replayed: true
    })
    expect(await (await request('snapshot')).json()).toMatchObject({
      resonance: { revision: 1, records: body.modules.resonance!.records },
      wardrobe: { revision: 1, data: body.modules.wardrobe!.data }
    })
    expect(await (await request('snapshot&modules=wardrobe')).json()).not.toHaveProperty(
      'resonance'
    )
  })
  it('supports one selected module without touching the other', async () => {
    const body = archiveUpload()
    delete body.modules.wardrobe
    expect((await request('upload', body)).status).toBe(200)
    expect(await head()).toMatchObject({
      resonance: { revision: 1, count: 1 },
      wardrobe: { revision: 0, active_snapshot: null }
    })
  })
  it('validates all payloads before staging and distinguishes a valid empty wardrobe', async () => {
    const body = archiveUpload()
    body.modules.wardrobe!.data!.imported = false
    body.modules.wardrobe!.data!.entries = {}
    expect((await request('upload', body)).status).toBe(400)
    expect(await head()).toMatchObject({ resonance: { revision: 0 }, wardrobe: { revision: 0 } })
    expect(await db.prepare('SELECT COUNT(*) AS count FROM cloud_snapshots').first()).toEqual({
      count: 0
    })
    body.modules.wardrobe!.data!.imported = true
    expect((await request('upload', body)).status).toBe(200)
    expect(await head()).toMatchObject({ wardrobe: { summary: { ownedCount: 0 } } })
  })
  it('leaves both saves unchanged when one preview version is stale', async () => {
    await request('upload', archiveUpload())
    const body = archiveUpload(1)
    body.modules.wardrobe!.revision = 0
    expect((await request('upload', body)).status).toBe(409)
    expect(await head()).toMatchObject({ resonance: { revision: 1 }, wardrobe: { revision: 1 } })
    expect(
      await db
        .prepare('SELECT COUNT(*) AS count FROM cloud_snapshots WHERE committed_revision IS NULL')
        .first()
    ).toEqual({ count: 0 })
  })
  it('rolls back both pointers and receipts if SQL fails within the commit batch', async () => {
    await request('upload', archiveUpload())
    const body = archiveUpload(1)
    let batches = 0
    const broken = {
      prepare: db.prepare.bind(db),
      async batch(statements: Parameters<CloudDB['batch']>[0]) {
        // 两份暂存各有一个记录 batch；第三批是联合指针提交。
        batches++
        if (batches === 3)
          return db.batch([
            ...statements,
            db.prepare(
              'INSERT INTO cloud_sessions(token_hash,user_id,created_at) VALUES(NULL,NULL,NULL)'
            )
          ])
        return db.batch(statements)
      }
    } as CloudDB
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await request('upload', body, broken)).status).toBe(500)
      expect(await head()).toMatchObject({ resonance: { revision: 1 }, wardrobe: { revision: 1 } })
      expect(
        await db
          .prepare('SELECT * FROM cloud_archive_requests WHERE id=?')
          .bind(body.requestId)
          .first()
      ).toBeNull()
      expect((await request('upload', body)).status).toBe(200)
    } finally {
      log.mockRestore()
    }
  })
  it('checks both versions again at the commit gate after staging', async () => {
    await request('upload', archiveUpload())
    let batches = 0
    const racing = {
      prepare: db.prepare.bind(db),
      async batch(statements: Parameters<CloudDB['batch']>[0]) {
        if (++batches === 3)
          await db
            .prepare('UPDATE cloud_wardrobe_state SET revision=revision+1 WHERE user_id=?')
            .bind('user-a')
            .run()
        return db.batch(statements)
      }
    } as CloudDB
    expect((await request('upload', archiveUpload(1), racing)).status).toBe(409)
    expect(
      await db.prepare('SELECT revision FROM cloud_users WHERE id=?').bind('user-a').first()
    ).toEqual({ revision: 1 })
  })
  it('rechecks the session at commit so revocation cannot partially update either module', async () => {
    await request('upload', archiveUpload())
    let batches = 0
    const revoked = {
      prepare: db.prepare.bind(db),
      async batch(statements: Parameters<CloudDB['batch']>[0]) {
        if (++batches === 3) await db.prepare('DELETE FROM cloud_sessions').run()
        return db.batch(statements)
      }
    } as CloudDB
    expect((await request('upload', archiveUpload(1), revoked)).status).toBe(409)
    expect(
      await db.prepare('SELECT revision FROM cloud_users WHERE id=?').bind('user-a').first()
    ).toEqual({ revision: 1 })
    expect(
      await db
        .prepare('SELECT revision FROM cloud_wardrobe_state WHERE user_id=?')
        .bind('user-a')
        .first()
    ).toEqual({ revision: 1 })
  })
  it('deletes selected cloud saves together and retains the account and session', async () => {
    await request('upload', archiveUpload())
    const body = {
      requestId: crypto.randomUUID(),
      modules: { resonance: { revision: 1 }, wardrobe: { revision: 1 } }
    }
    expect((await request('delete', body)).status).toBe(200)
    expect(await head()).toMatchObject({
      resonance: { revision: 2, active_snapshot: null, count: 0 },
      wardrobe: { revision: 2, active_snapshot: null, summary: null }
    })
    expect(await (await request('delete', body)).json()).toMatchObject({ replayed: true })
    expect(await db.prepare('SELECT COUNT(*) AS count FROM cloud_sessions').first()).toEqual({
      count: 1
    })
  })
  it('serializes competing uploads and rejects reusing a request for different data', async () => {
    const first = archiveUpload(),
      second = archiveUpload()
    expect(
      (await Promise.all([request('upload', first), request('upload', second)]))
        .map((r) => r.status)
        .sort()
    ).toEqual([200, 409])
    expect(await head()).toMatchObject({ resonance: { revision: 1 }, wardrobe: { revision: 1 } })
    const winning = await db
      .prepare('SELECT id FROM cloud_archive_requests')
      .first<{ id: string }>()
    const changed = archiveUpload()
    changed.requestId = winning!.id
    delete changed.modules.wardrobe
    expect((await request('upload', changed)).status).toBe(409)
  })
  it.each(['resonance', 'wardrobe'] as const)(
    'reports the module and staging phase for a %s preparation failure',
    async (module) => {
      const table = module === 'resonance' ? 'cloud_snapshots' : 'cloud_wardrobe_snapshots'
      const broken: CloudDB = {
        prepare(sql) {
          if (sql.includes('INSERT INTO ' + table)) throw new Error('database unavailable')
          return db.prepare(sql)
        },
        batch: db.batch.bind(db)
      }
      const onFailure = vi.fn()
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        expect((await request('upload', archiveUpload(), broken, {}, onFailure)).status).toBe(500)
        expect(onFailure).toHaveBeenCalledWith(expect.any(Error), {
          stage: 'staging',
          module,
          operation: 'upload'
        })
        expect(log).toHaveBeenCalledWith(
          'archive-cloud',
          expect.objectContaining({ stage: 'staging', module })
        )
        expect(await head()).toMatchObject({
          resonance: { revision: 0 },
          wardrobe: { revision: 0 }
        })
      } finally {
        log.mockRestore()
      }
    }
  )
})
