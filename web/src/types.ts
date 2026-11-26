export type TripStatus = 'planning' | 'booked' | 'active' | 'completed' | 'archived'

export type ItemCategory = 'activity' | 'food' | 'transit' | 'lodging' | 'flight' | 'other'

export type ItemStatus = 'idea' | 'planned' | 'confirmed' | 'done' | 'skipped'

export type ChecklistType = 'packing' | 'prep' | 'shopping' | 'custom'

export type MobileTab = 'itinerary' | 'map' | 'bookings' | 'lists' | 'budget'

export type MapScope = 'trip' | 'leg' | 'day'

export type BookingType = 'flight' | 'lodging' | 'transport' | 'activity' | 'insurance'

export type BookingStatus = 'draft' | 'pending' | 'confirmed' | 'cancelled'

export type PlaceCategory = 'lodging' | 'airport' | 'food' | 'activity' | 'transit' | 'other'

export type TravelMode = 'walk' | 'drive' | 'transit' | 'flight' | 'ferry'

export type RouteSource = 'geodesic' | 'osrm' | 'manual'

export interface Trip {
  id: string
  title: string
  slug: string
  status: TripStatus
  start_date: string | null
  end_date: string | null
  home_timezone: string
  budget_nzd: string | null
  immich_album_id: string | null
  vault_note_path: string | null
  chronos_sync_enabled: boolean
  chronos_overlay_mode: string
  summary: string | null
  created_at: string
  updated_at: string
}

export interface Leg {
  id: string
  trip_id: string
  name: string
  primary_city: string
  country_code: string | null
  base_timezone: string
  start_date: string
  end_date: string
  color: string
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Day {
  id: string
  trip_id: string
  date: string
  title: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ItineraryItem {
  id: string
  trip_id: string
  day_id: string | null
  title: string
  category: ItemCategory
  status: ItemStatus
  start_local: string | null
  start_tz: string | null
  end_local: string | null
  end_tz: string | null
  start_utc: string | null
  end_utc: string | null
  place_label: string | null
  place_id: string | null
  sync_to_chronos: boolean
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: string
  checklist_id: string
  leg_id: string | null
  label: string
  is_completed: boolean
  due_date: string | null
  note: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Checklist {
  id: string
  trip_id: string
  title: string
  list_type: ChecklistType
  sort_order: number
  items: ChecklistItem[]
  created_at: string
  updated_at: string
}

export interface TravelNote {
  id: string
  trip_id: string
  leg_id: string | null
  day_id: string | null
  title: string
  body: string
  is_private: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface BookingSegment {
  id: string
  booking_id: string
  segment_order: number
  carrier: string | null
  flight_or_service_number: string | null
  origin_label: string
  origin_code: string | null
  destination_label: string
  destination_code: string | null
  departure_local: string
  departure_tz: string
  arrival_local: string
  arrival_tz: string
  departure_utc: string
  arrival_utc: string
  seat_or_cabin: string | null
  terminal_gate: string | null
  notes: string | null
  day_offset: number
  projected_arrival_date: string | null
  created_at: string
  updated_at: string
}

export interface BookingSegmentCreatePayload {
  segment_order?: number
  carrier?: string | null
  flight_or_service_number?: string | null
  origin_label: string
  origin_code?: string | null
  destination_label: string
  destination_code?: string | null
  departure_local: string
  departure_tz: string
  arrival_local: string
  arrival_tz: string
  seat_or_cabin?: string | null
  terminal_gate?: string | null
  notes?: string | null
}

export interface Booking {
  id: string
  trip_id: string | null
  booking_type: BookingType
  status: BookingStatus
  title: string
  provider: string | null
  confirmation_code: string | null
  quoted_cost: string | null
  quoted_currency: string | null
  source_reference: string | null
  source_email_message_id: string | null
  notes: string | null
  sort_order: number
  segments: BookingSegment[]
  created_at: string
  updated_at: string
}

export interface BookingCreatePayload {
  booking_type: BookingType
  status?: BookingStatus
  title: string
  provider?: string | null
  confirmation_code?: string | null
  quoted_cost?: number | string | null
  quoted_currency?: string | null
  notes?: string | null
  sort_order?: number
  segments?: BookingSegmentCreatePayload[]
}

export interface BookingUpdatePayload {
  booking_type?: BookingType
  status?: BookingStatus
  title?: string
  provider?: string | null
  confirmation_code?: string | null
  quoted_cost?: number | string | null
  quoted_currency?: string | null
  notes?: string | null
  sort_order?: number
  segments?: BookingSegmentCreatePayload[]
}

export interface Attachment {
  id: string
  trip_id: string
  booking_id: string | null
  filename: string
  mime_type: string
  size_bytes: number
  sha256: string
  extracted_text: string | null
  created_at: string
}

export interface Place {
  id: string
  trip_id: string
  name: string
  category: PlaceCategory
  latitude: number
  longitude: number
  address: string | null
  notes: string | null
  external_map_url: string | null
  google_place_id: string | null
  osm_id: string | null
  is_backlog: boolean
  created_at: string
  updated_at: string
}

export interface PlaceCreatePayload {
  name: string
  category?: PlaceCategory
  latitude: number
  longitude: number
  address?: string | null
  notes?: string | null
  external_map_url?: string | null
  google_place_id?: string | null
  osm_id?: string | null
  is_backlog?: boolean
}

export interface PlaceUpdatePayload {
  name?: string
  category?: PlaceCategory
  latitude?: number
  longitude?: number
  address?: string | null
  notes?: string | null
  external_map_url?: string | null
  google_place_id?: string | null
  osm_id?: string | null
  is_backlog?: boolean
}

export interface PlaceSearchCandidate {
  name: string
  latitude: number
  longitude: number
  address: string | null
  osm_id: string | null
  category_hint: string | null
}

export interface ResolvePlaceUrlResponse {
  resolved_url: string
  latitude: number
  longitude: number
  suggested_name: string | null
  google_place_id: string | null
}

export interface RouteEstimate {
  id: string
  trip_id: string
  day_id: string
  from_place_id: string
  to_place_id: string
  travel_mode: TravelMode
  source: RouteSource
  distance_meters: number
  duration_minutes: number
  geometry_geojson: Record<string, unknown> | null
  manual_override: boolean
  created_at: string
  updated_at: string
}

export interface DayRoutesComputeResponse {
  day_id: string
  routes: RouteEstimate[]
  fallback_used: boolean
  warning: string | null
}

export interface RouteEstimateUpdatePayload {
  travel_mode?: TravelMode
  distance_meters?: number
  duration_minutes?: number
  geometry_geojson?: Record<string, unknown> | null
  manual_override?: boolean
}

export interface TripWorkspace {
  trip: Trip
  legs: Leg[]
  days: Day[]
  itinerary_items: ItineraryItem[]
  checklists: Checklist[]
  travel_notes: TravelNote[]
  bookings: Booking[]
  attachments: Attachment[]
  places: Place[]
  route_estimates: RouteEstimate[]
}

export interface TripCreatePayload {
  title: string
  slug: string
  status?: TripStatus
  start_date?: string | null
  end_date?: string | null
  home_timezone?: string
  budget_nzd?: number | null
  summary?: string | null
}

export interface LegCreatePayload {
  name: string
  primary_city: string
  country_code?: string | null
  base_timezone: string
  start_date: string
  end_date: string
  color?: string
  sort_order?: number
  notes?: string | null
}

export interface ItineraryItemCreatePayload {
  day_id?: string | null
  title: string
  category?: ItemCategory
  status?: ItemStatus
  start_local?: string | null
  start_tz?: string | null
  end_local?: string | null
  end_tz?: string | null
  place_label?: string | null
  place_id?: string | null
  notes?: string | null
}

export interface ItineraryItemUpdatePayload {
  day_id?: string | null
  title?: string
  category?: ItemCategory
  status?: ItemStatus
  start_local?: string | null
  start_tz?: string | null
  end_local?: string | null
  end_tz?: string | null
  place_label?: string | null
  place_id?: string | null
  notes?: string | null
}

export interface ChecklistCreatePayload {
  title: string
  list_type?: ChecklistType
}

export interface ChecklistItemCreatePayload {
  label: string
  leg_id?: string | null
  is_completed?: boolean
  due_date?: string | null
  note?: string | null
}

export interface ChecklistItemUpdatePayload {
  label?: string
  is_completed?: boolean
  leg_id?: string | null
}

export interface TravelNoteCreatePayload {
  title: string
  body: string
  is_private?: boolean
  leg_id?: string | null
  day_id?: string | null
}
