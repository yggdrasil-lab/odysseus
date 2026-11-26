import { describe, expect, it } from 'vitest'

import type { ItineraryItem, Leg } from '../types'
import {
  extractLocalDate,
  extractWallClockHHMM,
  formatCalendarDayLabel,
  formatEventLocalTimeLabel,
  formatSegmentWallClock,
  legsCoveringDate,
} from './time'

function makeItem(overrides: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: 'item-1',
    trip_id: 'trip-1',
    day_id: 'day-1',
    title: 'Harbor Ferry',
    category: 'transit',
    status: 'planned',
    start_local: null,
    start_tz: null,
    end_local: null,
    end_tz: null,
    start_utc: null,
    end_utc: null,
    place_label: null,
    place_id: null,
    sync_to_chronos: false,
    sort_order: 0,
    notes: null,
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('wall-clock time formatting', () => {
  it('formats event-local HH:MM window without shifting to browser timezone', () => {
    const item = makeItem({
      start_local: '2027-01-15T09:15:00',
      start_tz: 'Asia/Tokyo',
      end_local: '2027-01-15T11:45:00',
      end_tz: 'Asia/Tokyo',
      start_utc: '2027-01-15T00:15:00Z',
      end_utc: '2027-01-15T02:45:00Z',
    })

    const formatted = formatEventLocalTimeLabel(item)
    expect(formatted).not.toBeNull()
    expect(formatted).toContain('09:15 - 11:45')
    expect(extractWallClockHHMM(item.start_local)).toBe('09:15')
  })

  it('formats calendar day headers in UTC without date drift', () => {
    expect(formatCalendarDayLabel('2027-01-15')).toContain('2027')
    expect(formatCalendarDayLabel('2027-01-15')).toContain('15')
  })

  it('matches all overlapping legs covering a given day date', () => {
    const legs: Leg[] = [
      {
        id: 'leg-1',
        trip_id: 'trip-1',
        name: 'Harbor City',
        primary_city: 'Harbor City',
        country_code: 'NZ',
        base_timezone: 'Pacific/Auckland',
        start_date: '2027-01-10',
        end_date: '2027-01-13',
        color: '#38bdf8',
        sort_order: 0,
        notes: null,
        created_at: '',
        updated_at: '',
      },
      {
        id: 'leg-2',
        trip_id: 'trip-1',
        name: 'Island Coast',
        primary_city: 'Island Coast',
        country_code: 'JP',
        base_timezone: 'Asia/Tokyo',
        start_date: '2027-01-12',
        end_date: '2027-01-15',
        color: '#f59e0b',
        sort_order: 1,
        notes: null,
        created_at: '',
        updated_at: '',
      },
    ]

    expect(legsCoveringDate(legs, '2027-01-11').map((l) => l.name)).toEqual(['Harbor City'])
    expect(legsCoveringDate(legs, '2027-01-12').map((l) => l.name)).toEqual([
      'Harbor City',
      'Island Coast',
    ])
  })

  it('extracts wall-clock local date and segment time without browser drift', () => {
    expect(extractLocalDate('2027-01-12T22:15:00')).toBe('2027-01-12')
    expect(formatSegmentWallClock('2027-01-12T22:15:00', '2027-01-12T09:15:00Z', 'Pacific/Auckland')).toContain('22:15')
  })
})
