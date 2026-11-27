import React from 'react'

import type { OfflineSyncProgress } from '../offline/sync'
import type {
  Attachment,
  Booking,
  BookingCreatePayload,
  BookingUpdatePayload,
  ChecklistCreatePayload,
  ChronosPreview,
  ChronosSyncRequest,
  ChronosSyncResponse,
  Day,
  ItineraryItemCreatePayload,
  Leg,
  LegCreatePayload,
  MapPack,
  MapPackCreatePayload,
  OfflineSyncSummary,
  Place,
  PlaceCreatePayload,
  PlaceSearchCandidate,
  PlaceUpdatePayload,
  ResolvePlaceUrlResponse,
  ShareToken,
  ShareTokenCreatePayload,
  ShareTokenUpdatePayload,
  SharedAttachment,
  TravelNoteCreatePayload,
  Trip,
  TripCreatePayload,
} from '../types'
import { BookingModal } from './BookingModal'
import { ChronosSyncModal } from './ChronosSyncModal'
import { OfflineSyncModal } from './OfflineSyncModal'
import { PdfViewerModal } from './PdfViewerModal'
import { PlaceEntryModal } from './PlaceEntryModal'
import { ShareTokenModal } from './ShareTokenModal'
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
  viewingAttachment: Attachment | SharedAttachment | null
  attachmentContentUrl: string
  isOffline: boolean
  offlineBlobLoader: (attachmentId: string) => Promise<Blob | null>
  onCloseAttachmentViewer: () => void
  placeModalOpen: boolean
  editingPlace: Place | null
  initialPlaceCoords: { lat: number; lng: number } | null
  onClosePlaceModal: () => void
  onSearchPlaces: (query: string) => Promise<PlaceSearchCandidate[]>
  onResolvePlaceUrl: (url: string) => Promise<ResolvePlaceUrlResponse>
  onCreatePlace: (payload: PlaceCreatePayload) => Promise<void>
  onUpdatePlace: (placeId: string, payload: PlaceUpdatePayload) => Promise<void>
  offlineModalOpen: boolean
  onCloseOfflineModal: () => void
  activeTrip: Trip | null
  mapPacks: MapPack[]
  offlineSummary: OfflineSyncSummary | null
  syncProgress: OfflineSyncProgress | null
  isSyncing: boolean
  offlineError: string | null
  onSaveOffline: (includeMapPacks: boolean) => Promise<void>
  onClearOffline: () => Promise<void>
  onCreateMapPack: (payload: MapPackCreatePayload) => Promise<void>
  onDeleteMapPack: (packId: string) => Promise<void>
  shareModalOpen: boolean
  onCloseShareModal: () => void
  shareTokens: ShareToken[]
  shareTokensLoading: boolean
  shareTokensError: string | null
  onLoadShareTokens: () => Promise<void>
  onCreateShareToken: (payload: ShareTokenCreatePayload) => Promise<ShareToken>
  onUpdateShareToken: (tokenId: string, payload: ShareTokenUpdatePayload) => Promise<ShareToken>
  onRotateShareToken: (tokenId: string) => Promise<ShareToken>
  onRevokeShareToken: (tokenId: string) => Promise<ShareToken>
  onDeleteShareToken: (tokenId: string) => Promise<void>
  chronosModalOpen: boolean
  onCloseChronosModal: () => void
  onLoadChronosPreview: () => Promise<ChronosPreview>
  onSyncTripToChronos: (payload: ChronosSyncRequest) => Promise<ChronosSyncResponse>
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
      isOffline={props.isOffline}
      offlineBlobLoader={props.offlineBlobLoader}
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
    {props.activeTrip && (
      <OfflineSyncModal
        isOpen={props.offlineModalOpen}
        onClose={props.onCloseOfflineModal}
        trip={props.activeTrip}
        legs={props.legs}
        mapPacks={props.mapPacks}
        isOffline={props.isOffline}
        offlineSummary={props.offlineSummary}
        syncProgress={props.syncProgress}
        isSyncing={props.isSyncing}
        offlineError={props.offlineError}
        onSaveOffline={props.onSaveOffline}
        onClearOffline={props.onClearOffline}
        onCreateMapPack={props.onCreateMapPack}
        onDeleteMapPack={props.onDeleteMapPack}
      />
    )}
    {props.activeTrip && (
      <ShareTokenModal
        isOpen={props.shareModalOpen}
        onClose={props.onCloseShareModal}
        trip={props.activeTrip}
        tokens={props.shareTokens}
        loading={props.shareTokensLoading}
        error={props.shareTokensError}
        isOffline={props.isOffline}
        onLoadTokens={props.onLoadShareTokens}
        onCreateToken={props.onCreateShareToken}
        onUpdateToken={props.onUpdateShareToken}
        onRotateToken={props.onRotateShareToken}
        onRevokeToken={props.onRevokeShareToken}
        onDeleteToken={props.onDeleteShareToken}
      />
    )}
    {props.activeTrip && (
      <ChronosSyncModal
        isOpen={props.chronosModalOpen}
        onClose={props.onCloseChronosModal}
        trip={props.activeTrip}
        isOffline={props.isOffline}
        onLoadPreview={props.onLoadChronosPreview}
        onSync={props.onSyncTripToChronos}
      />
    )}
  </>
)
