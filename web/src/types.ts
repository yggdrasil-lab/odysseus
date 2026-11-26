export type TripStatus = 'planning' | 'booked' | 'active' | 'completed' | 'archived'

export type ItemCategory = 'activity' | 'food' | 'transit' | 'lodging' | 'flight' | 'other'

export type ItemStatus = 'idea' | 'planned' | 'confirmed' | 'done' | 'skipped'

export type ChecklistType = 'packing' | 'prep' | 'shopping' | 'custom'

export type MobileTab = 'itinerary' | 'map' | 'bookings' | 'lists' | 'budget'

export type MapScope = 'trip' | 'leg' | 'day'

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

export interface TripWorkspace {
  trip: Trip
  legs: Leg[]
  days: Day[]
  itinerary_items: ItineraryItem[]
  checklists: Checklist[]
  travel_notes: TravelNote[]
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
