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

function buildCoreActions({ adapter, runMutation, onTripCreated, onActionError }: ActionHelpers) {
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
    updateTripBudget: (budgetNzd: string | null) =>
      runMutation((id) => adapter.updateTrip(id, { budget_nzd: budgetNzd }).then(() => undefined)),
    updateTripLinks: (payload: { immich_album_id: string | null; vault_note_path: string | null }) =>
      runMutation((id) => adapter.updateTrip(id, payload).then(() => undefined)),
    createLeg: (payload: LegCreatePayload) => runMutation((id) => adapter.createLeg(id, payload).then(() => undefined)),
    createItem: (payload: ItineraryItemCreatePayload) => runMutation((id) => adapter.createItineraryItem(id, payload).then(() => undefined)),
    updateItem: (itemId: string, payload: ItineraryItemUpdatePayload) => runMutation((id) => adapter.updateItineraryItem(id, itemId, payload).then(() => undefined)),
    deleteItem: (itemId: string) => runMutation((id) => adapter.deleteItineraryItem(id, itemId)),
    createChecklist: (payload: ChecklistCreatePayload) => runMutation((id) => adapter.createChecklist(id, payload).then(() => undefined)),
    addChecklistItem: (checklistId: string, payload: ChecklistItemCreatePayload) => runMutation((id) => adapter.createChecklistItem(id, checklistId, payload).then(() => undefined)),
    toggleChecklistItem: (checklistId: string, item: ChecklistItem) =>
      runMutation((id) => adapter.updateChecklistItem(id, checklistId, item.id, { is_completed: !item.is_completed }).then(() => undefined)),
    deleteChecklistItem: (checklistId: string, itemId: string) => runMutation((id) => adapter.deleteChecklistItem(id, checklistId, itemId)),
    createNote: (payload: TravelNoteCreatePayload) => runMutation((id) => adapter.createNote(id, payload).then(() => undefined)),
    deleteNote: (noteId: string) => runMutation((id) => adapter.deleteNote(id, noteId)),
  }
}

function buildBookingsAndPlacesActions({ adapter, runMutation }: Pick<ActionHelpers, 'adapter' | 'runMutation'>) {
  return {
    createBooking: (payload: BookingCreatePayload) => runMutation((id) => adapter.createBooking(id, payload).then(() => undefined)),
    updateBooking: (bookingId: string, payload: BookingUpdatePayload) => runMutation((id) => adapter.updateBooking(id, bookingId, payload).then(() => undefined)),
    confirmBooking: (bookingId: string) => runMutation((id) => adapter.confirmBooking(id, bookingId).then(() => undefined)),
    deleteBooking: (bookingId: string) => runMutation((id) => adapter.deleteBooking(id, bookingId)),
    uploadAttachment: (file: File, bookingId?: string | null) => runMutation((id) => adapter.uploadAttachment(id, file, bookingId).then(() => undefined)),
    deleteAttachment: (attachmentId: string) => runMutation((id) => adapter.deleteAttachment(id, attachmentId)),
    createPlace: (payload: PlaceCreatePayload) => runMutation((id) => adapter.createPlace(id, payload).then(() => undefined)),
    updatePlace: (placeId: string, payload: PlaceUpdatePayload) => runMutation((id) => adapter.updatePlace(id, placeId, payload).then(() => undefined)),
    deletePlace: (placeId: string) => runMutation((id) => adapter.deletePlace(id, placeId)),
    updateRouteEstimate: (routeId: string, payload: RouteEstimateUpdatePayload) =>
      runMutation((id) => adapter.updateRouteEstimate(id, routeId, payload).then(() => undefined)),
  }
}

export function buildWorkspaceActions(helpers: ActionHelpers) {
  return {
    ...buildCoreActions(helpers),
    ...buildBookingsAndPlacesActions(helpers),
  }
}
