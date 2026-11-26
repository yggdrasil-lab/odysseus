import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { OdysseusApiError, type OdysseusApiAdapter } from './api/client'
import type {
  Checklist,
  ChecklistCreatePayload,
  ChecklistItem,
  ChecklistItemCreatePayload,
  ChecklistItemUpdatePayload,
  ItineraryItem,
  ItineraryItemCreatePayload,
  ItineraryItemUpdatePayload,
  Leg,
  LegCreatePayload,
  TravelNote,
  TravelNoteCreatePayload,
  Trip,
  TripCreatePayload,
  TripWorkspace,
} from './types'

function createSyntheticAdapter(initialFail?: Error): OdysseusApiAdapter {
  const trip: Trip = {
    id: 'trip-1',
    title: 'Pacific Explorer',
    slug: 'pacific-explorer',
    status: 'booked',
    start_date: '2027-01-12',
    end_date: '2027-01-13',
    home_timezone: 'Pacific/Auckland',
    budget_nzd: '4500.00',
    immich_album_id: null,
    vault_note_path: null,
    chronos_sync_enabled: false,
    chronos_overlay_mode: 'suppress_all_grid_blocks',
    summary: 'Synthetic coastal itinerary for testing.',
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
  }

  const legs: Leg[] = [
    {
      id: 'leg-1',
      trip_id: trip.id,
      name: 'Harbor City',
      primary_city: 'Harbor City',
      country_code: 'NZ',
      base_timezone: 'Pacific/Auckland',
      start_date: '2027-01-12',
      end_date: '2027-01-12',
      color: '#38bdf8',
      sort_order: 0,
      notes: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'leg-2',
      trip_id: trip.id,
      name: 'Island Coast',
      primary_city: 'Island Coast',
      country_code: 'JP',
      base_timezone: 'Asia/Tokyo',
      start_date: '2027-01-12',
      end_date: '2027-01-13',
      color: '#f59e0b',
      sort_order: 1,
      notes: null,
      created_at: '',
      updated_at: '',
    },
  ]

  const days = [
    {
      id: 'day-1',
      trip_id: trip.id,
      date: '2027-01-12',
      title: 'Arrival & Transfer',
      notes: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'day-2',
      trip_id: trip.id,
      date: '2027-01-13',
      title: 'Coastal Walk',
      notes: null,
      created_at: '',
      updated_at: '',
    },
  ]

  const items: ItineraryItem[] = [
    {
      id: 'item-1',
      trip_id: trip.id,
      day_id: 'day-1',
      title: 'Morning Harbor Ferry',
      category: 'transit',
      status: 'confirmed',
      start_local: '2027-01-12T09:30:00',
      start_tz: 'Asia/Tokyo',
      end_local: '2027-01-12T10:45:00',
      end_tz: 'Asia/Tokyo',
      start_utc: '2027-01-12T00:30:00Z',
      end_utc: '2027-01-12T01:45:00Z',
      place_label: 'Harbor Pier 2',
      sync_to_chronos: false,
      sort_order: 0,
      notes: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'item-2',
      trip_id: trip.id,
      day_id: null,
      title: 'Lantern Market Dinner',
      category: 'food',
      status: 'idea',
      start_local: null,
      start_tz: null,
      end_local: null,
      end_tz: null,
      start_utc: null,
      end_utc: null,
      place_label: 'Old Quay',
      sync_to_chronos: false,
      sort_order: 1,
      notes: null,
      created_at: '',
      updated_at: '',
    },
  ]

  const checklists: Checklist[] = [
    {
      id: 'chk-1',
      trip_id: trip.id,
      title: 'Carry-on Packing',
      list_type: 'packing',
      sort_order: 0,
      items: [
        {
          id: 'chki-1',
          checklist_id: 'chk-1',
          leg_id: 'leg-1',
          label: 'Travel adapter',
          is_completed: false,
          due_date: null,
          note: null,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      created_at: '',
      updated_at: '',
    },
  ]

  const notes: TravelNote[] = [
    {
      id: 'note-1',
      trip_id: trip.id,
      leg_id: 'leg-2',
      day_id: null,
      title: 'Station Locker Memo',
      body: 'Alex Tan keeps spare pass in daypack pocket.',
      is_private: true,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    },
  ]

  const trips = [trip]

  return {
    listTrips: async () => {
      if (initialFail) throw initialFail
      return [...trips]
    },
    createTrip: async (payload: TripCreatePayload) => {
      const created: Trip = {
        ...trip,
        id: `trip-${trips.length + 1}`,
        title: payload.title,
        slug: payload.slug,
        status: payload.status ?? 'planning',
      }
      trips.unshift(created)
      return created
    },
    getWorkspace: async (): Promise<TripWorkspace> => ({
      trip,
      legs: [...legs],
      days: [...days],
      itinerary_items: [...items],
      checklists: checklists.map((c) => ({ ...c, items: [...c.items] })),
      travel_notes: [...notes],
    }),
    createLeg: async (_tripId: string, payload: LegCreatePayload) => {
      const created: Leg = {
        id: `leg-${legs.length + 1}`,
        trip_id: trip.id,
        name: payload.name,
        primary_city: payload.primary_city,
        country_code: payload.country_code ?? null,
        base_timezone: payload.base_timezone,
        start_date: payload.start_date,
        end_date: payload.end_date,
        color: payload.color ?? '#38bdf8',
        sort_order: legs.length,
        notes: null,
        created_at: '',
        updated_at: '',
      }
      legs.push(created)
      return created
    },
    createItineraryItem: async (_tripId: string, payload: ItineraryItemCreatePayload) => {
      const created: ItineraryItem = {
        id: `item-${items.length + 1}`,
        trip_id: trip.id,
        day_id: payload.day_id ?? null,
        title: payload.title,
        category: payload.category ?? 'activity',
        status: payload.status ?? 'planned',
        start_local: payload.start_local ?? null,
        start_tz: payload.start_tz ?? null,
        end_local: payload.end_local ?? null,
        end_tz: payload.end_tz ?? null,
        start_utc: null,
        end_utc: null,
        place_label: payload.place_label ?? null,
        sync_to_chronos: false,
        sort_order: items.length,
        notes: null,
        created_at: '',
        updated_at: '',
      }
      items.push(created)
      return created
    },
    updateItineraryItem: async (
      _tripId: string,
      itemId: string,
      payload: ItineraryItemUpdatePayload,
    ) => {
      const target = items.find((i) => i.id === itemId)!
      Object.assign(target, payload)
      return { ...target }
    },
    deleteItineraryItem: async (_tripId: string, itemId: string) => {
      const idx = items.findIndex((i) => i.id === itemId)
      if (idx >= 0) items.splice(idx, 1)
    },
    createChecklist: async (_tripId: string, payload: ChecklistCreatePayload) => {
      const created: Checklist = {
        id: `chk-${checklists.length + 1}`,
        trip_id: trip.id,
        title: payload.title,
        list_type: payload.list_type ?? 'packing',
        sort_order: checklists.length,
        items: [],
        created_at: '',
        updated_at: '',
      }
      checklists.push(created)
      return created
    },
    createChecklistItem: async (
      _tripId: string,
      checklistId: string,
      payload: ChecklistItemCreatePayload,
    ) => {
      const target = checklists.find((c) => c.id === checklistId)!
      const created: ChecklistItem = {
        id: `chki-${target.items.length + 1}`,
        checklist_id: checklistId,
        leg_id: payload.leg_id ?? null,
        label: payload.label,
        is_completed: false,
        due_date: null,
        note: null,
        sort_order: target.items.length,
        created_at: '',
        updated_at: '',
      }
      target.items.push(created)
      return created
    },
    updateChecklistItem: async (
      _tripId: string,
      checklistId: string,
      itemId: string,
      payload: ChecklistItemUpdatePayload,
    ) => {
      const target = checklists.find((c) => c.id === checklistId)!
      const item = target.items.find((i) => i.id === itemId)!
      Object.assign(item, payload)
      return { ...item }
    },
    deleteChecklistItem: async (_tripId: string, checklistId: string, itemId: string) => {
      const target = checklists.find((c) => c.id === checklistId)!
      const idx = target.items.findIndex((i) => i.id === itemId)
      if (idx >= 0) target.items.splice(idx, 1)
    },
    createNote: async (_tripId: string, payload: TravelNoteCreatePayload) => {
      const created: TravelNote = {
        id: `note-${notes.length + 1}`,
        trip_id: trip.id,
        leg_id: payload.leg_id ?? null,
        day_id: payload.day_id ?? null,
        title: payload.title,
        body: payload.body,
        is_private: Boolean(payload.is_private),
        sort_order: notes.length,
        created_at: '',
        updated_at: '',
      }
      notes.push(created)
      return created
    },
    deleteNote: async (_tripId: string, noteId: string) => {
      const idx = notes.findIndex((n) => n.id === noteId)
      if (idx >= 0) notes.splice(idx, 1)
    },
  }
}

beforeEach(() => {
  window.scrollTo = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe('Odysseus Variant A Shell', () => {
  it('renders overlapping legs, event-local wall-clock time, backlog, checklists, and private note', async () => {
    const adapter = createSyntheticAdapter()
    render(<App adapter={adapter} />)

    const headings = await screen.findAllByRole('heading', { name: 'Pacific Explorer' })
    expect(headings.length).toBeGreaterThan(0)
    const dayOneCards = screen.getAllByTestId('day-card-2027-01-12')
    expect(dayOneCards.length).toBeGreaterThan(0)
    expect(dayOneCards[0]).toHaveTextContent('Harbor City')
    expect(dayOneCards[0]).toHaveTextContent('Island Coast')

    expect(screen.getAllByText(/09:30 - 10:45/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Lantern Market Dinner').length).toBeGreaterThan(0)
    expect(screen.getByText('Station Locker Memo')).toBeInTheDocument()
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(screen.getByTestId('map-preview-panel')).toBeInTheDocument()
  })

  it('toggles checklist item and adds new itinerary item via modal', async () => {
    const adapter = createSyntheticAdapter()
    render(<App adapter={adapter} />)

    const headings = await screen.findAllByRole('heading', { name: 'Pacific Explorer' })
    expect(headings.length).toBeGreaterThan(0)

    const toggleBtn = screen.getByRole('button', { name: 'Toggle Travel adapter' })
    fireEvent.click(toggleBtn)
    await waitFor(() => {
      expect(screen.getByText('1/1')).toBeInTheDocument()
    })

    const addButtons = screen.getAllByRole('button', { name: 'Add Activity' })
    fireEvent.click(addButtons[0])
    const titleInput = await screen.findByLabelText(/Activity Title/)
    fireEvent.change(titleInput, { target: { value: 'Lighthouse Walk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Item' }))

    expect((await screen.findAllByText('Lighthouse Walk')).length).toBeGreaterThan(0)
  })

  it('displays fail-loud API error banner when initial load fails', async () => {
    const adapter = createSyntheticAdapter(
      new OdysseusApiError({ status: 503, detail: 'Database offline', path: '/trips' }),
    )
    render(<App adapter={adapter} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Odysseus API Error')
    expect(alert).toHaveTextContent('Database offline')
  })
})
