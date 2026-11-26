import type { Place, PlaceCategory } from '../types'

export type NavProvider = 'google' | 'apple'

const NAV_PROVIDER_STORAGE_KEY = 'odysseus:nav-provider'

export const PLACE_CATEGORY_COLORS: Record<PlaceCategory, string> = {
  lodging: '#a78bfa',
  airport: '#38bdf8',
  food: '#f59e0b',
  activity: '#34d399',
  transit: '#60a5fa',
  other: '#94a3b8',
}

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  lodging: 'Lodging',
  airport: 'Airport',
  food: 'Food',
  activity: 'Activity',
  transit: 'Transit',
  other: 'Other',
}

export function readNavProviderPreference(): NavProvider {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'google'
    const stored = window.localStorage.getItem(NAV_PROVIDER_STORAGE_KEY)
    return stored === 'apple' ? 'apple' : 'google'
  } catch {
    return 'google'
  }
}

export function writeNavProviderPreference(provider: NavProvider): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(NAV_PROVIDER_STORAGE_KEY, provider)
    }
  } catch {
    // Ignore storage quota or private-browsing exceptions
  }
}

export function buildGoogleMapsSearchUrl(place: Pick<Place, 'latitude' | 'longitude' | 'google_place_id'>): string {
  const coords = `${place.latitude},${place.longitude}`
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`
  if (place.google_place_id) {
    return `${base}&query_place_id=${encodeURIComponent(place.google_place_id)}`
  }
  return base
}

export function buildGoogleMapsDirectionsUrl(
  places: Array<Pick<Place, 'latitude' | 'longitude' | 'google_place_id'>>,
): string {
  if (places.length === 0) return 'https://www.google.com/maps'
  const dest = places[places.length - 1]
  const destParam = `${dest.latitude},${dest.longitude}`
  const params = new URLSearchParams({ api: '1', destination: destParam })
  if (dest.google_place_id) {
    params.set('destination_place_id', dest.google_place_id)
  }
  if (places.length >= 2) {
    const origin = places[0]
    params.set('origin', `${origin.latitude},${origin.longitude}`)
    if (places.length > 2) {
      const waypoints = places
        .slice(1, -1)
        .map((p) => `${p.latitude},${p.longitude}`)
        .join('|')
      params.set('waypoints', waypoints)
    }
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function buildAppleMapsUrl(place: Pick<Place, 'latitude' | 'longitude' | 'name'>): string {
  const params = new URLSearchParams({
    ll: `${place.latitude},${place.longitude}`,
    q: place.name,
  })
  return `https://maps.apple.com/?${params.toString()}`
}

export function buildNavigationUrl(
  place: Pick<Place, 'latitude' | 'longitude' | 'name' | 'google_place_id'>,
  provider: NavProvider,
): string {
  return provider === 'apple'
    ? buildAppleMapsUrl(place)
    : buildGoogleMapsSearchUrl(place)
}

export function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`
}

export function formatDurationMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const rem = rounded % 60
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`
}

export function formatBytesCompact(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
