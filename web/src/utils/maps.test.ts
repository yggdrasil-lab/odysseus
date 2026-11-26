import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildAppleMapsUrl,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsSearchUrl,
  buildNavigationUrl,
  formatBytesCompact,
  formatDistanceMeters,
  formatDurationMinutes,
  readNavProviderPreference,
  writeNavProviderPreference,
} from './maps'

describe('Odysseus map and navigation helpers', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('builds Google Maps search URL with optional place id', () => {
    expect(
      buildGoogleMapsSearchUrl({
        latitude: -36.8485,
        longitude: 174.7633,
        google_place_id: null,
      }),
    ).toBe('https://www.google.com/maps/search/?api=1&query=-36.8485%2C174.7633')

    expect(
      buildGoogleMapsSearchUrl({
        latitude: 35.6762,
        longitude: 139.6503,
        google_place_id: 'ChIJplace123',
      }),
    ).toContain('query_place_id=ChIJplace123')
  })

  it('builds Google Maps multi-stop directions URL', () => {
    const url = buildGoogleMapsDirectionsUrl([
      { latitude: -36.84, longitude: 174.76, google_place_id: null },
      { latitude: -36.85, longitude: 174.77, google_place_id: null },
      { latitude: -36.86, longitude: 174.78, google_place_id: 'ChIJdest' },
    ])
    expect(url).toContain('origin=-36.84%2C174.76')
    expect(url).toContain('waypoints=-36.85%2C174.77')
    expect(url).toContain('destination=-36.86%2C174.78')
    expect(url).toContain('destination_place_id=ChIJdest')
  })

  it('builds Apple Maps URL and switches navigation provider preference', () => {
    const place = {
      name: 'Harbour View Hotel',
      latitude: -36.8442,
      longitude: 174.7615,
      google_place_id: null,
    }
    expect(buildAppleMapsUrl(place)).toBe(
      'https://maps.apple.com/?ll=-36.8442%2C174.7615&q=Harbour+View+Hotel',
    )
    expect(readNavProviderPreference()).toBe('google')
    writeNavProviderPreference('apple')
    expect(readNavProviderPreference()).toBe('apple')
    expect(buildNavigationUrl(place, 'apple')).toContain('maps.apple.com')
    expect(buildNavigationUrl(place, 'google')).toContain('google.com/maps')
  })

  it('formats distances, durations, and attachment byte sizes', () => {
    expect(formatDistanceMeters(680)).toBe('680 m')
    expect(formatDistanceMeters(2450)).toBe('2.5 km')
    expect(formatDistanceMeters(15200)).toBe('15 km')
    expect(formatDurationMinutes(42)).toBe('42 min')
    expect(formatDurationMinutes(95)).toBe('1h 35m')
    expect(formatDurationMinutes(120)).toBe('2h')
    expect(formatBytesCompact(512)).toBe('512 B')
    expect(formatBytesCompact(2048)).toBe('2.0 KB')
    expect(formatBytesCompact(2 * 1024 * 1024)).toBe('2.0 MB')
  })
})
