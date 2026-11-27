import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('maplibre-gl', () => ({ default: { Map: vi.fn() } }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/mock-pdf.worker.mjs' }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 320, height: 240 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
      destroy: async () => {},
    }),
  }),
}))

import { App } from './App'
import { OdysseusApiError, type OdysseusApiAdapter } from './api/client'
import { InMemoryOfflineStorageAdapter } from './offline/storage'
import type {
  AssignBookingPayload,
  Attachment,
  Booking,
  BookingCreatePayload,
  BookingUpdatePayload,
  Checklist,
  ChecklistCreatePayload,
  ChecklistItem,
  ChecklistItemCreatePayload,
  ChecklistItemUpdatePayload,
  ChronosPreview,
  ChronosSyncRequest,
  ChronosSyncResponse,
  DayRoutesComputeResponse,
  ItineraryItem,
  ItineraryItemCreatePayload,
  ItineraryItemUpdatePayload,
  Leg,
  LegCreatePayload,
  MapPack,
  MapPackCreatePayload,
  OfflineBundle,
  Place,
  PlaceCreatePayload,
  PlaceUpdatePayload,
  RouteEstimate,
  RouteEstimateUpdatePayload,
  ShareToken,
  ShareTokenCreatePayload,
  ShareTokenUpdatePayload,
  SharedTripView,
  TravelMode,
  TravelNote,
  TravelNoteCreatePayload,
  Trip,
  TripBudgetSummary,
  TripCreatePayload,
  TripPhotosResponse,
  TripUpdatePayload,
  TripWorkspace,
  UnassignedBooking,
} from './types'

interface SyntheticAdapterOptions {
  initialFail?: Error
  emptyTrips?: boolean
  extraBookings?: Booking[]
  initialUnassigned?: UnassignedBooking[]
  photosResponse?: TripPhotosResponse
  photosError?: Error
  onGetTripPhotos?: () => void
  markdownExport?: string
}

function createSyntheticAdapter(
  failOrOptions?: Error | SyntheticAdapterOptions,
): OdysseusApiAdapter {
  const opts: SyntheticAdapterOptions =
    failOrOptions instanceof Error ? { initialFail: failOrOptions } : (failOrOptions ?? {})
  const initialFail = opts.initialFail
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
    { id: 'day-1', trip_id: trip.id, date: '2027-01-12', title: 'Arrival & Transfer', notes: null, created_at: '', updated_at: '' },
    { id: 'day-2', trip_id: trip.id, date: '2027-01-13', title: 'Coastal Walk', notes: null, created_at: '', updated_at: '' },
  ]

  const places: Place[] = [
    {
      id: 'place-1',
      trip_id: trip.id,
      name: 'Harbor Pier 2',
      category: 'transit',
      latitude: -36.8426,
      longitude: 174.7662,
      address: '2 Quay St',
      notes: null,
      external_map_url: null,
      google_place_id: null,
      osm_id: 'node/100',
      is_backlog: false,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'place-2',
      trip_id: trip.id,
      name: 'Old Quay Market',
      category: 'food',
      latitude: -36.8465,
      longitude: 174.7691,
      address: '45 Old Quay',
      notes: 'Evening street stalls',
      external_map_url: null,
      google_place_id: null,
      osm_id: 'node/101',
      is_backlog: true,
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
      place_id: 'place-1',
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
      place_id: null,
      sync_to_chronos: false,
      sort_order: 1,
      notes: null,
      created_at: '',
      updated_at: '',
    },
  ]

  const bookings: Booking[] = [
    {
      id: 'book-1',
      trip_id: trip.id,
      booking_type: 'flight',
      status: 'confirmed',
      title: 'Pacific Air AKL to HND',
      provider: 'Pacific Air',
      confirmation_code: 'ODYS99',
      quoted_cost: '1480.00',
      quoted_currency: 'NZD',
      source_reference: null,
      source_email_message_id: null,
      notes: '2x23kg checked luggage included',
      sort_order: 0,
      segments: [
        {
          id: 'seg-1',
          booking_id: 'book-1',
          segment_order: 0,
          carrier: 'Pacific Air',
          flight_or_service_number: 'PA 104',
          origin_label: 'Harbor City',
          origin_code: 'AKL',
          destination_label: 'Island Coast',
          destination_code: 'HND',
          departure_local: '2027-01-12T22:15:00',
          departure_tz: 'Pacific/Auckland',
          arrival_local: '2027-01-13T05:30:00',
          arrival_tz: 'Asia/Tokyo',
          departure_utc: '2027-01-12T09:15:00Z',
          arrival_utc: '2027-01-12T20:30:00Z',
          seat_or_cabin: '14A',
          terminal_gate: 'Gate 8',
          notes: null,
          day_offset: 1,
          projected_arrival_date: '2027-01-13',
          created_at: '',
          updated_at: '',
        },
      ],
      created_at: '',
      updated_at: '',
    },
    ...(opts.extraBookings ?? []),
  ]

  const unassignedBookings: UnassignedBooking[] = (opts.initialUnassigned ?? []).map((b) => ({
    ...b,
    segments: [...b.segments],
    attachments: [...b.attachments],
  }))

  const attachments: Attachment[] = [
    {
      id: 'att-1',
      trip_id: trip.id,
      booking_id: 'book-1',
      filename: 'boarding-pass.png',
      mime_type: 'image/png',
      size_bytes: 4096,
      sha256: 'deadbeef',
      extracted_text: null,
      created_at: '',
    },
  ]

  const routeEstimates: RouteEstimate[] = [
    {
      id: 'route-1',
      trip_id: trip.id,
      day_id: 'day-1',
      from_place_id: 'place-1',
      to_place_id: 'place-2',
      travel_mode: 'drive',
      source: 'geodesic',
      distance_meters: 820,
      duration_minutes: 6,
      geometry_geojson: null,
      manual_override: false,
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

  const trips = opts.emptyTrips ? [] : [trip]

  return {
    listTrips: async () => {
      if (initialFail) throw initialFail
      return [...trips]
    },
    createTrip: async (payload: TripCreatePayload) => {
      const created: Trip = { ...trip, id: `trip-${trips.length + 1}`, title: payload.title, slug: payload.slug, status: payload.status ?? 'planning' }
      trips.unshift(created)
      return created
    },
    updateTrip: async (_tripId: string, payload: TripUpdatePayload) => {
      if (payload.budget_nzd !== undefined) {
        trip.budget_nzd = payload.budget_nzd === null ? null : String(payload.budget_nzd)
      }
      if (payload.immich_album_id !== undefined) {
        trip.immich_album_id = payload.immich_album_id
      }
      if (payload.vault_note_path !== undefined) {
        trip.vault_note_path = payload.vault_note_path
      }
      return { ...trip }
    },
    getWorkspace: async (): Promise<TripWorkspace> => ({
      trip,
      legs: [...legs],
      days: [...days],
      itinerary_items: [...items],
      checklists: checklists.map((c) => ({ ...c, items: [...c.items] })),
      travel_notes: [...notes],
      bookings: bookings.map((b) => ({ ...b, segments: [...b.segments] })),
      attachments: [...attachments],
      places: [...places],
      route_estimates: [...routeEstimates],
    }),
    getTripBudget: async (): Promise<TripBudgetSummary> => ({
      trip_id: trip.id,
      trip_slug: trip.slug,
      plutus_tag: `trip:${trip.slug}`,
      budget_nzd: trip.budget_nzd,
      planned_nzd: '1480.00',
      actual_settled_nzd: '920.50',
      remaining_budget_nzd: '3579.50',
      variance_nzd: '-559.50',
      plutus_available: true,
      plutus_error: null,
      midas_url: `https://midas.example.test/?tag=trip:${trip.slug}`,
      missing_fx_currencies: [],
      fx_rates: {},
      planned_bookings: [
        {
          booking_id: 'book-1',
          title: 'Pacific Air AKL to HND',
          booking_type: 'flight',
          status: 'confirmed',
          quoted_cost: '1480.00',
          quoted_currency: 'NZD',
          fx_rate: '1.0',
          nzd_amount: '1480.00',
        },
      ],
      category_breakdown: [
        { category: 'Transport', total_spend_nzd: '920.50', transaction_count: 1, percentage: '100.0' },
      ],
      transactions: [
        {
          id: 1,
          transaction_date: '2027-01-12',
          account_name: 'Travel Card',
          amount: '920.50',
          currency: 'NZD',
          exchange_rate: '1.0',
          nzd_amount: '920.50',
          merchant: 'Pacific Air',
          category: 'Transport',
          raw_description: 'PACIFIC AIR',
          tags: [`trip:${trip.slug}`],
        },
      ],
    }),
    getChronosPreview: async (): Promise<ChronosPreview> => ({
      trip_id: trip.id,
      trip_slug: trip.slug,
      eligible: true,
      ineligible_reason: null,
      sync_enabled: trip.chronos_sync_enabled,
      overlay_mode: trip.chronos_overlay_mode,
      confirmed_segment_count: 1,
      synced_item_count: 0,
      anchors: [],
    }),
    syncTripToChronos: async (_tripId: string, payload?: ChronosSyncRequest): Promise<ChronosSyncResponse> => {
      if (payload?.enabled !== undefined) trip.chronos_sync_enabled = payload.enabled
      if (payload?.overlay_mode !== undefined) trip.chronos_overlay_mode = payload.overlay_mode
      return {
        trip_id: trip.id,
        trip_slug: trip.slug,
        sync_enabled: trip.chronos_sync_enabled,
        overlay_mode: trip.chronos_overlay_mode,
        overlay_active: trip.chronos_sync_enabled,
        upserted_count: trip.chronos_sync_enabled ? 1 : 0,
        deleted_count: 0,
        anchors: [],
      }
    },
    createLeg: async (_tripId: string, payload: LegCreatePayload) => {
      const created: Leg = { id: `leg-${legs.length + 1}`, trip_id: trip.id, name: payload.name, primary_city: payload.primary_city, country_code: payload.country_code ?? null, base_timezone: payload.base_timezone, start_date: payload.start_date, end_date: payload.end_date, color: payload.color ?? '#38bdf8', sort_order: legs.length, notes: null, created_at: '', updated_at: '' }
      legs.push(created)
      return created
    },
    createItineraryItem: async (_tripId: string, payload: ItineraryItemCreatePayload) => {
      const created: ItineraryItem = {
        id: `item-${items.length + 1}`, trip_id: trip.id, day_id: payload.day_id ?? null, title: payload.title,
        category: payload.category ?? 'activity', status: payload.status ?? 'planned', start_local: payload.start_local ?? null,
        start_tz: payload.start_tz ?? null, end_local: payload.end_local ?? null, end_tz: payload.end_tz ?? null,
        start_utc: null, end_utc: null, place_label: payload.place_label ?? null, place_id: payload.place_id ?? null,
        sync_to_chronos: false, sort_order: items.length, notes: null, created_at: '', updated_at: '',
      }
      items.push(created)
      return created
    },
    updateItineraryItem: async (_tripId: string, itemId: string, payload: ItineraryItemUpdatePayload) => {
      const target = items.find((i) => i.id === itemId)!
      Object.assign(target, payload)
      return { ...target }
    },
    deleteItineraryItem: async (_tripId: string, itemId: string) => {
      const idx = items.findIndex((i) => i.id === itemId)
      if (idx >= 0) items.splice(idx, 1)
    },
    createChecklist: async (_tripId: string, payload: ChecklistCreatePayload) => {
      const created: Checklist = { id: `chk-${checklists.length + 1}`, trip_id: trip.id, title: payload.title, list_type: payload.list_type ?? 'packing', sort_order: checklists.length, items: [], created_at: '', updated_at: '' }
      checklists.push(created)
      return created
    },
    createChecklistItem: async (_tripId: string, checklistId: string, payload: ChecklistItemCreatePayload) => {
      const target = checklists.find((c) => c.id === checklistId)!
      const created: ChecklistItem = { id: `chki-${target.items.length + 1}`, checklist_id: checklistId, leg_id: payload.leg_id ?? null, label: payload.label, is_completed: false, due_date: null, note: null, sort_order: target.items.length, created_at: '', updated_at: '' }
      target.items.push(created)
      return created
    },
    updateChecklistItem: async (_tripId: string, checklistId: string, itemId: string, payload: ChecklistItemUpdatePayload) => {
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
      const created: TravelNote = { id: `note-${notes.length + 1}`, trip_id: trip.id, leg_id: payload.leg_id ?? null, day_id: payload.day_id ?? null, title: payload.title, body: payload.body, is_private: Boolean(payload.is_private), sort_order: notes.length, created_at: '', updated_at: '' }
      notes.push(created)
      return created
    },
    deleteNote: async (_tripId: string, noteId: string) => {
      const idx = notes.findIndex((n) => n.id === noteId)
      if (idx >= 0) notes.splice(idx, 1)
    },
    createBooking: async (_tripId: string, payload: BookingCreatePayload) => {
      const created: Booking = {
        id: `book-${bookings.length + 1}`, trip_id: trip.id, booking_type: payload.booking_type, status: payload.status ?? 'confirmed',
        title: payload.title, provider: payload.provider ?? null, confirmation_code: payload.confirmation_code ?? null,
        quoted_cost: payload.quoted_cost ? String(payload.quoted_cost) : null, quoted_currency: payload.quoted_currency ?? null,
        source_reference: null, source_email_message_id: null, notes: payload.notes ?? null, sort_order: bookings.length,
        segments: [], created_at: '', updated_at: '',
      }
      bookings.push(created)
      return created
    },
    updateBooking: async (_tripId: string, bookingId: string, payload: BookingUpdatePayload) => {
      const target = bookings.find((b) => b.id === bookingId)!
      Object.assign(target, payload)
      return { ...target }
    },
    confirmBooking: async (_tripId: string, bookingId: string) => {
      const target = bookings.find((b) => b.id === bookingId)!
      target.status = 'confirmed'
      return { ...target }
    },
    deleteBooking: async (_tripId: string, bookingId: string) => {
      const idx = bookings.findIndex((b) => b.id === bookingId)
      if (idx >= 0) bookings.splice(idx, 1)
    },
    listUnassignedBookings: async () =>
      unassignedBookings.map((b) => ({
        ...b,
        segments: [...b.segments],
        attachments: [...b.attachments],
      })),
    assignUnassignedBooking: async (bookingId: string, payload: AssignBookingPayload) => {
      const idx = unassignedBookings.findIndex((b) => b.id === bookingId)
      const target = unassignedBookings[idx]
      unassignedBookings.splice(idx, 1)
      const { attachments: movedAttachments, ...bookingFields } = target
      const assigned: Booking = {
        ...bookingFields,
        trip_id: payload.trip_id,
        status: payload.confirm === false ? 'draft' : 'confirmed',
      }
      bookings.push(assigned)
      for (const att of movedAttachments) {
        attachments.push({ ...att, trip_id: payload.trip_id })
      }
      return assigned
    },
    deleteUnassignedBooking: async (bookingId: string) => {
      const idx = unassignedBookings.findIndex((b) => b.id === bookingId)
      if (idx >= 0) unassignedBookings.splice(idx, 1)
    },
    unassignedAttachmentContentUrl: (bookingId: string, attachmentId: string) =>
      `/api/bookings/unassigned/${bookingId}/attachments/${attachmentId}/content`,
    uploadAttachment: async (_tripId: string, file: File, bookingId?: string | null) => {
      const created: Attachment = { id: `att-${attachments.length + 1}`, trip_id: trip.id, booking_id: bookingId ?? null, filename: file.name, mime_type: file.type || 'application/pdf', size_bytes: file.size || 256, sha256: 'hash', extracted_text: null, created_at: '' }
      attachments.push(created)
      return created
    },
    deleteAttachment: async (_tripId: string, attachmentId: string) => {
      const idx = attachments.findIndex((a) => a.id === attachmentId)
      if (idx >= 0) attachments.splice(idx, 1)
    },
    attachmentContentUrl: (tripId: string, attachmentId: string) => `/api/trips/${tripId}/attachments/${attachmentId}/content`,
    createPlace: async (_tripId: string, payload: PlaceCreatePayload) => {
      const created: Place = {
        id: `place-${places.length + 1}`, trip_id: trip.id, name: payload.name, category: payload.category ?? 'other',
        latitude: payload.latitude, longitude: payload.longitude, address: payload.address ?? null, notes: payload.notes ?? null,
        external_map_url: payload.external_map_url ?? null, google_place_id: payload.google_place_id ?? null,
        osm_id: payload.osm_id ?? null, is_backlog: Boolean(payload.is_backlog), created_at: '', updated_at: '',
      }
      places.push(created)
      return created
    },
    updatePlace: async (_tripId: string, placeId: string, payload: PlaceUpdatePayload) => {
      const target = places.find((p) => p.id === placeId)!
      Object.assign(target, payload)
      return { ...target }
    },
    deletePlace: async (_tripId: string, placeId: string) => {
      const idx = places.findIndex((p) => p.id === placeId)
      if (idx >= 0) places.splice(idx, 1)
    },
    searchPlaces: async () => [
      { name: 'Harbour View Hotel', latitude: -36.8442, longitude: 174.7615, address: '12 Quay Street', osm_id: 'node/555', category_hint: 'lodging' },
    ],
    resolvePlaceUrl: async () => {
      throw new OdysseusApiError({ status: 422, detail: 'Share URL has no coordinates', path: '/places/resolve-url' })
    },
    computeDayRoutes: async (_tripId: string, dayId: string, travelMode: TravelMode): Promise<DayRoutesComputeResponse> => {
      routeEstimates[0] = { ...routeEstimates[0], travel_mode: travelMode, source: 'geodesic', duration_minutes: 11 }
      return { day_id: dayId, routes: [...routeEstimates], fallback_used: true, warning: 'OSRM unreachable; using geodesic fallback.' }
    },
    updateRouteEstimate: async (_tripId: string, routeId: string, payload: RouteEstimateUpdatePayload) => {
      const target = routeEstimates.find((r) => r.id === routeId)!
      Object.assign(target, payload, { source: 'manual' })
      return { ...target }
    },
    getOfflineBundle: async (): Promise<OfflineBundle> => ({
      bundle_version: 1,
      generated_at: '2027-01-01T00:00:00Z',
      workspace_sha256: 'ws-sha',
      workspace: {
        trip,
        legs: [...legs],
        days: [...days],
        itinerary_items: [...items],
        checklists: checklists.map((c) => ({ ...c, items: [...c.items] })),
        travel_notes: [...notes],
        bookings: bookings.map((b) => ({ ...b, segments: [...b.segments] })),
        attachments: [...attachments],
        places: [...places],
        route_estimates: [...routeEstimates],
        map_packs: [],
      },
      attachments: [],
      map_packs: [],
    }),
    listMapPacks: async (): Promise<MapPack[]> => [],
    createMapPack: async (_tripId: string, payload: MapPackCreatePayload): Promise<MapPack> => ({
      id: 'pack-1',
      trip_id: trip.id,
      leg_id: payload.leg_id ?? null,
      label: payload.label ?? 'Harbor Pack',
      status: 'ready',
      bbox_west: 174.0,
      bbox_south: -37.0,
      bbox_east: 175.0,
      bbox_north: -36.0,
      max_zoom: payload.max_zoom ?? 14,
      filename: 'harbor.pmtiles',
      size_bytes: 130,
      sha256: 'sha-pack',
      error_message: null,
      created_at: '',
      updated_at: '',
    }),
    deleteMapPack: async () => {},
    mapPackFileUrl: (tripId: string, packId: string) => `/api/trips/${tripId}/mappacks/${packId}/file`,
    listShareTokens: async (): Promise<ShareToken[]> => [],
    createShareToken: async (_tripId: string, payload: ShareTokenCreatePayload): Promise<ShareToken> => ({
      id: 'st-1',
      trip_id: trip.id,
      token: 'tok-synthetic-1',
      label: payload.label ?? null,
      include_pnrs: Boolean(payload.include_pnrs),
      include_attachments: Boolean(payload.include_attachments),
      include_costs: Boolean(payload.include_costs),
      include_checklists: Boolean(payload.include_checklists),
      include_private_notes: Boolean(payload.include_private_notes),
      expires_at: payload.expires_at ?? null,
      revoked_at: null,
      created_at: '',
      updated_at: '',
      is_active: true,
    }),
    updateShareToken: async (_tripId: string, tokenId: string, payload: ShareTokenUpdatePayload): Promise<ShareToken> => ({
      id: tokenId,
      trip_id: trip.id,
      token: 'tok-synthetic-1',
      label: payload.label ?? null,
      include_pnrs: Boolean(payload.include_pnrs),
      include_attachments: Boolean(payload.include_attachments),
      include_costs: Boolean(payload.include_costs),
      include_checklists: Boolean(payload.include_checklists),
      include_private_notes: Boolean(payload.include_private_notes),
      expires_at: payload.expires_at ?? null,
      revoked_at: null,
      created_at: '',
      updated_at: '',
      is_active: true,
    }),
    rotateShareToken: async (_tripId: string, tokenId: string): Promise<ShareToken> => ({
      id: `${tokenId}-rot`,
      trip_id: trip.id,
      token: 'tok-synthetic-rotated',
      label: null,
      include_pnrs: false,
      include_attachments: false,
      include_costs: false,
      include_checklists: false,
      include_private_notes: false,
      expires_at: null,
      revoked_at: null,
      created_at: '',
      updated_at: '',
      is_active: true,
    }),
    revokeShareToken: async (_tripId: string, tokenId: string): Promise<ShareToken> => ({
      id: tokenId,
      trip_id: trip.id,
      token: 'tok-synthetic-1',
      label: null,
      include_pnrs: false,
      include_attachments: false,
      include_costs: false,
      include_checklists: false,
      include_private_notes: false,
      expires_at: null,
      revoked_at: '2027-01-02T00:00:00Z',
      created_at: '',
      updated_at: '',
      is_active: false,
    }),
    deleteShareToken: async () => {},
    getSharedTrip: async (): Promise<SharedTripView> => ({
      visibility: {
        include_pnrs: false,
        include_attachments: false,
        include_costs: false,
        include_checklists: false,
        include_private_notes: false,
      },
      trip,
      legs: [...legs],
      days: [...days],
      itinerary_items: [...items],
      checklists: [],
      travel_notes: [],
      bookings: [],
      attachments: [],
      places: [...places],
      route_estimates: [...routeEstimates],
    }),
    sharedAttachmentContentUrl: (token: string, attachmentId: string) =>
      `/api/share/${token}/attachments/${attachmentId}/content`,
    getTripPhotos: async (): Promise<TripPhotosResponse> => {
      opts.onGetTripPhotos?.()
      if (opts.photosError) throw opts.photosError
      return (
        opts.photosResponse ?? {
          trip_id: trip.id,
          status: 'available',
          source: 'date_range',
          message: null,
          total_photos: 0,
          days: [],
          ungrouped_photos: [],
        }
      )
    },
    exportTripMarkdown: async (): Promise<string> =>
      opts.markdownExport ??
      `---\ntype: trip-snapshot\ntrip_slug: ${trip.slug}\n---\n# ${trip.title}\n`,
  }
}

beforeEach(() => {
  window.scrollTo = vi.fn()
  window.localStorage.clear()
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Odysseus Wave 3 Workspace Shell', () => {
  it('renders overlapping legs, projected +1 arrival card, bookings PNR, and map fallback', async () => {
    const adapter = createSyntheticAdapter()
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)

    const headings = await screen.findAllByRole('heading', { name: 'Pacific Explorer' })
    expect(headings.length).toBeGreaterThan(0)
    const dayOneCards = screen.getAllByTestId('day-card-2027-01-12')
    expect(dayOneCards[0]).toHaveTextContent('Harbor City')
    expect(dayOneCards[0]).toHaveTextContent('Island Coast')
    expect(dayOneCards[0]).toHaveTextContent('Pacific Air AKL to HND')

    const dayTwoCards = screen.getAllByTestId('day-card-2027-01-13')
    expect(dayTwoCards[0]).toHaveTextContent('Arrival: Pacific Air AKL to HND')
    expect(dayTwoCards[0]).toHaveTextContent('+1')

    expect(screen.getAllByText('ODYS99').length).toBeGreaterThan(0)
    expect(screen.getByTestId('map-preview-panel')).toBeInTheDocument()
  })

  it('toggles checklist item and adds new itinerary item via modal', async () => {
    const adapter = createSyntheticAdapter()
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)
    await screen.findAllByRole('heading', { name: 'Pacific Explorer' })

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Travel adapter' }))
    await waitFor(() => {
      expect(screen.getByText('1/1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Activity' })[0])
    const titleInput = await screen.findByLabelText(/Activity Title/)
    fireEvent.change(titleInput, { target: { value: 'Lighthouse Walk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Item' }))

    expect((await screen.findAllByText('Lighthouse Walk')).length).toBeGreaterThan(0)
  })

  it('opens inline attachment viewer with download link and zero window.open calls', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const adapter = createSyntheticAdapter()
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)
    await screen.findAllByRole('heading', { name: 'Pacific Explorer' })

    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0])
    const modal = await screen.findByTestId('pdf-viewer-modal')
    expect(modal).toBeInTheDocument()
    const downloadLink = modal.querySelector('a[download="boarding-pass.png"]')
    expect(downloadLink).toHaveAttribute('href', '/api/trips/trip-1/attachments/att-1/content')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('handles triple-path Place entry (Photon search + 422 Google URL fallback to manual pin)', async () => {
    const adapter = createSyntheticAdapter()
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)
    await screen.findAllByRole('heading', { name: 'Pacific Explorer' })

    fireEvent.click(screen.getByRole('button', { name: 'Add Place' }))
    const searchInput = await screen.findByTestId('place-photon-search')
    fireEvent.change(searchInput, { target: { value: 'Harbour View' } })

    const candidateBtn = await screen.findByText('Harbour View Hotel', {}, { timeout: 2500 })
    fireEvent.click(candidateBtn)
    expect(screen.getByLabelText(/Place Name/)).toHaveValue('Harbour View Hotel')

    fireEvent.click(screen.getByRole('tab', { name: 'Paste Google Link' }))
    const urlInput = await screen.findByLabelText('Google Maps Share URL')
    fireEvent.change(urlInput, { target: { value: 'https://maps.app.goo.gl/xyz123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resolve Link' }))

    expect(await screen.findByText(/Manual Pin Fallback/)).toBeInTheDocument()
    expect(screen.getByLabelText('External Map URL')).toHaveValue('https://maps.app.goo.gl/xyz123')

    const addPlaceButtons = screen.getAllByRole('button', { name: 'Add Place' })
    fireEvent.click(addPlaceButtons[addPlaceButtons.length - 1])
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Add Trip Place' })).not.toBeInTheDocument()
    })
  })

  it('computes day routes showing OSRM fallback warning and overrides duration', async () => {
    const adapter = createSyntheticAdapter()
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)
    await screen.findAllByRole('heading', { name: 'Pacific Explorer' })

    fireEvent.click(screen.getByRole('button', { name: 'Estimate Road Route' }))
    expect(await screen.findByText('OSRM unreachable; using geodesic fallback.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Override' }))
    const durationInput = await screen.findByLabelText('Override duration minutes')
    fireEvent.change(durationInput, { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText(/18 min/)).toBeInTheDocument()
    })
  })

  it('displays fail-loud API error banner when initial load fails', async () => {
    const adapter = createSyntheticAdapter(
      new OdysseusApiError({ status: 503, detail: 'Database offline', path: '/trips' }),
    )
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Odysseus API Error')
    expect(alert).toHaveTextContent('Database offline')
  })

  it('keeps modal open and renders inline error alert when save rejects with 422', async () => {
    const adapter = createSyntheticAdapter()
    adapter.createItineraryItem = async () => {
      throw new OdysseusApiError({
        status: 422,
        detail: 'Invalid IANA timezone: Mars/Phobos',
        path: '/trips/trip-1/itinerary-items',
      })
    }
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)

    await screen.findAllByRole('heading', { name: 'Pacific Explorer' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Activity' })[0])
    fireEvent.change(await screen.findByLabelText(/Activity Title/), { target: { value: 'Ferry Hop' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Item' }))

    expect(await screen.findByText('Invalid IANA timezone: Mars/Phobos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add Itinerary Item' })).toBeInTheDocument()
  })

  it('hydrates cached trip in Offline Read-Only mode and disables all mutation controls', async () => {
    const adapter = createSyntheticAdapter()
    const storage = new InMemoryOfflineStorageAdapter()
    const workspace = await adapter.getWorkspace('trip-1')
    await storage.putTripRecord({
      tripId: 'trip-1',
      syncedAt: '2027-01-10T10:00:00Z',
      workspaceSha256: 'ws-sha',
      workspace,
      attachmentIds: ['att-1'],
      mapPackIds: [],
      totalBytes: 4096,
      includesMapPacks: false,
    })

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    const listTripsSpy = vi.spyOn(adapter, 'listTrips')

    render(<App adapter={adapter} offlineStorage={storage} />)

    expect(await screen.findByText('Offline Read-Only')).toBeInTheDocument()
    expect(listTripsSpy).not.toHaveBeenCalled()
    expect((await screen.findAllByRole('heading', { name: 'Pacific Explorer' })).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Add Activity' })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Add Booking' })[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Place' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Estimate Road Route' })).toBeDisabled()
  })

  it('renders cached attachment Blob offline via createObjectURL without network fetch', async () => {
    const adapter = createSyntheticAdapter()
    const storage = new InMemoryOfflineStorageAdapter()
    const workspace = await adapter.getWorkspace('trip-1')
    workspace.attachments = [
      {
        id: 'att-pdf',
        trip_id: 'trip-1',
        booking_id: 'book-1',
        filename: 'offline-voucher.pdf',
        mime_type: 'application/pdf',
        size_bytes: 16,
        sha256: 'sha-pdf',
        extracted_text: null,
        created_at: '',
      },
    ]
    await storage.putTripRecord({
      tripId: 'trip-1',
      syncedAt: '2027-01-10T10:00:00Z',
      workspaceSha256: 'ws-sha',
      workspace,
      attachmentIds: ['att-pdf'],
      mapPackIds: [],
      totalBytes: 16,
      includesMapPacks: false,
    })
    await storage.putAttachmentBlob({
      attachmentId: 'att-pdf',
      tripId: 'trip-1',
      sha256: 'sha-pdf',
      filename: 'offline-voucher.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 16,
      blob: new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }),
    })

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    const createUrlSpy = vi.fn().mockReturnValue('blob:offline-pdf-url')
    const revokeUrlSpy = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrlSpy })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrlSpy })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<App adapter={adapter} offlineStorage={storage} />)
    await screen.findAllByRole('heading', { name: 'Pacific Explorer' })

    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0])
    const modal = await screen.findByTestId('pdf-viewer-modal')
    expect(modal).toBeInTheDocument()
    await waitFor(() => {
      expect(modal.querySelector('a[download="offline-voucher.pdf"]')).toHaveAttribute('href', 'blob:offline-pdf-url')
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

function makeSampleUnassigned(overrides?: Partial<UnassignedBooking>): UnassignedBooking {
  return {
    id: 'ub-1',
    trip_id: null,
    booking_type: 'lodging',
    status: 'draft',
    title: 'Harbour Lodge Reservation',
    provider: 'Harbour Lodge',
    confirmation_code: 'HTL552',
    quoted_cost: '420.50',
    quoted_currency: 'SGD',
    source_reference: 'iris-email-202',
    source_email_message_id: '<msg-202@hotel.example>',
    raw_email_payload: {
      from_address: 'Harbour Lodge <reservations@harbourlodge.example>',
      subject: 'Fwd: Harbour Lodge Reservation',
      excerpt: 'Check-in 2027-09-10 for Alex Tan. Total SGD 420.50.',
    },
    notes: 'From: reservations@harbourlodge.example',
    sort_order: 0,
    segments: [],
    attachments: [
      {
        id: 'uatt-1',
        trip_id: null,
        booking_id: 'ub-1',
        filename: 'hotel-voucher.pdf',
        mime_type: 'application/pdf',
        size_bytes: 2048,
        sha256: 'sha-unassigned-1',
        extracted_text: 'Harbour Lodge HTL552',
        created_at: '',
      },
    ],
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('Ticket 10 Inbound Email Bookings & Draft Review', () => {
  it('renders InboundBookingsInbox when 0 trips exist and dismisses unassigned booking', async () => {
    const adapter = createSyntheticAdapter({
      emptyTrips: true,
      initialUnassigned: [makeSampleUnassigned()],
    })
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)

    const inbox = await screen.findByTestId('inbound-bookings-inbox')
    expect(inbox).toHaveTextContent('Inbound Bookings Inbox (1)')
    expect(inbox).toHaveTextContent('Harbour Lodge Reservation')
    expect(inbox).toHaveTextContent('HTL552')
    expect(screen.getByRole('button', { name: 'Assign & Confirm' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Assign Draft' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => {
      expect(screen.queryByTestId('inbound-bookings-inbox')).not.toBeInTheDocument()
    })
  })

  it('views unassigned PDF inline, assigns draft, and confirms with 1-tap Confirm button', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const adapter = createSyntheticAdapter({
      initialUnassigned: [makeSampleUnassigned()],
    })
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)

    const inbox = (await screen.findAllByTestId('inbound-bookings-inbox'))[0]
    const viewButtons = inbox.querySelectorAll('button')
    const viewBtn = Array.from(viewButtons).find((btn) => btn.textContent?.includes('View'))!
    fireEvent.click(viewBtn)

    const pdfModal = await screen.findByTestId('pdf-viewer-modal')
    expect(pdfModal.querySelector('a[download="hotel-voucher.pdf"]')).toHaveAttribute(
      'href',
      '/api/bookings/unassigned/ub-1/attachments/uatt-1/content',
    )
    expect(openSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))

    fireEvent.click(screen.getAllByRole('button', { name: 'Assign Draft' })[0])
    await waitFor(() => {
      expect(screen.queryByTestId('inbound-bookings-inbox')).not.toBeInTheDocument()
    })
    expect(screen.getAllByText('Harbour Lodge Reservation').length).toBeGreaterThan(0)
    expect(screen.getAllByText('From Iris').length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm' })[0])
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    })
  })

  it('supports 1-tap Assign & Confirm directly from InboundBookingsInbox', async () => {
    const adapter = createSyntheticAdapter({
      initialUnassigned: [makeSampleUnassigned()],
    })
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)

    await screen.findAllByTestId('inbound-bookings-inbox')
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign & Confirm' })[0])

    await waitFor(() => {
      expect(screen.queryByTestId('inbound-bookings-inbox')).not.toBeInTheDocument()
    })
    expect(screen.getAllByText('Harbour Lodge Reservation').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('disables draft Confirm button when Offline Read-Only mode is active', async () => {
    const draftBooking: Booking = {
      id: 'book-draft-1',
      trip_id: 'trip-1',
      booking_type: 'transport',
      status: 'draft',
      title: 'Cook Strait Ferry Draft',
      provider: 'Bluebridge',
      confirmation_code: 'BB7788',
      quoted_cost: '210.00',
      quoted_currency: 'NZD',
      source_reference: 'iris-ferry-1',
      source_email_message_id: '<ferry-draft@ferry.example>',
      notes: 'From: bookings@bluebridge.example',
      sort_order: 1,
      segments: [],
      created_at: '',
      updated_at: '',
    }
    const adapter = createSyntheticAdapter({ extraBookings: [draftBooking] })
    const storage = new InMemoryOfflineStorageAdapter()
    const workspace = await adapter.getWorkspace('trip-1')
    await storage.putTripRecord({
      tripId: 'trip-1',
      syncedAt: '2027-01-10T10:00:00Z',
      workspaceSha256: 'ws-sha',
      workspace,
      attachmentIds: ['att-1'],
      mapPackIds: [],
      totalBytes: 2048,
      includesMapPacks: false,
    })

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    render(<App adapter={adapter} offlineStorage={storage} />)

    expect(await screen.findByText('Offline Read-Only')).toBeInTheDocument()
    expect(screen.getAllByText('From Iris').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Confirm' })[0]).toBeDisabled()
  })
})

describe('Ticket 11 Immich Photo Strip & One-Way Markdown Export', () => {
  it('renders lazy per-Day Immich thumbnails in author mode with external web links', async () => {
    const adapter = createSyntheticAdapter({
      photosResponse: {
        trip_id: 'trip-1',
        status: 'available',
        source: 'date_range',
        message: null,
        total_photos: 1,
        days: [
          {
            day_id: 'day-1',
            date: '2027-01-12',
            photos: [
              {
                asset_id: 'img-1',
                original_filename: 'ferry.jpg',
                captured_at: '2027-01-12T11:30:00Z',
                local_date: '2027-01-12',
                thumbnail_url: '/api/trips/trip-1/photos/img-1/thumbnail',
                web_url: 'https://photos.home.example/photos/img-1',
                thumbhash: null,
              },
            ],
          },
        ],
        ungrouped_photos: [],
      },
    })
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)

    const strips = await screen.findAllByTestId('day-photo-strip')
    expect(strips.length).toBeGreaterThan(0)
    const img = strips[0].querySelector('img')
    expect(img).toHaveAttribute('src', '/api/trips/trip-1/photos/img-1/thumbnail')
    expect(img).toHaveAttribute('loading', 'lazy')
    const link = strips[0].querySelector('a')
    expect(link).toHaveAttribute('href', 'https://photos.home.example/photos/img-1')
  })

  it('degrades to Immich offline banner with Retry and recovers on retry', async () => {
    let callCount = 0
    const base = createSyntheticAdapter()
    const adapter: OdysseusApiAdapter = {
      ...base,
      getTripPhotos: async () => {
        callCount += 1
        if (callCount === 1) {
          return {
            trip_id: 'trip-1',
            status: 'offline',
            source: 'album',
            message: 'Immich offline (Muspelheim asleep)',
            total_photos: 0,
            days: [],
            ungrouped_photos: [],
          }
        }
        return {
          trip_id: 'trip-1',
          status: 'available',
          source: 'album',
          message: null,
          total_photos: 1,
          days: [
            {
              day_id: 'day-1',
              date: '2027-01-12',
              photos: [
                {
                  asset_id: 'img-retry',
                  original_filename: 'recovered.jpg',
                  captured_at: null,
                  local_date: '2027-01-12',
                  thumbnail_url: '/api/trips/trip-1/photos/img-retry/thumbnail',
                  web_url: null,
                  thumbhash: null,
                },
              ],
            },
          ],
          ungrouped_photos: [],
        }
      },
    }
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)

    const banners = await screen.findAllByTestId('immich-offline-banner')
    expect(banners[0]).toHaveTextContent('Immich offline (Muspelheim asleep)')
    fireEvent.click(banners[0].querySelector('button')!)

    const strips = await screen.findAllByTestId('day-photo-strip')
    expect(strips[0].querySelector('img')).toHaveAttribute(
      'src',
      '/api/trips/trip-1/photos/img-retry/thumbnail',
    )
    expect(screen.queryByTestId('immich-offline-banner')).not.toBeInTheDocument()
  })

  it('never fetches Immich photos in offline mode or /share/:token companion mode', async () => {
    const getPhotosSpy = vi.fn()
    const adapter = createSyntheticAdapter({ onGetTripPhotos: getPhotosSpy })
    const storage = new InMemoryOfflineStorageAdapter()
    const workspace = await adapter.getWorkspace('trip-1')
    await storage.putTripRecord({
      tripId: 'trip-1',
      syncedAt: '2027-01-10T10:00:00Z',
      workspaceSha256: 'ws-sha',
      workspace,
      attachmentIds: ['att-1'],
      mapPackIds: [],
      totalBytes: 2048,
      includesMapPacks: false,
    })

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    render(<App adapter={adapter} offlineStorage={storage} />)
    expect(await screen.findByText('Offline Read-Only')).toBeInTheDocument()
    expect(getPhotosSpy).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: 'Copy Markdown' })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Download .md' })[0]).toBeDisabled()

    cleanup()
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    render(
      <App
        adapter={adapter}
        offlineStorage={storage}
        initialPath="/share/tok-synthetic-1"
      />,
    )
    expect(await screen.findByText('Shared Read-Only')).toBeInTheDocument()
    expect(getPhotosSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Copy Markdown' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trip Links' })).not.toBeInTheDocument()
  })

  it('copies Markdown, downloads .md, and updates immich_album_id and vault_note_path via Trip Links', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    })
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-md')
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const adapter = createSyntheticAdapter({
      markdownExport: '---\ntype: trip-snapshot\n---\n# Pacific Explorer\n',
    })
    render(<App adapter={adapter} offlineStorage={new InMemoryOfflineStorageAdapter()} />)

    const copyButtons = await screen.findAllByRole('button', { name: 'Copy Markdown' })
    fireEvent.click(copyButtons[0])
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('---\ntype: trip-snapshot\n---\n# Pacific Explorer\n')
    })

    const downloadButtons = screen.getAllByRole('button', { name: 'Download .md' })
    fireEvent.click(downloadButtons[0])
    await waitFor(() => {
      expect(createObjectUrlSpy).toHaveBeenCalled()
      expect(anchorClickSpy).toHaveBeenCalled()
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:mock-md')
    })

    const linksButtons = screen.getAllByRole('button', { name: 'Trip Links' })
    fireEvent.click(linksButtons[0])
    const modal = await screen.findByTestId('trip-settings-modal')
    expect(modal).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Immich Album ID'), {
      target: { value: 'album-999' },
    })
    fireEvent.change(screen.getByLabelText('Obsidian Vault Note Path'), {
      target: { value: 'second-brain/Areas/40-Leisure/Pacific Explorer.md' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Links' }))

    await waitFor(() => {
      expect(screen.queryByTestId('trip-settings-modal')).not.toBeInTheDocument()
    })
    expect(screen.getAllByTestId('vault-note-path-pill')[0]).toHaveTextContent(
      'second-brain/Areas/40-Leisure/Pacific Explorer.md',
    )
  })
})
