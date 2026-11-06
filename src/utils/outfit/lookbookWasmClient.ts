import * as loader from '@assemblyscript/loader'
import wasmUrl from '../../assets/lookbook-parser.wasm?url'
import { measureLookbook } from './lookbookDiagnostics'

interface LookbookWasmExports extends WebAssembly.Exports {
  __newString(value: string): number
  __getString(pointer: number): string
  __pin(pointer: number): number
  __unpin(pointer: number): void
  decodeOutfitPayload(codePointer: number, payloadPointer: number): number
  decodeShareCodePathId(codePointer: number): number
}

export type LookbookWasmResult<T> = { ok: true; value: T } | { ok: false; errorCode: string }

let exportsPromise: Promise<LookbookWasmExports> | null = null

async function getExports(): Promise<LookbookWasmExports> {
  if (!exportsPromise) {
    exportsPromise = measureLookbook('wasm_download', async () => {
      const response = await fetch(wasmUrl)
      if (!response.ok) throw new Error(`WASM HTTP ${response.status}`)
      return response.arrayBuffer()
    })
      .then((bytes) => measureLookbook('wasm_initialize', () => loader.instantiate(bytes, {})))
      .then((module) => module.exports as unknown as LookbookWasmExports)
      .catch((error: unknown) => {
        exportsPromise = null
        throw error
      })
  }
  return exportsPromise
}

/** 在浏览器 WASM 中归一化 API JSON 或原生解码器输出。 */
export async function decodeLookbookPayload<T>(
  code: string,
  payload: string
): Promise<LookbookWasmResult<T>> {
  const wasm = await getExports()
  const codePointer = wasm.__pin(wasm.__newString(code))
  try {
    const payloadPointer = wasm.__pin(wasm.__newString(payload))
    try {
      return JSON.parse(
        wasm.__getString(wasm.decodeOutfitPayload(codePointer, payloadPointer))
      ) as LookbookWasmResult<T>
    } finally {
      wasm.__unpin(payloadPointer)
    }
  } finally {
    wasm.__unpin(codePointer)
  }
}

/** 使用 WASM 还原分享码对应的固定对象路径编号；不支持的格式返回 null。 */
export async function decodeLookbookShareCodePathId(code: string): Promise<string | null> {
  const wasm = await getExports()
  const pointer = wasm.__pin(wasm.__newString(code))
  try {
    const pathId = wasm.__getString(wasm.decodeShareCodePathId(pointer))
    return /^\d{18}$/.test(pathId) ? pathId : null
  } finally {
    wasm.__unpin(pointer)
  }
}

/** 进入解析工具时预热，失败由正式解析继续重试，不向用户显示预热错误。 */
export async function warmLookbookParser(): Promise<void> {
  await getExports()
}
