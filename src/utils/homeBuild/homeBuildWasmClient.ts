import { createWasmLoader } from '../wasmLoader'
import wasmUrl from '../../assets/home-build-parser.wasm?url'

interface HomeBuildWasmExports extends WebAssembly.Exports {
  __newString(value: string): number
  __getString(pointer: number): string
  __newArray(id: number, values: ArrayLike<number>): number
  Uint8Array_ID: WebAssembly.Global
  decodeHomeBuildShareCode(codePointer: number): number
  parseHomeBuildResponse(payloadPointer: number): number
}

export type HomeBuildWasmResult<T> = { ok: true; value: T } | { ok: false; errorCode: string }

export interface HomeBuildRoute {
  code: string
  serverMarker: string
  serverId: number
  resourceKey: string
  requestPath: string
}

export interface HomeBuildWireData {
  Name: string
  CoverImage: string
  MapID: number
  LastModifyTime: number
  Uid: number
  GameArea: string
  TemplateType: 0 | 1
  PlaceInfo: Array<Record<string, unknown>>
  ExtraInfoRaw: string
  Rid: null
  version: string | null
}

const getExports = createWasmLoader<HomeBuildWasmExports>(wasmUrl)

function parseResult<T>(text: string): HomeBuildWasmResult<T> {
  return JSON.parse(text) as HomeBuildWasmResult<T>
}

/** 只解析服务器标记和资源路径，不请求或解码方案正文。 */
export async function decodeHomeBuildShareCode(
  code: string
): Promise<HomeBuildWasmResult<HomeBuildRoute>> {
  const wasm = await getExports()
  const result = wasm.__getString(wasm.decodeHomeBuildShareCode(wasm.__newString(code)))
  return parseResult<HomeBuildRoute>(result)
}

/** 在浏览器内解码家园 CDN 二进制响应，不依赖原生 DLL。 */
export async function parseHomeBuildResponse(
  payload: Uint8Array
): Promise<HomeBuildWasmResult<HomeBuildWireData>> {
  const wasm = await getExports()
  const bytesPointer = wasm.__newArray(Number(wasm.Uint8Array_ID.value), payload)
  const result = wasm.__getString(wasm.parseHomeBuildResponse(bytesPointer))
  return parseResult<HomeBuildWireData>(result)
}
