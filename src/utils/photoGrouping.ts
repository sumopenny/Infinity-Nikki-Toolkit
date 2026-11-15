export interface ParsedPhotoDate {
  dateKey: string
  year: string
  monthDay: string
  displayDate: string
  timeText: string
  timestamp: number
}

const FILE_DATE_PATTERN = /^(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_(\d{2}))?/

/** 将文件时间戳转换为相册使用的日期元数据。 */
export function datePartsFromTimestamp(timestamp: number): ParsedPhotoDate | null {
  if (!Number.isFinite(timestamp)) return null
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return {
    dateKey: `${year}-${month}-${day}`,
    year,
    monthDay: `${month}月${day}日`,
    displayDate: `${year}年${month}月${day}日`,
    timeText: `${hour}:${minute}`,
    timestamp: date.getTime()
  }
}

export function parsePhotoDate(fileName: string): ParsedPhotoDate | null {
  const match = fileName.match(FILE_DATE_PATTERN)
  if (!match) return null

  const [, year, month, day, hour, minute, second = '00'] = match
  const timestamp = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime()

  return {
    dateKey: `${year}-${month}-${day}`,
    year,
    monthDay: `${month}月${day}日`,
    displayDate: `${year}年${month}月${day}日`,
    timeText: `${hour}:${minute}`,
    timestamp
  }
}

export interface PhotoDisplayItem extends ParsedPhotoDate {
  id: string
  name: string
  url: string | null
  fileSizeText: string
  fileSize?: number
  lastModified?: number
  loadImageBlob?: () => Promise<Blob>
  note?: string
}

export interface DirectoryPhotoItem extends PhotoDisplayItem {
  source?: 'directory'
  fileHandle: FileSystemFileHandle
  directoryHandle: FileSystemDirectoryHandle
}

export interface FilePhotoItem extends PhotoDisplayItem {
  source: 'file'
  file: File
}

export type PhotoItem = DirectoryPhotoItem | FilePhotoItem

export function isAlbumPhoto(photo: object): photo is PhotoItem {
  return 'fileHandle' in photo || ('source' in photo && photo.source === 'file')
}

export function isDirectoryPhoto(photo: PhotoItem): photo is DirectoryPhotoItem {
  return photo.source !== 'file'
}

export function readPhotoFile(photo: PhotoItem): Promise<File> {
  return photo.source === 'file' ? Promise.resolve(photo.file) : photo.fileHandle.getFile()
}

export type PhotoActionStatus = 'pending' | 'action' | 'none' | 'unparsed'

export interface PhotoActionInfo {
  status: PhotoActionStatus
  actionId?: string
  actionName?: string
  actionImageUrl?: string
  errorCode?: string
  fingerprint?: string
  parsedAt?: number
}

export type ActionSort = 'id' | 'name' | 'count' | 'latest'

export interface ActionGroup {
  actionKey: string
  actionId?: string
  actionName: string
  actionImageUrl?: string
  photos: PhotoItem[]
  latestTimestamp: number
  isSpecial?: 'none' | 'unparsed'
}

export interface RecentlyDeletedPhoto extends DirectoryPhotoItem {
  albumDirectoryHandle?: FileSystemDirectoryHandle
  noteKey?: string
  trashName: string
  originalName: string
  deletedAt: number
  wasFavorite: boolean
  size: number | null
}

export interface DateGroup {
  dateKey: string
  year: string
  monthDay: string
  displayDate: string
  photos: PhotoItem[]
}

export interface YearGroup {
  year: string
  months: MonthGroup[]
  photoCount: number
}

export interface MonthGroup {
  monthKey: string
  month: string
  dates: DateGroup[]
  photoCount: number
}

export function groupPhotosByDate(photos: PhotoItem[]): DateGroup[] {
  const map = new Map<string, DateGroup>()

  for (const photo of photos) {
    if (!map.has(photo.dateKey)) {
      map.set(photo.dateKey, {
        dateKey: photo.dateKey,
        year: photo.year,
        monthDay: photo.monthDay,
        displayDate: photo.displayDate,
        photos: []
      })
    }
    map.get(photo.dateKey)?.photos.push(photo)
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      photos: group.photos.sort((a, b) => b.timestamp - a.timestamp)
    }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

/**
 * 将日期分组整理为年份、月份、日期三级时间轴。
 * 参数：groups 为按日期聚合的照片列表。
 * 返回：按年份和月份倒序排列并带照片计数的时间轴。
 */
export function groupDatesByYear(groups: DateGroup[]): YearGroup[] {
  const yearMap = new Map<string, Map<string, DateGroup[]>>()

  for (const group of groups) {
    const month = group.dateKey.slice(5, 7)
    const monthMap = yearMap.get(group.year) ?? new Map<string, DateGroup[]>()
    const dates = monthMap.get(month) ?? []
    dates.push(group)
    monthMap.set(month, dates)
    yearMap.set(group.year, monthMap)
  }

  return [...yearMap.entries()]
    .map(([year, monthMap]) => {
      const months = [...monthMap.entries()]
        .map(([month, dates]) => ({
          monthKey: `${year}-${month}`,
          month,
          dates: [...dates].sort((a, b) => b.dateKey.localeCompare(a.dateKey)),
          photoCount: dates.reduce((total, date) => total + date.photos.length, 0)
        }))
        .sort((a, b) => b.month.localeCompare(a.month))

      return {
        year,
        months,
        photoCount: months.reduce((total, month) => total + month.photoCount, 0)
      }
    })
    .sort((a, b) => b.year.localeCompare(a.year))
}

/** 按照片动作分组；明确无动作和解析失败保持为两个独立分组。 */
export function groupPhotosByAction(
  photos: PhotoItem[],
  actionInfo: ReadonlyMap<string, PhotoActionInfo>,
  sort: ActionSort,
  labels: { none: string; unparsed: string },
  actionNameForId?: (id: string) => string
): ActionGroup[] {
  const groups = new Map<string, ActionGroup>()
  for (const photo of photos) {
    const info = actionInfo.get(photo.id)
    const status = info?.status ?? 'unparsed'
    const isNone = status === 'none'
    const isUnparsed = status !== 'action' && !isNone
    const key =
      status === 'action' && info?.actionId
        ? `action:${info.actionId}`
        : isNone
          ? 'special:none'
          : 'special:unparsed'
    const group = groups.get(key) ?? {
      actionKey: key,
      actionId: status === 'action' ? info?.actionId : undefined,
      actionName:
        status === 'action'
          ? ((info?.actionId && actionNameForId?.(info.actionId)) ??
            info?.actionName ??
            info?.actionId ??
            labels.unparsed)
          : isNone
            ? labels.none
            : labels.unparsed,
      actionImageUrl: status === 'action' ? info?.actionImageUrl : undefined,
      photos: [],
      latestTimestamp: 0,
      isSpecial: isNone ? 'none' : isUnparsed ? 'unparsed' : undefined
    }
    group.photos.push(photo)
    group.latestTimestamp = Math.max(group.latestTimestamp, photo.timestamp)
    groups.set(key, group)
  }

  const specialRank = (group: ActionGroup) =>
    group.isSpecial === 'unparsed' ? 2 : group.isSpecial === 'none' ? 1 : 0
  const compare = (left: ActionGroup, right: ActionGroup) => {
    const specialDifference = specialRank(left) - specialRank(right)
    if (specialDifference) return specialDifference
    if (sort === 'name')
      return (
        left.actionName.localeCompare(right.actionName) ||
        left.actionKey.localeCompare(right.actionKey)
      )
    if (sort === 'count')
      return (
        right.photos.length - left.photos.length ||
        right.latestTimestamp - left.latestTimestamp ||
        left.actionKey.localeCompare(right.actionKey)
      )
    if (sort === 'latest')
      return (
        right.latestTimestamp - left.latestTimestamp ||
        left.actionKey.localeCompare(right.actionKey)
      )
    return (
      String(right.actionId ?? '').localeCompare(String(left.actionId ?? ''), undefined, {
        numeric: true
      }) || left.actionName.localeCompare(right.actionName)
    )
  }

  return [...groups.values()]
    .map((group) => ({ ...group, photos: group.photos.sort((a, b) => b.timestamp - a.timestamp) }))
    .sort(compare)
}
