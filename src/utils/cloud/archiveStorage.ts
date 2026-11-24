import { cloneJsonData } from '../cloneJsonData'
import { databaseRequest, runDatabaseTransaction } from '../file-system/transaction'
import { emptyWardrobe, validateWardrobe, wardrobeBaseline } from '../wardrobe/wardrobeSchema'
import {
  archiveModules,
  type ArchiveLocal,
  type ArchiveModule,
  type ArchiveSnapshot
} from './archiveSchema'

const stores = { resonance: 'resonance-records', wardrobe: 'wardrobe' }
const keys = { resonance: 'current-profile', wardrobe: 'current' }
function decode(module: ArchiveModule, value: unknown) {
  if (module === 'wardrobe') return value === undefined ? emptyWardrobe() : validateWardrobe(value)
  if (value !== undefined && !Array.isArray(value)) throw new Error('LOCAL_READ_FAILED')
  return value ?? []
}
export const archiveBaseline = (module: ArchiveModule, value: ArchiveLocal[ArchiveModule]) =>
  module === 'wardrobe'
    ? wardrobeBaseline(value as ArchiveLocal['wardrobe'])
    : JSON.stringify(value)

export interface ArchiveLocalPreview {
  data: Partial<ArchiveLocal>
  errors: Partial<Record<ArchiveModule, string>>
}

/** 同一只读事务固定预览；模块解码错误单独报告，数据库故障仍使整个读取失败。 */
export async function readArchiveLocalPreview(
  selected: readonly ArchiveModule[] = archiveModules
): Promise<ArchiveLocalPreview> {
  return runDatabaseTransaction(
    selected.map((module) => stores[module]),
    'readonly',
    async (tx) => {
      const output: ArchiveLocalPreview = { data: {}, errors: {} }
      for (const module of selected) {
        const value: unknown = await databaseRequest(
          tx.objectStore(stores[module]).get(keys[module])
        )
        try {
          Object.assign(output.data, { [module]: decode(module, value) })
        } catch {
          output.errors[module] = 'INVALID_DATA'
        }
      }
      return output
    }
  )
}

export function readArchiveLocal(): Promise<ArchiveLocal>
export function readArchiveLocal(selected: ArchiveModule[]): Promise<Partial<ArchiveLocal>>
/** 备份和提交复查采用严格读取，只校验被选择模块，绝不把坏数据替换成空存档。 */
export async function readArchiveLocal(
  selected: ArchiveModule[] = [...archiveModules]
): Promise<Partial<ArchiveLocal>> {
  const preview = await readArchiveLocalPreview(selected)
  if (selected.some((module) => preview.errors[module])) throw new Error('LOCAL_READ_FAILED')
  return preview.data
}

/** 先在同一读写事务核对全部基线，再写入；任一失败都回滚两个模块。 */
export async function replaceArchiveLocal(
  expected: Partial<ArchiveLocal>,
  incoming: ArchiveSnapshot,
  selected: ArchiveModule[]
) {
  const snapshot = cloneJsonData(incoming)
  await runDatabaseTransaction(
    selected.map((module) => stores[module]),
    'readwrite',
    async (tx) => {
      for (const module of selected) {
        const value: unknown = await databaseRequest(
          tx.objectStore(stores[module]).get(keys[module])
        )
        if (
          expected[module] === undefined ||
          archiveBaseline(module, decode(module, value) as ArchiveLocal[ArchiveModule]) !==
            archiveBaseline(module, expected[module]!)
        )
          throw new Error('LOCAL_CHANGED')
      }
      for (const module of selected) {
        const value =
          module === 'resonance'
            ? snapshot.resonance!.records
            : { ...validateWardrobe(snapshot.wardrobe!.data), updatedAt: new Date().toISOString() }
        tx.objectStore(stores[module]).put(value, keys[module])
      }
    }
  )
}
