import React from 'react'

import type {
  Attachment,
  Booking,
  BookingCreatePayload,
  BookingUpdatePayload,
  ChecklistCreatePayload,
  Day,
  ItineraryItemCreatePayload,
  Leg,
  LegCreatePayload,
  Place,
  PlaceCreatePayload,
  PlaceSearchCandidate,
  PlaceUpdatePayload,
  ResolvePlaceUrlResponse,
  TravelNoteCreatePayload,
  TripCreatePayload,
} from '../types'
import { BookingModal } from './BookingModal'
import { PdfViewerModal } from './PdfViewerModal'
import { PlaceEntryModal } from './PlaceEntryModal'
import {
  CreateChecklistModal,
  CreateItemModal,
  CreateLegModal,
  CreateNoteModal,
  CreateTripModal,
} from './TripModals'

interface WorkspaceModalsProps {
  tripModalOpen: boolean
  onCloseTripModal: () => void
  onCreateTrip: (payload: TripCreatePayload) => Promise<void>
  legModalOpen: boolean
  onCloseLegModal: () => void
  onCreateLeg: (payload: LegCreatePayload) => Promise<void>
  itemModalDayId: string | null | undefined
  days: Day[]
  places: Place[]
  defaultTimezone: string
  onCloseItemModal: () => void
  onCreateItem: (payload: ItineraryItemCreatePayload) => Promise<void>
  checklistModalOpen: boolean
  onCloseChecklistModal: () => void
  onCreateChecklist: (payload: ChecklistCreatePayload) => Promise<void>
  noteModalOpen: boolean
  legs: Leg[]
  onCloseNoteModal: () => void
  onCreateNote: (payload: TravelNoteCreatePayload) => Promise<void>
  bookingModalOpen: boolean
  editingBooking: Booking | null
  onCloseBookingModal: () => void
  onCreateBooking: (payload: BookingCreatePayload) => Promise<void>
  onUpdateBooking: (bookingId: string, payload: BookingUpdatePayload) => Promise<void>
  viewingAttachment: Attachment | null
  attachmentContentUrl: string
  onCloseAttachmentViewer: () => void
  placeModalOpen: boolean
  editingPlace: Place | null
  initialPlaceCoords: { lat: number; lng: number } | null
  onClosePlaceModal: () => void
  onSearchPlaces: (query: string) => Promise<PlaceSearchCandidate[]>
  onResolvePlaceUrl: (url: string) => Promise<ResolvePlaceUrlResponse>
  onCreatePlace: (payload: PlaceCreatePayload) => Promise<void>
  onUpdatePlace: (placeId: string, payload: PlaceUpdatePayload) => Promise<void>
}

export const WorkspaceModals: React.FC<WorkspaceModalsProps> = (props) => (
  <>
    <CreateTripModal isOpen={props.tripModalOpen} onClose={props.onCloseTripModal} onSubmit={props.onCreateTrip} />
    <CreateLegModal isOpen={props.legModalOpen} onClose={props.onCloseLegModal} onSubmit={props.onCreateLeg} />
    <CreateItemModal
      isOpen={props.itemModalDayId !== undefined}
      days={props.days}
      places={props.places}
      defaultDayId={props.itemModalDayId ?? null}
      defaultTimezone={props.defaultTimezone}
      onClose={props.onCloseItemModal}
      onSubmit={props.onCreateItem}
    />
    <CreateChecklistModal isOpen={props.checklistModalOpen} onClose={props.onCloseChecklistModal} onSubmit={props.onCreateChecklist} />
    <CreateNoteModal isOpen={props.noteModalOpen} legs={props.legs} onClose={props.onCloseNoteModal} onSubmit={props.onCreateNote} />
    <BookingModal
      isOpen={props.bookingModalOpen}
      editingBooking={props.editingBooking}
      defaultTimezone={props.defaultTimezone}
      onClose={props.onCloseBookingModal}
      onCreate={props.onCreateBooking}
      onUpdate={props.onUpdateBooking}
    />
    <PdfViewerModal
      attachment={props.viewingAttachment}
      contentUrl={props.attachmentContentUrl}
      onClose={props.onCloseAttachmentViewer}
    />
    <PlaceEntryModal
      isOpen={props.placeModalOpen}
      editingPlace={props.editingPlace}
      initialCoords={props.initialPlaceCoords}
      onClose={props.onClosePlaceModal}
      onSearchPlaces={props.onSearchPlaces}
      onResolvePlaceUrl={props.onResolvePlaceUrl}
      onCreatePlace={props.onCreatePlace}
      onUpdatePlace={props.onUpdatePlace}
    />
  </>
)
