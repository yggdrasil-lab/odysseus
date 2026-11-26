import type { OdysseusApiAdapter } from '../api/client'
import type {
  BookingCreatePayload,
  BookingUpdatePayload,
  ChecklistCreatePayload,
  ChecklistItem,
  ChecklistItemCreatePayload,
  ItineraryItemCreatePayload,
  ItineraryItemUpdatePayload,
  LegCreatePayload,
  PlaceCreatePayload,
  PlaceUpdatePayload,
  RouteEstimateUpdatePayload,
  TravelNoteCreatePayload,
  TripCreatePayload,
} from '../types'

interface ActionHelpers {
  adapter: OdysseusApiAdapter
  runMutation: (fn: (tripId: string) => Promise<void>) => Promise<void>
  onTripCreated: (tripId: string) => Promise<void>
  onActionError: (err: unknown) => void
}

export function buildWorkspaceActions({
  adapter,
  runMutation,
  onTripCreated,
  onActionError,
}: ActionHelpers) {
  return {
    createTrip: async (payload: TripCreatePayload) => {
      try {
        const created = await adapter.createTrip(payload)
        await onTripCreated(created.id)
      } catch (err: unknown) {
        onActionError(err)
        throw err
      }
    },
    createLeg: (payload: LegCreatePayload) =>
      runMutation(async (tripId) => {
        await adapter.createLeg(tripId, payload)
      }),
    createItem: (payload: ItineraryItemCreatePayload) =>
      runMutation(async (tripId) => {
        await adapter.createItineraryItem(tripId, payload)
      }),
    updateItem: (itemId: string, payload: ItineraryItemUpdatePayload) =>
      runMutation(async (tripId) => {
        await adapter.updateItineraryItem(tripId, itemId, payload)
      }),
    deleteItem: (itemId: string) =>
      runMutation(async (tripId) => {
        await adapter.deleteItineraryItem(tripId, itemId)
      }),
    createChecklist: (payload: ChecklistCreatePayload) =>
      runMutation(async (tripId) => {
        await adapter.createChecklist(tripId, payload)
      }),
    addChecklistItem: (checklistId: string, payload: ChecklistItemCreatePayload) =>
      runMutation(async (tripId) => {
        await adapter.createChecklistItem(tripId, checklistId, payload)
      }),
    toggleChecklistItem: (checklistId: string, item: ChecklistItem) =>
      runMutation(async (tripId) => {
        await adapter.updateChecklistItem(tripId, checklistId, item.id, {
          is_completed: !item.is_completed,
        })
      }),
    deleteChecklistItem: (checklistId: string, itemId: string) =>
      runMutation(async (tripId) => {
        await adapter.deleteChecklistItem(tripId, checklistId, itemId)
      }),
    createNote: (payload: TravelNoteCreatePayload) =>
      runMutation(async (tripId) => {
        await adapter.createNote(tripId, payload)
      }),
    deleteNote: (noteId: string) =>
      runMutation(async (tripId) => {
        await adapter.deleteNote(tripId, noteId)
      }),
    createBooking: (payload: BookingCreatePayload) =>
      runMutation(async (tripId) => {
        await adapter.createBooking(tripId, payload)
      }),
    updateBooking: (bookingId: string, payload: BookingUpdatePayload) =>
      runMutation(async (tripId) => {
        await adapter.updateBooking(tripId, bookingId, payload)
      }),
    deleteBooking: (bookingId: string) =>
      runMutation(async (tripId) => {
        await adapter.deleteBooking(tripId, bookingId)
      }),
    uploadAttachment: (file: File, bookingId?: string | null) =>
      runMutation(async (tripId) => {
        await adapter.uploadAttachment(tripId, file, bookingId)
      }),
    deleteAttachment: (attachmentId: string) =>
      runMutation(async (tripId) => {
        await adapter.deleteAttachment(tripId, attachmentId)
      }),
    createPlace: (payload: PlaceCreatePayload) =>
      runMutation(async (tripId) => {
        await adapter.createPlace(tripId, payload)
      }),
    updatePlace: (placeId: string, payload: PlaceUpdatePayload) =>
      runMutation(async (tripId) => {
        await adapter.updatePlace(tripId, placeId, payload)
      }),
    deletePlace: (placeId: string) =>
      runMutation(async (tripId) => {
        await adapter.deletePlace(tripId, placeId)
      }),
    updateRouteEstimate: (routeId: string, payload: RouteEstimateUpdatePayload) =>
      runMutation(async (tripId) => {
        await adapter.updateRouteEstimate(tripId, routeId, payload)
      }),
  }
}
