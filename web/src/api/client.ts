import { SessionExpiredError, isSessionExpiredResponse } from '@yggdrasil-lab/ui'

import type {
  Attachment,
  Booking,
  BookingCreatePayload,
  BookingUpdatePayload,
  Checklist,
  ChecklistCreatePayload,
  ChecklistItem,
  ChecklistItemCreatePayload,
  ChecklistItemUpdatePayload,
  DayRoutesComputeResponse,
  ItineraryItem,
  ItineraryItemCreatePayload,
  ItineraryItemUpdatePayload,
  Leg,
  LegCreatePayload,
  Place,
  PlaceCreatePayload,
  PlaceSearchCandidate,
  PlaceUpdatePayload,
  ResolvePlaceUrlResponse,
  RouteEstimate,
  RouteEstimateUpdatePayload,
  TravelMode,
  TravelNote,
  TravelNoteCreatePayload,
  Trip,
  TripCreatePayload,
  TripWorkspace,
} from '../types'

export { SessionExpiredError }

export class ApiRoutingError extends Error {
  readonly status: number
  readonly contentType: string
  readonly path: string

  constructor(options: { status: number; contentType: string; path: string }) {
    super(
      `Unexpected HTML response from API route ${options.path} (status ${options.status}). Check reverse proxy routing.`,
    )
    this.name = 'ApiRoutingError'
    this.status = options.status
    this.contentType = options.contentType
    this.path = options.path
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class OdysseusApiError extends Error {
  readonly status: number
  readonly detail: string
  readonly path: string

  constructor(options: { status: number; detail: string; path: string }) {
    super(`API error (${options.status}) on ${options.path}: ${options.detail}`)
    this.name = 'OdysseusApiError'
    this.status = options.status
    this.detail = options.detail
    this.path = options.path
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface OdysseusApiAdapter {
  listTrips(signal?: AbortSignal): Promise<Trip[]>
  createTrip(payload: TripCreatePayload): Promise<Trip>
  getWorkspace(tripId: string, signal?: AbortSignal): Promise<TripWorkspace>
  createLeg(tripId: string, payload: LegCreatePayload): Promise<Leg>
  createItineraryItem(tripId: string, payload: ItineraryItemCreatePayload): Promise<ItineraryItem>
  updateItineraryItem(
    tripId: string,
    itemId: string,
    payload: ItineraryItemUpdatePayload,
  ): Promise<ItineraryItem>
  deleteItineraryItem(tripId: string, itemId: string): Promise<void>
  createChecklist(tripId: string, payload: ChecklistCreatePayload): Promise<Checklist>
  createChecklistItem(
    tripId: string,
    checklistId: string,
    payload: ChecklistItemCreatePayload,
  ): Promise<ChecklistItem>
  updateChecklistItem(
    tripId: string,
    checklistId: string,
    itemId: string,
    payload: ChecklistItemUpdatePayload,
  ): Promise<ChecklistItem>
  deleteChecklistItem(tripId: string, checklistId: string, itemId: string): Promise<void>
  createNote(tripId: string, payload: TravelNoteCreatePayload): Promise<TravelNote>
  deleteNote(tripId: string, noteId: string): Promise<void>
  createBooking(tripId: string, payload: BookingCreatePayload): Promise<Booking>
  updateBooking(tripId: string, bookingId: string, payload: BookingUpdatePayload): Promise<Booking>
  deleteBooking(tripId: string, bookingId: string): Promise<void>
  uploadAttachment(tripId: string, file: File, bookingId?: string | null): Promise<Attachment>
  deleteAttachment(tripId: string, attachmentId: string): Promise<void>
  attachmentContentUrl(tripId: string, attachmentId: string): string
  createPlace(tripId: string, payload: PlaceCreatePayload): Promise<Place>
  updatePlace(tripId: string, placeId: string, payload: PlaceUpdatePayload): Promise<Place>
  deletePlace(tripId: string, placeId: string): Promise<void>
  searchPlaces(tripId: string, query: string): Promise<PlaceSearchCandidate[]>
  resolvePlaceUrl(tripId: string, url: string): Promise<ResolvePlaceUrlResponse>
  computeDayRoutes(
    tripId: string,
    dayId: string,
    travelMode: TravelMode,
  ): Promise<DayRoutesComputeResponse>
  updateRouteEstimate(
    tripId: string,
    routeId: string,
    payload: RouteEstimateUpdatePayload,
  ): Promise<RouteEstimate>
}

function isAuthentikGateResponse(response: Response): boolean {
  const url = response.url || ''
  if (
    response.status === 401 ||
    response.status === 403 ||
    (response.status >= 300 && response.status < 400) ||
    response.redirected ||
    url.includes('/outpost.goauthentik.io/') ||
    url.includes('/flows/executor/')
  ) {
    return true
  }
  return false
}

async function extractErrorDetail(response: Response): Promise<string> {
  const rawText = await response.text()
  if (!rawText) return response.statusText || 'Unknown error'
  try {
    const parsed = JSON.parse(rawText) as { detail?: unknown }
    if (typeof parsed.detail === 'string') return parsed.detail
  } catch {
    // Non-JSON error body; fall through to raw text
  }
  return rawText
}

export class OdysseusHttpAdapter implements OdysseusApiAdapter {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options?: { baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.baseUrl = options?.baseUrl ?? '/api'
    this.fetchImpl = options?.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const isMultipart = init?.body instanceof FormData
    const headers: HeadersInit = isMultipart
      ? { ...(init?.headers ?? {}) }
      : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      cache: 'no-store',
      ...init,
      headers,
    })

    if (isAuthentikGateResponse(response)) {
      throw new SessionExpiredError(
        `Session expired or unauthorized (${response.status}) on ${path}`,
        {
          status: response.status,
          contentType: response.headers.get('content-type') || '',
          url: response.url,
        },
      )
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('text/html') || isSessionExpiredResponse(response)) {
      throw new ApiRoutingError({
        status: response.status,
        contentType,
        path,
      })
    }

    if (!response.ok) {
      const detail = await extractErrorDetail(response)
      throw new OdysseusApiError({ status: response.status, detail, path })
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  listTrips(signal?: AbortSignal): Promise<Trip[]> {
    return this.request<Trip[]>('/trips', { signal })
  }

  createTrip(payload: TripCreatePayload): Promise<Trip> {
    return this.request<Trip>('/trips', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  getWorkspace(tripId: string, signal?: AbortSignal): Promise<TripWorkspace> {
    return this.request<TripWorkspace>(`/trips/${tripId}/workspace`, { signal })
  }

  createLeg(tripId: string, payload: LegCreatePayload): Promise<Leg> {
    return this.request<Leg>(`/trips/${tripId}/legs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  createItineraryItem(
    tripId: string,
    payload: ItineraryItemCreatePayload,
  ): Promise<ItineraryItem> {
    return this.request<ItineraryItem>(`/trips/${tripId}/itinerary-items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  updateItineraryItem(
    tripId: string,
    itemId: string,
    payload: ItineraryItemUpdatePayload,
  ): Promise<ItineraryItem> {
    return this.request<ItineraryItem>(`/trips/${tripId}/itinerary-items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  deleteItineraryItem(tripId: string, itemId: string): Promise<void> {
    return this.request<void>(`/trips/${tripId}/itinerary-items/${itemId}`, {
      method: 'DELETE',
    })
  }

  createChecklist(tripId: string, payload: ChecklistCreatePayload): Promise<Checklist> {
    return this.request<Checklist>(`/trips/${tripId}/checklists`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  createChecklistItem(
    tripId: string,
    checklistId: string,
    payload: ChecklistItemCreatePayload,
  ): Promise<ChecklistItem> {
    return this.request<ChecklistItem>(`/trips/${tripId}/checklists/${checklistId}/items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  updateChecklistItem(
    tripId: string,
    checklistId: string,
    itemId: string,
    payload: ChecklistItemUpdatePayload,
  ): Promise<ChecklistItem> {
    return this.request<ChecklistItem>(
      `/trips/${tripId}/checklists/${checklistId}/items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    )
  }

  deleteChecklistItem(tripId: string, checklistId: string, itemId: string): Promise<void> {
    return this.request<void>(`/trips/${tripId}/checklists/${checklistId}/items/${itemId}`, {
      method: 'DELETE',
    })
  }

  createNote(tripId: string, payload: TravelNoteCreatePayload): Promise<TravelNote> {
    return this.request<TravelNote>(`/trips/${tripId}/notes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  deleteNote(tripId: string, noteId: string): Promise<void> {
    return this.request<void>(`/trips/${tripId}/notes/${noteId}`, {
      method: 'DELETE',
    })
  }

  createBooking(tripId: string, payload: BookingCreatePayload): Promise<Booking> {
    return this.request<Booking>(`/trips/${tripId}/bookings`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  updateBooking(
    tripId: string,
    bookingId: string,
    payload: BookingUpdatePayload,
  ): Promise<Booking> {
    return this.request<Booking>(`/trips/${tripId}/bookings/${bookingId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  deleteBooking(tripId: string, bookingId: string): Promise<void> {
    return this.request<void>(`/trips/${tripId}/bookings/${bookingId}`, {
      method: 'DELETE',
    })
  }

  uploadAttachment(tripId: string, file: File, bookingId?: string | null): Promise<Attachment> {
    const formData = new FormData()
    formData.append('file', file)
    if (bookingId) {
      formData.append('booking_id', bookingId)
    }
    return this.request<Attachment>(`/trips/${tripId}/attachments`, {
      method: 'POST',
      body: formData,
    })
  }

  deleteAttachment(tripId: string, attachmentId: string): Promise<void> {
    return this.request<void>(`/trips/${tripId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    })
  }

  attachmentContentUrl(tripId: string, attachmentId: string): string {
    return `${this.baseUrl}/trips/${tripId}/attachments/${attachmentId}/content`
  }

  createPlace(tripId: string, payload: PlaceCreatePayload): Promise<Place> {
    return this.request<Place>(`/trips/${tripId}/places`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  updatePlace(tripId: string, placeId: string, payload: PlaceUpdatePayload): Promise<Place> {
    return this.request<Place>(`/trips/${tripId}/places/${placeId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  deletePlace(tripId: string, placeId: string): Promise<void> {
    return this.request<void>(`/trips/${tripId}/places/${placeId}`, {
      method: 'DELETE',
    })
  }

  searchPlaces(tripId: string, query: string): Promise<PlaceSearchCandidate[]> {
    const encoded = encodeURIComponent(query)
    return this.request<PlaceSearchCandidate[]>(`/trips/${tripId}/places/search?q=${encoded}`)
  }

  resolvePlaceUrl(tripId: string, url: string): Promise<ResolvePlaceUrlResponse> {
    return this.request<ResolvePlaceUrlResponse>(`/trips/${tripId}/places/resolve-url`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  }

  computeDayRoutes(
    tripId: string,
    dayId: string,
    travelMode: TravelMode,
  ): Promise<DayRoutesComputeResponse> {
    return this.request<DayRoutesComputeResponse>(`/trips/${tripId}/days/${dayId}/routes/compute`, {
      method: 'POST',
      body: JSON.stringify({ travel_mode: travelMode }),
    })
  }

  updateRouteEstimate(
    tripId: string,
    routeId: string,
    payload: RouteEstimateUpdatePayload,
  ): Promise<RouteEstimate> {
    return this.request<RouteEstimate>(`/trips/${tripId}/routes/${routeId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }
}

export function createTripSlug(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'untitled-trip'
}
