import { loadResonanceCatalog } from './resonanceCatalog'
import { annotateDiagnosticError } from '../errorReporting/errorReporter'
import {
  pearpalObject,
  pearpalResponseShape,
  pearpalDiagnosticFailure,
  readPearpalJSON
} from './pearpalDiagnostics'
import { diagnosticFetch } from '../errorReporting/diagnosticFetch'
import { throwIfSignalAborted } from '../abortSignal'
// 奇想手账按所选区服验证角色；凭据只随当前请求发送，不进入持久化层。
import { uncompress } from 'snappyjs'
import type { ResonanceRecord } from './resonanceTypes'
import { PEARPAL_REGIONS, type PearpalRegion } from './pearpalRegions'

// 手账响应先解压 snappy，再按 JSON 解码。
export function decodePearpal(buffer: ArrayBuffer): unknown {
  const decoded = uncompress(new Uint8Array(buffer))
  return JSON.parse(new TextDecoder().decode(decoded)) as unknown
}

export interface ResonanceCredentials {
  token: string
  roleid: string
  id: string
}

export interface ResonanceImportProgress {
  current: number
  total: number
  bannerName: { zh: string; en: string }
}

export interface ResonanceImportResult {
  records: ResonanceRecord[]
  skippedPools: number
}

export const PEARPAL_UID_MISMATCH = 'Pearpal UID mismatch'
export const PEARPAL_REGION_MISMATCH = 'Pearpal region mismatch'
export const PEARPAL_AUTH_FAILED = 'Pearpal credentials could not be verified'
export const PEARPAL_NO_RECORDS = 'No supported banner pull records were found'

async function postPearpal(
  action: 'verify' | 'snapshot',
  credentials: ResonanceCredentials,
  region: PearpalRegion,
  signal?: AbortSignal
): Promise<Response> {
  let response: Response
  try {
    const config = PEARPAL_REGIONS[region]
    const path =
      action === 'verify' ? '/v1/strategy/user/info/get' : '/v1/strategy/user/note/book/info'
    response = await diagnosticFetch(new URL(path, config.api), {
      method: 'POST',
      signal,
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        token: credentials.token,
        openid: credentials.id
      })
    })
  } catch (error) {
    throw annotateDiagnosticError(error, {
      code: 'PEARPAL_NETWORK_FAILED',
      stage: action,
      type: 'network',
      context: { region, upstreamAction: action }
    })
  }
  if (!response.ok) {
    throw pearpalDiagnosticFailure(
      `Pearpal request failed (${response.status})`,
      'PEARPAL_HTTP_ERROR',
      action,
      region,
      response,
      {},
      'error'
    )
  }
  return response
}

/** Retain existing user-facing messages, but distinguish the actual verification failure for diagnostics. */
async function verifyPearpalUid(
  credentials: ResonanceCredentials,
  region: PearpalRegion,
  signal?: AbortSignal
): Promise<void> {
  const response = await postPearpal('verify', credentials, region, signal)
  const raw = await readPearpalJSON(response, 'verify', region, PEARPAL_AUTH_FAILED)
  const payload = pearpalObject(raw)
  const shape = pearpalResponseShape(raw)
  function fail(
    code: string,
    message = PEARPAL_AUTH_FAILED,
    severity: 'warning' | 'error' = 'warning'
  ): never {
    throw pearpalDiagnosticFailure(
      message,
      code,
      'verify',
      region,
      response,
      { ...shape, expectedZoneId: PEARPAL_REGIONS[region].zoneId },
      severity
    )
  }
  if (!payload || typeof payload.code !== 'number')
    fail('PEARPAL_RESPONSE_INVALID', PEARPAL_AUTH_FAILED, 'error')
  if (payload.code !== 0)
    fail(payload.code === 1801 ? 'PEARPAL_SESSION_EXPIRED' : 'PEARPAL_RESPONSE_CODE_INVALID')
  const role = pearpalObject(pearpalObject(payload.data)?.role)
  if (!role) fail('PEARPAL_ROLE_MISSING')
  if (role.uid === undefined || role.uid === null || role.uid === '') fail('PEARPAL_UID_MISSING')
  if (typeof role.uid !== 'string' && typeof role.uid !== 'number')
    fail('PEARPAL_RESPONSE_INVALID', PEARPAL_AUTH_FAILED, 'error')
  if (String(role.uid) !== credentials.roleid.trim())
    fail('PEARPAL_UID_MISMATCH', PEARPAL_UID_MISMATCH)
  // Keep compatibility with the legacy CN endpoint without a zone field.
  if (role.zone_id === undefined && region === 'cn') return
  if (Number(role.zone_id) !== PEARPAL_REGIONS[region].zoneId)
    fail('PEARPAL_REGION_MISMATCH', PEARPAL_REGION_MISMATCH)
}

interface PearpalRow {
  card_pool_id?: number | string
  pool_cnt?: number | string
  result?: number | string
  rarity?: number | string
  times_from_last_five_stars?: number | string
  times_from_last_four_stars?: number | string
}

function asGachaRows(value: unknown): PearpalRow[] {
  if (Array.isArray(value))
    return value.filter((row): row is PearpalRow => Boolean(row) && typeof row === 'object')
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((rows) =>
      Array.isArray(rows)
        ? rows.filter((row): row is PearpalRow => Boolean(row) && typeof row === 'object')
        : []
    )
  }
  return []
}

function toPullRow(row: PearpalRow) {
  return {
    itemId: String(row.result ?? ''),
    obtainedAt: '',
    poolCount: Number(row.pool_cnt),
    pullsToObtain:
      Number(row.rarity) === 5
        ? Number(row.times_from_last_five_stars ?? 0) + 1
        : Number(row.times_from_last_four_stars ?? 0) + 1
  }
}

/** 先核对所选区服的角色 UID，再解压完整手账快照，供共鸣与衣橱各自解析。 */
export async function fetchPearpalSnapshot(
  credentials: ResonanceCredentials,
  signal?: AbortSignal,
  region: PearpalRegion = 'cn'
): Promise<unknown> {
  throwIfSignalAborted(signal)
  await verifyPearpalUid(credentials, region, signal)
  throwIfSignalAborted(signal)
  const response = await postPearpal('snapshot', credentials, region, signal)
  // 登录失效时快照返回 JSON 而非 Snappy，先识别登录错误，避免显示解压异常。
  if (response.headers.get('content-type')?.includes('application/json')) {
    const raw = await readPearpalJSON(response.clone(), 'snapshot', region, PEARPAL_AUTH_FAILED)
    const payload = pearpalObject(raw)
    if (!payload || typeof payload.code !== 'number')
      throw pearpalDiagnosticFailure(
        PEARPAL_AUTH_FAILED,
        'PEARPAL_RESPONSE_INVALID',
        'snapshot',
        region,
        response,
        pearpalResponseShape(raw),
        'error'
      )
    if (payload.code !== 0)
      throw pearpalDiagnosticFailure(
        PEARPAL_AUTH_FAILED,
        payload.code === 1801 ? 'PEARPAL_SESSION_EXPIRED' : 'PEARPAL_RESPONSE_CODE_INVALID',
        'snapshot',
        region,
        response,
        pearpalResponseShape(raw)
      )
  }
  const context = {
    region,
    httpStatus: response.status,
    requestId: response.headers.get('X-Request-Id')
  }
  const bytes = await response.arrayBuffer().catch((error) => {
    throw annotateDiagnosticError(error, {
      code: 'PEARPAL_NETWORK_FAILED',
      stage: 'snapshot-read',
      type: 'network',
      context
    })
  })
  let decoded: unknown
  try {
    decoded = decodePearpal(bytes)
  } catch (error) {
    // JSON 解析异常可能含正文片段；只保留错误类别，不保留原异常或 cause。
    throw annotateDiagnosticError(new Error('Pearpal notebook could not be decoded'), {
      code: 'PEARPAL_NOTEBOOK_DECODE_FAILED',
      stage: 'snapshot-decode',
      severity: 'error',
      context: {
        parseErrorName: error instanceof Error ? error.name : 'unknown',
        ...context
      }
    })
  }
  throwIfSignalAborted(signal)
  return decoded
}

/** 从已获取的完整手账解析共鸣，与衣橱共享一次网络请求。 */
export async function parsePearpalResonance(
  decoded: { info_from_self?: { gacha_list?: unknown } },
  onProgress?: (value: ResonanceImportProgress) => void,
  signal?: AbortSignal
): Promise<ResonanceImportResult> {
  throwIfSignalAborted(signal)
  const gachaList = asGachaRows(decoded?.info_from_self?.gacha_list)
  if (!gachaList.length) throw new Error(PEARPAL_NO_RECORDS)

  const byBanner = new Map<string, PearpalRow[]>()
  for (const row of gachaList) {
    const bannerId = String(row.card_pool_id ?? '')
    const poolCount = Number(row.pool_cnt)
    if (!/^\d+$/.test(bannerId) || !Number.isFinite(poolCount) || poolCount < 0) continue
    const list = byBanner.get(bannerId) ?? []
    list.push(row)
    byBanner.set(bannerId, list)
  }

  const { loadResonanceBanners, normalizeBannerPulls, buildResonanceRecords } =
    await loadResonanceCatalog()
  throwIfSignalAborted(signal)
  const banners = loadResonanceBanners()
  const targets = banners.filter((banner) => byBanner.has(banner.bannerId))
  const records: ResonanceRecord[] = []
  let skippedPools = 0
  targets.forEach((banner, index) => {
    onProgress?.({ current: index + 1, total: targets.length, bannerName: banner.name })
    try {
      // pool_cnt 越小越早；归一化器接收最新记录优先的顺序。
      const rows = [...(byBanner.get(banner.bannerId) ?? [])].sort(
        (a, b) => Number(b.pool_cnt) - Number(a.pool_cnt)
      )
      const pulls = normalizeBannerPulls(banner.bannerId, rows.map(toPullRow))
      const bannerRecords = buildResonanceRecords(banner.bannerId, pulls)
      if (!bannerRecords.length) skippedPools += 1
      records.push(...bannerRecords)
    } catch {
      skippedPools += 1
    }
  })

  if (!records.length) throw new Error(PEARPAL_NO_RECORDS)
  return { records, skippedPools }
}
