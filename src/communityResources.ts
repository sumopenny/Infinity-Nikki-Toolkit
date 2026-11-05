// Pause community-backed parsing and archives without changing saved user preferences.
export const communityResourcesPaused = true
export const officialHomeCoverOrigin = 'https://x6cn-home-design-photo.nuanpaper.com'

export function homeCoverForDisplay(value: string | null): string | null {
  if (!value || !communityResourcesPaused) return value
  try {
    const url = new URL(value)
    return url.origin === officialHomeCoverOrigin && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

export function isPausedCommunityRoute(pathname: string) {
  return (
    communityResourcesPaused &&
    /^\/api\/(?:gongeo|share-image|outfit-code|resonance\/pearpal)(?:\/|$)/i.test(pathname)
  )
}
