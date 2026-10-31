const WEATHER_NAMES: Record<string, { zh: string; en: string }> = {
  '0': { zh: '晴天', en: 'Sunny' },
  '2': { zh: '雨天', en: 'Rainy' },
  '4': { zh: '彩虹', en: 'Rainbow' },
  '7': { zh: '星海', en: 'Sea of Stars' }
}

/** 将照片中的 WeatherType 枚举转换为可读名称，未知值保留原始编号。 */
export function weatherName(value: unknown, language: 'zh' | 'en'): string {
  const key = String(value)
  return WEATHER_NAMES[key]?.[language] ?? `WeatherType ${key}`
}

const WIND_INTENSITY = {
  zh: ['无风', '小风', '中风', '大风', '特大风'],
  en: ['Calm', 'Light wind', 'Moderate wind', 'Strong wind', 'Very strong wind']
}
const WIND_DIRECTION = {
  zh: ['东风', '南风', '西风', '北风', '东南风', '西南风', '东北风', '西北风', '无'],
  en: ['East', 'South', 'West', 'North', 'Southeast', 'Southwest', 'Northeast', 'Northwest', 'None']
}
function windName(value: unknown, names: string[], language: 'zh' | 'en'): string | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (Number.isInteger(n) && n >= 0 && n < names.length) return names[n]
  return language === 'zh' ? '未知' : 'Unknown'
}
export function weatherWithWind(
  photo: Record<string, unknown> | undefined,
  language: 'zh' | 'en'
): string {
  return [
    photo?.weatherType != null ? weatherName(photo.weatherType, language) : null,
    windName(photo?.windIntensity, WIND_INTENSITY[language], language),
    windName(photo?.windDirection, WIND_DIRECTION[language], language)
  ]
    .filter((value): value is string => value != null)
    .join(language === 'zh' ? ' ' : ', ')
}
