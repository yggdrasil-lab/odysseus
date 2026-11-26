import React from 'react'

import type {
  ChecklistCreatePayload,
  Day,
  ItineraryItemCreatePayload,
  Leg,
  LegCreatePayload,
  TravelNoteCreatePayload,
  TripCreatePayload,
} from '../types'
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
}

export const WorkspaceModals: React.FC<WorkspaceModalsProps> = (props) => (
  <>
    <CreateTripModal
      isOpen={props.tripModalOpen}
      onClose={props.onCloseTripModal}
      onSubmit={props.onCreateTrip}
    />
    <CreateLegModal
      isOpen={props.legModalOpen}
      onClose={props.onCloseLegModal}
      onSubmit={props.onCreateLeg}
    />
    <CreateItemModal
      isOpen={props.itemModalDayId !== undefined}
      days={props.days}
      defaultDayId={props.itemModalDayId ?? null}
      defaultTimezone={props.defaultTimezone}
      onClose={props.onCloseItemModal}
      onSubmit={props.onCreateItem}
    />
    <CreateChecklistModal
      isOpen={props.checklistModalOpen}
      onClose={props.onCloseChecklistModal}
      onSubmit={props.onCreateChecklist}
    />
    <CreateNoteModal
      isOpen={props.noteModalOpen}
      legs={props.legs}
      onClose={props.onCloseNoteModal}
      onSubmit={props.onCreateNote}
    />
  </>
)
