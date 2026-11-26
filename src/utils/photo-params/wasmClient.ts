import { createWasmLoader } from '../wasmLoader'
import wasmUrl from '../../assets/photo-params.wasm?url'

interface PhotoParamsExports extends WebAssembly.Exports {
  __newString(value: string): number
  __getString(pointer: number): string
  __newArray(id: number, values: ArrayLike<number>): number
  Uint8Array_ID: WebAssembly.Global
  decodePhoto(bytesPointer: number, uidPointer: number): number
  decodeCameraParams(rawPointer: number): number
}

export interface WasmResult<T> {
  ok: boolean
  errorCode?: string
  value?: T
}

const getExports = createWasmLoader<PhotoParamsExports>(wasmUrl)

function parseResult<T>(text: string): WasmResult<T> {
  return JSON.parse(text) as WasmResult<T>
}

/** 调用 WASM 解码完整照片；TypeScript 只负责编组字节和解析结果 JSON。 */
export async function decodePhoto<T>(bytes: Uint8Array, uid: string): Promise<WasmResult<T>> {
  const wasm = await getExports()
  const bytesPointer = wasm.__newArray(Number(wasm.Uint8Array_ID.value), bytes)
  return parseResult<T>(wasm.__getString(wasm.decodePhoto(bytesPointer, wasm.__newString(uid))))
}

/** 调用 WASM 解码独立 CameraParams 密文。 */
export async function decodeCameraParams<T>(raw: string): Promise<WasmResult<T>> {
  const wasm = await getExports()
  return parseResult<T>(wasm.__getString(wasm.decodeCameraParams(wasm.__newString(raw))))
}
