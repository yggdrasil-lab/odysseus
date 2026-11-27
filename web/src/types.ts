export type TripStatus = 'planning' | 'booked' | 'active' | 'completed' | 'archived'

export type ItemCategory = 'activity' | 'food' | 'transit' | 'lodging' | 'flight' | 'other'

export type ItemStatus = 'idea' | 'planned' | 'confirmed' | 'done' | 'skipped'

export type ChecklistType = 'packing' | 'prep' | 'shopping' | 'custom'

export type MobileTab = 'itinerary' | 'map' | 'bookings' | 'lists' | 'budget'

export type SharedTab = 'itinerary' | 'map' | 'bookings' | 'lists'

export type MapScope = 'trip' | 'leg' | 'day'

export type BookingType = 'flight' | 'lodging' | 'transport' | 'activity' | 'insurance'

export type BookingStatus = 'draft' | 'pending' | 'confirmed' | 'cancelled'

export type PlaceCategory = 'lodging' | 'airport' | 'food' | 'activity' | 'transit' | 'other'

export type TravelMode = 'walk' | 'drive' | 'transit' | 'flight' | 'ferry'

export type RouteSource = 'geodesic' | 'osrm' | 'manual'

export type MapPackStatus = 'ready' | 'failed'

export type ChronosOverlayMode = 'suppress_all_grid_blocks' | 'keep_work_blocks'

export type ChronosNudgeMode = 'none' | 'boundary'

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
  chronos_overlay_mode: ChronosOverlayMode
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
  raw_email_payload?: Record<string, unknown> | null
  notes: string | null
  sort_order: number
  segments: BookingSegment[]
  created_at: string
  updated_at: string
}

export interface UnassignedBooking extends Booking {
  attachments: Attachment[]
}

export interface AssignBookingPayload {
  trip_id: string
  confirm?: boolean
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
  trip_id: string | null
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

export interface MapPack {
  id: string
  trip_id: string
  leg_id: string | null
  label: string
  status: MapPackStatus
  bbox_west: number
  bbox_south: number
  bbox_east: number
  bbox_north: number
  max_zoom: number
  filename: string
  size_bytes: number
  sha256: string
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface MapPackCreatePayload {
  leg_id?: string | null
  label?: string | null
  bbox_west?: number | null
  bbox_south?: number | null
  bbox_east?: number | null
  bbox_north?: number | null
  max_zoom?: number
  source_url?: string | null
}

export interface OfflineBundleAttachmentManifest {
  id: string
  booking_id: string | null
  filename: string
  mime_type: string
  size_bytes: number
  sha256: string
  content_url: string
}

export interface OfflineBundleMapPackManifest {
  id: string
  leg_id: string | null
  label: string
  filename: string
  size_bytes: number
  sha256: string
  max_zoom: number
  bbox_west: number
  bbox_south: number
  bbox_east: number
  bbox_north: number
  file_url: string
}

export interface OfflineBundle {
  bundle_version: number
  generated_at: string
  workspace_sha256: string
  workspace: TripWorkspace
  attachments: OfflineBundleAttachmentManifest[]
  map_packs: OfflineBundleMapPackManifest[]
}

export interface OfflineSyncSummary {
  tripId: string
  syncedAt: string
  attachmentCount: number
  mapPackCount: number
  totalBytes: number
  includesMapPacks: boolean
}

export interface OfflineMapPackEntry {
  packId: string
  label: string
  blob: Blob
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
  map_packs?: MapPack[]
}

export interface TripCreatePayload {
  title: string
  slug: string
  status?: TripStatus
  start_date?: string | null
  end_date?: string | null
  home_timezone?: string
  budget_nzd?: number | null
  immich_album_id?: string | null
  vault_note_path?: string | null
  chronos_sync_enabled?: boolean
  chronos_overlay_mode?: ChronosOverlayMode
  summary?: string | null
}

export interface TripUpdatePayload {
  title?: string
  slug?: string
  status?: TripStatus
  start_date?: string | null
  end_date?: string | null
  home_timezone?: string
  budget_nzd?: string | number | null
  immich_album_id?: string | null
  vault_note_path?: string | null
  chronos_sync_enabled?: boolean
  chronos_overlay_mode?: ChronosOverlayMode
  summary?: string | null
}

export interface ChronosAnchorPreview {
  external_ref: string
  source_kind: 'booking_segment' | 'itinerary_item'
  source_id: string
  title: string
  target_date: string
  start_minute: number
  end_minute: number
  nudge_mode: ChronosNudgeMode
  urgent_quiet_bypass: boolean
  notes: string
}

export interface ChronosPreview {
  trip_id: string
  trip_slug: string
  eligible: boolean
  ineligible_reason: string | null
  sync_enabled: boolean
  overlay_mode: ChronosOverlayMode
  confirmed_segment_count: number
  synced_item_count: number
  anchors: ChronosAnchorPreview[]
}

export interface ChronosSyncRequest {
  enabled?: boolean
  overlay_mode?: ChronosOverlayMode
}

export interface ChronosSyncResponse {
  trip_id: string
  trip_slug: string
  sync_enabled: boolean
  overlay_mode: ChronosOverlayMode
  overlay_active: boolean
  upserted_count: number
  deleted_count: number
  anchors: ChronosAnchorPreview[]
}

export interface BudgetFxRate {
  rate: string
  rate_date: string | null
  source: string
}

export interface PlannedBookingCost {
  booking_id: string
  title: string
  booking_type: string
  status: string
  quoted_cost: string
  quoted_currency: string
  fx_rate: string | null
  nzd_amount: string | null
}

export interface BudgetCategoryActual {
  category: string
  total_spend_nzd: string
  transaction_count: number
  percentage: string
}

export interface SettledTransaction {
  id: number | string
  transaction_date: string
  account_name: string
  amount: string
  currency: string
  exchange_rate: string | null
  nzd_amount: string | null
  merchant: string | null
  category: string | null
  raw_description: string | null
  tags: string[]
}

export interface TripBudgetSummary {
  trip_id: string
  trip_slug: string
  plutus_tag: string
  budget_nzd: string | null
  planned_nzd: string | null
  actual_settled_nzd: string | null
  remaining_budget_nzd: string | null
  variance_nzd: string | null
  plutus_available: boolean
  plutus_error: string | null
  midas_url: string | null
  missing_fx_currencies: string[]
  fx_rates: Record<string, BudgetFxRate>
  planned_bookings: PlannedBookingCost[]
  category_breakdown: BudgetCategoryActual[]
  transactions: SettledTransaction[]
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
  sync_to_chronos?: boolean
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
  sync_to_chronos?: boolean
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

export interface ShareVisibility {
  include_pnrs: boolean
  include_attachments: boolean
  include_costs: boolean
  include_checklists: boolean
  include_private_notes: boolean
}

export interface ShareToken {
  id: string
  trip_id: string
  token: string
  label: string | null
  include_pnrs: boolean
  include_attachments: boolean
  include_costs: boolean
  include_checklists: boolean
  include_private_notes: boolean
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
  is_active: boolean
}

export interface ShareTokenCreatePayload {
  label?: string | null
  include_pnrs?: boolean
  include_attachments?: boolean
  include_costs?: boolean
  include_checklists?: boolean
  include_private_notes?: boolean
  expires_at?: string | null
}

export interface ShareTokenUpdatePayload {
  label?: string | null
  include_pnrs?: boolean
  include_attachments?: boolean
  include_costs?: boolean
  include_checklists?: boolean
  include_private_notes?: boolean
  expires_at?: string | null
}

export interface SharedTripSummary {
  id: string
  title: string
  slug: string
  status: TripStatus
  start_date: string | null
  end_date: string | null
  home_timezone: string
  budget_nzd: string | null
  summary: string | null
  created_at: string
  updated_at: string
}

export interface SharedBooking {
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
  notes: string | null
  sort_order: number
  segments: BookingSegment[]
  created_at: string
  updated_at: string
}

export interface SharedAttachment {
  id: string
  trip_id: string
  booking_id: string | null
  filename: string
  mime_type: string
  size_bytes: number
  sha256: string
  content_url: string
  extracted_text?: string | null
  created_at: string
}

export interface SharedTripView {
  visibility: ShareVisibility
  trip: SharedTripSummary
  legs: Leg[]
  days: Day[]
  itinerary_items: ItineraryItem[]
  checklists: Checklist[]
  travel_notes: TravelNote[]
  bookings: SharedBooking[]
  attachments: SharedAttachment[]
  places: Place[]
  route_estimates: RouteEstimate[]
}

export type ImmichPhotoStatus = 'available' | 'offline' | 'unconfigured'

export type ImmichPhotoSource = 'album' | 'date_range' | 'none'

export interface ImmichPhotoItem {
  asset_id: string
  original_filename: string | null
  captured_at: string | null
  local_date: string | null
  thumbnail_url: string
  web_url: string | null
  thumbhash: string | null
}

export interface ImmichDayPhotos {
  day_id: string
  date: string
  photos: ImmichPhotoItem[]
}

export interface TripPhotosResponse {
  trip_id: string
  status: ImmichPhotoStatus
  source: ImmichPhotoSource
  message: string | null
  total_photos: number
  days: ImmichDayPhotos[]
  ungrouped_photos: ImmichPhotoItem[]
}
