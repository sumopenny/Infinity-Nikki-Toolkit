export const MOBILE_NAV_STYLES = ['docked', 'capsule'] as const
export type MobileNavStyle = (typeof MOBILE_NAV_STYLES)[number]

export function isMobileNavStyle(value: unknown): value is MobileNavStyle {
  return MOBILE_NAV_STYLES.includes(value as MobileNavStyle)
}

export const SURFACE_STYLES = ['opaque', 'frosted', 'glass'] as const
export type SurfaceStyle = (typeof SURFACE_STYLES)[number]
export function isSurfaceStyle(value: unknown): value is SurfaceStyle {
  return SURFACE_STYLES.includes(value as SurfaceStyle)
}
