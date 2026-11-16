import { annotateDiagnosticError } from '../errorReporting/errorReporter'
import { PEARPAL_REGIONS, type PearpalRegion } from './pearpalRegions'

export function pearpalObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Only schema features and status codes, never role IDs, credentials, or the raw response. */
export function pearpalResponseShape(value: unknown): Record<string, unknown> {
  const payload = pearpalObject(value)
  const data = pearpalObject(payload?.data)
  const role = pearpalObject(data?.role)
  const type = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
  return {
    payloadType: type(value),
    upstreamCode: typeof payload?.code === 'number' ? payload.code : null,
    upstreamCodeType: type(payload?.code),
    hasData: !!data,
    hasRole: !!role,
    roleType: type(data?.role),
    uidPresent: role?.uid !== undefined && role?.uid !== null && role?.uid !== '',
    uidType: type(role?.uid),
    zoneIdPresent: role?.zone_id !== undefined && role?.zone_id !== null,
    actualZoneId:
      typeof role?.zone_id === 'number' && Number.isFinite(role.zone_id) ? role.zone_id : null
  }
}

export function pearpalDiagnosticFailure(
  message: string,
  code: string,
  action: 'verify' | 'snapshot',
  region: PearpalRegion,
  response?: Response,
  context: Record<string, unknown> = {},
  severity: 'warning' | 'error' = 'warning'
): Error {
  return annotateDiagnosticError(new Error(message), {
    code,
    stage: action,
    severity,
    context: {
      region,
      upstreamAction: action,
      endpoint:
        action === 'verify' ? '/v1/strategy/user/info/get' : '/v1/strategy/user/note/book/info',
      upstreamHost: new URL(PEARPAL_REGIONS[region].api).hostname,
      httpStatus: response?.status ?? null,
      requestId: response?.headers.get('X-Request-Id') ?? null,
      contentType: response?.headers.get('content-type')?.split(';')[0] ?? null,
      ...context
    }
  })
}

export async function readPearpalJSON(
  response: Response,
  action: 'verify' | 'snapshot',
  region: PearpalRegion,
  message: string
): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    // A JSON parser message can contain fragments of the response body. Do not retain those fragments.
    throw pearpalDiagnosticFailure(
      message,
      'PEARPAL_RESPONSE_INVALID',
      action,
      region,
      response,
      { parseErrorName: error instanceof Error ? error.name : 'unknown' },
      'error'
    )
  }
}
