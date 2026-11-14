import metadata from '../../data/gongeo/filterMetadata.json'
import type { Language } from '../../i18n/types'
import type { WardrobeEntry, WardrobeKind } from './wardrobeCatalog'

export interface WardrobeFilterOption {
  value: string
  label: string
  separatorBefore?: boolean
}

export function wardrobeGameVersionFromSource(obtainType: number | null): string | null {
  if (obtainType === null || !Number.isSafeInteger(obtainType) || obtainType < 0) return null
  const digits = String(obtainType)
  return digits.length >= 3 ? `${digits[0]}.${Number(digits.slice(1, 3))}` : null
}

export function wardrobeGameVersionOptions(language: Language): WardrobeFilterOption[] {
  const versions = metadata.versions.filter(({ value }) => /^\d+\.\d+$/.test(value))
  const majors = [...new Set(versions.map(({ value }) => Number(value.split('.')[0])))].sort(
    (a, b) => b - a
  )
  const label = (value: string) => {
    const name = metadata.versions.find((version) => version.value === value)?.label[language]
    return name ? `${value} · ${name}` : value
  }
  return majors.flatMap((major, groupIndex) =>
    versions
      .filter(({ value }) => Number(value.split('.')[0]) === major)
      .sort((a, b) => Number(b.value.split('.')[1]) - Number(a.value.split('.')[1]))
      .map(({ value }, index) => ({
        value,
        label: label(value),
        separatorBefore: groupIndex > 0 && index === 0
      }))
  )
}

export const wardrobeTagOptions = (language: Language): WardrobeFilterOption[] =>
  metadata.tags.map(({ id, label }) => ({ value: String(id), label: label[language] }))

export function wardrobeSourceOptions(
  kind: WardrobeKind,
  language: Language
): WardrobeFilterOption[] {
  const sourceNames: Record<string, string> = {
    heart: '无限之心',
    chest: '宝箱设计图',
    cadenceborn: '唱诗蓝龙',
    pear: '商城',
    surprise: '滚滚机'
  }
  return metadata.sources
    .filter((source) => kind === 'item' || source.outfit)
    .flatMap((source) => [
      {
        value: source.key,
        label: language === 'zh' ? (sourceNames[source.key] ?? source.label.zh) : source.label.en
      },
      ...(source.key === 'limited' && kind === 'item'
        ? [
            {
              value: 'limited-reward',
              label: language === 'zh' ? '限定四星奖励' : 'Limited 4-star rewards'
            }
          ]
        : [])
    ])
}

export function matchesWardrobeGameVersion(
  entry: Pick<WardrobeEntry, 'version'>,
  value: string
): boolean {
  if (!value || value === 'all') return true
  if (!entry.version) return false
  return entry.version === value
}

export function matchesWardrobeSource(
  entry: Pick<WardrobeEntry, 'obtainType' | 'sourceDetails'>,
  value: string
): boolean {
  if (!value || value === 'all') return true
  const source = metadata.sources.find(
    ({ key }) => key === (value === 'limited-reward' ? 'limited' : value)
  )
  if (entry.obtainType === null || !source?.ids.includes(entry.obtainType)) return false
  return value !== 'limited-reward' || entry.sourceDetails.includes('deep-echo')
}

/** 详情标题共用来源标签，保持套装与部件的来源命名一致。 */
export function wardrobeSourceLabel(entry: WardrobeEntry | null, language: Language): string {
  return entry
    ? wardrobeSourceOptions(entry.kind, language)
        .filter((option) => matchesWardrobeSource(entry, option.value))
        .map((option) => option.label)
        .join(' · ')
    : ''
}

/** 与共鸣录列表一致，奖励匹配扩展到同一紧凑图鉴部件家族。 */
export function assignWardrobeRewardSources(entries: WardrobeEntry[]): void {
  const rewardIds = new Set(metadata.deepEchoRewardIds.map(String))
  const rewardRoots = new Set(
    entries
      .filter((entry) => entry.kind === 'item' && rewardIds.has(entry.id))
      .map((entry) => entry.familyRootId ?? entry.id)
  )
  for (const entry of entries) {
    entry.sourceDetails =
      entry.kind === 'item' && rewardRoots.has(entry.familyRootId ?? entry.id) ? ['deep-echo'] : []
  }
}

// 这些来源的散件拥有信息可能未包含在手账中，不能将缺少记录视为未拥有。
const uncertainSources = new Set(['starlit', 'merchant', 'miracrown', 'surprise', 'world'])
const uncertainObtainTypes = new Set(
  metadata.sources
    .filter((source) => uncertainSources.has(source.key))
    .flatMap((source) => source.ids)
)
export const hasIncompleteWardrobeOwnership = (source: string): boolean =>
  uncertainSources.has(source)
export const isWardrobeItemUnknown = (
  entry: Pick<WardrobeEntry, 'kind' | 'obtainType'>,
  owned: boolean
): boolean =>
  !owned &&
  entry.kind === 'item' &&
  entry.obtainType !== null &&
  uncertainObtainTypes.has(entry.obtainType)
