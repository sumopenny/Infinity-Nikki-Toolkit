export type ThemeMode = 'light' | 'dark' | 'system'

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}
