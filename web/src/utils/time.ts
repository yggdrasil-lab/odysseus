import type { ItineraryItem, Leg } from '../types'

/**
 * Extract wall-clock HH:MM directly from a naive ISO timestamp string without
 * converting through the browser's local timezone.
 */
export function extractWallClockHHMM(localIso: string | null): string | null {
  if (!localIso) return null
  const timePart = localIso.split('T')[1]
  if (!timePart) return null
  const match = /^(\d{2}:\d{2})/.exec(timePart)
  return match ? match[1] : null
}

/**
 * Resolve a short timezone label (e.g. NZDT, JST, GMT+9) from an event's
 * UTC instant and IANA timezone name, completely independent of browser TZ.
 */
export function formatEventTimezoneCode(
  utcIso: string | null,
  ianaTimezone: string | null,
): string | null {
  if (!ianaTimezone) return null
  try {
    const instant = utcIso ? new Date(utcIso) : new Date(Date.UTC(2026, 0, 15, 0, 0, 0))
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaTimezone,
      timeZoneName: 'short',
    }).formatToParts(instant)
    const tzPart = parts.find((part) => part.type === 'timeZoneName')?.value
    if (tzPart) return tzPart
  } catch {
    // Fall back to city segment below when Intl lacks an exotic zone
  }
  const city = ianaTimezone.split('/').pop()
  return city ? city.replace(/_/g, ' ') : ianaTimezone
}

/**
 * Format an itinerary item's event-local wall-clock time window + timezone badge
 * without ever shifting to the viewer's browser timezone.
 */
export function formatEventLocalTimeLabel(item: ItineraryItem): string | null {
  const startHm = extractWallClockHHMM(item.start_local)
  if (!startHm) return null
  const endHm = extractWallClockHHMM(item.end_local)
  const tzCode = formatEventTimezoneCode(item.start_utc, item.start_tz)
  const windowText = endHm ? `${startHm} - ${endHm}` : startHm
  return tzCode ? `${windowText} ${tzCode}` : windowText
}

/**
 * Format a YYYY-MM-DD calendar date in UTC so day headers never drift across
 * negative or positive browser UTC offsets.
 */
export function formatCalendarDayLabel(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

/**
 * Return all destination Legs covering a given calendar YYYY-MM-DD date.
 */
export function legsCoveringDate(legs: Leg[], isoDate: string): Leg[] {
  return legs.filter((leg) => leg.start_date <= isoDate && isoDate <= leg.end_date)
}

/**
 * Extract the calendar YYYY-MM-DD portion directly from a wall-clock ISO timestamp.
 */
export function extractLocalDate(localIso: string | null): string | null {
  if (!localIso) return null
  const datePart = localIso.split('T')[0]
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null
}

/**
 * Format a wall-clock HH:MM + timezone label for booking segments without browser TZ drift.
 */
export function formatSegmentWallClock(
  localIso: string,
  utcIso: string | null,
  ianaTimezone: string,
): string {
  const hm = extractWallClockHHMM(localIso) ?? localIso
  const tzCode = formatEventTimezoneCode(utcIso, ianaTimezone)
  return tzCode ? `${hm} ${tzCode}` : hm
}
