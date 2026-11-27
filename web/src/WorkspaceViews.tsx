import React from 'react'

import { BookingsHubSection } from './components/BookingsHubSection'
import { BudgetSection } from './components/BudgetSection'
import { ChecklistsAndNotesSection } from './components/ChecklistsAndNotesSection'
import { InboundBookingsInbox } from './components/InboundBookingsInbox'
import { LeftJumpRail } from './components/LeftJumpRail'
import { MapLibrePanel } from './components/MapLibrePanel'
import { TripDocumentTimeline } from './components/TripDocumentTimeline'
import type { useOdysseusWorkspace } from './hooks/useOdysseusWorkspace'
import type { Attachment, Booking, ItineraryItem, MapScope, MobileTab, Place, SharedAttachment, TripWorkspace } from './types'

export interface WorkspaceViewsProps {
  workspace: TripWorkspace
  state: ReturnType<typeof useOdysseusWorkspace>
  mobileTab: MobileTab
  mapScope: MapScope
  onChangeMapScope: (scope: MapScope) => void
  mapLegId: string
  onChangeMapLegId: (legId: string) => void
  mapDayId: string
  onChangeMapDayId: (dayId: string) => void
  onOpenNewTrip: () => void
  onOpenNewLeg: () => void
  onOpenNewItem: (dayId: string | null) => void
  onOpenChronosSync: () => void
  onOpenTripSettings: () => void
  onOpenNewChecklist: () => void
  onOpenNewNote: () => void
  onOpenNewBooking: () => void
  onEditBooking: (booking: Booking) => void
  onViewAttachment: (attachment: Attachment | SharedAttachment) => void
  onOpenAddPlace: (coords?: { lat: number; lng: number }) => void
  onEditPlace: (place: Place) => void
}

function buildTimelineNode(props: WorkspaceViewsProps) {
  const { workspace, state } = props
  const handleToggleDone = async (item: ItineraryItem) => {
    await state.updateItem(item.id, { status: item.status === 'done' ? 'planned' : 'done' })
  }
  const handleToggleChronosSync = async (item: ItineraryItem) => {
    await state.updateItem(item.id, { sync_to_chronos: !item.sync_to_chronos })
  }
  return (
    <TripDocumentTimeline
      trips={state.trips} trip={workspace.trip} legs={workspace.legs} days={workspace.days}
      items={workspace.itinerary_items} bookings={workspace.bookings} places={workspace.places}
      tripPhotos={state.tripPhotos} tripPhotosLoading={state.tripPhotosLoading}
      readOnly={state.isOffline} onSelectTrip={(id) => void state.selectTrip(id)}
      onOpenNewTrip={props.onOpenNewTrip} onOpenNewLeg={props.onOpenNewLeg} onOpenNewItem={props.onOpenNewItem}
      onOpenChronosSync={props.onOpenChronosSync} onOpenTripSettings={props.onOpenTripSettings}
      onExportMarkdown={state.exportTripMarkdown} onRetryTripPhotos={state.retryTripPhotos}
      onToggleItemDone={handleToggleDone}
      onToggleItemChronosSync={handleToggleChronosSync}
      onMoveItemDay={(itemId, dayId) => state.updateItem(itemId, { day_id: dayId })}
      onDeleteItem={state.deleteItem}
    />
  )
}

function buildBookingsAndListsNodes(props: WorkspaceViewsProps) {
  const { workspace, state } = props
  const readOnly = state.isOffline
  const bookingsNode = (
    <div className="space-y-4">
      <InboundBookingsInbox
        bookings={state.unassignedBookings}
        trips={state.trips}
        selectedTripId={state.selectedTripId}
        readOnly={readOnly}
        onAssign={state.assignUnassignedBooking}
        onDismiss={state.deleteUnassignedBooking}
        onViewAttachment={props.onViewAttachment}
      />
      <BookingsHubSection
        bookings={workspace.bookings} attachments={workspace.attachments} readOnly={readOnly}
        onOpenNewBooking={props.onOpenNewBooking} onEditBooking={props.onEditBooking}
        onConfirmBooking={state.confirmBooking}
        onDeleteBooking={state.deleteBooking} onUploadAttachment={state.uploadAttachment}
        onDeleteAttachment={state.deleteAttachment} onViewAttachment={props.onViewAttachment}
      />
    </div>
  )
  const listsNode = (
    <ChecklistsAndNotesSection
      checklists={workspace.checklists} notes={workspace.travel_notes} legs={workspace.legs} readOnly={readOnly}
      onOpenNewChecklist={props.onOpenNewChecklist}
      onAddChecklistItem={(checklistId, label) => state.addChecklistItem(checklistId, { label })}
      onToggleChecklistItem={state.toggleChecklistItem} onDeleteChecklistItem={state.deleteChecklistItem}
      onOpenNewNote={props.onOpenNewNote} onDeleteNote={state.deleteNote}
    />
  )
  return { bookingsNode, listsNode }
}

function buildMapAndBudgetNodes(props: WorkspaceViewsProps) {
  const { workspace, state } = props
  const mapNode = (
    <MapLibrePanel
      legs={workspace.legs} days={workspace.days} items={workspace.itinerary_items} places={workspace.places}
      routeEstimates={workspace.route_estimates} scope={props.mapScope} onChangeScope={props.onChangeMapScope}
      selectedLegId={props.mapLegId} onChangeLegId={props.onChangeMapLegId} selectedDayId={props.mapDayId}
      onChangeDayId={props.onChangeMapDayId} readOnly={state.isOffline} isOffline={state.isOffline}
      offlineMapPacks={state.offlineMapPacks} onOpenAddPlace={props.onOpenAddPlace} onEditPlace={props.onEditPlace}
      onDeletePlace={state.deletePlace} onComputeDayRoutes={state.computeDayRoutes} onUpdateRouteEstimate={state.updateRouteEstimate}
    />
  )
  const budgetNode = (
    <BudgetSection
      tripSlug={workspace.trip.slug} configuredBudgetNzd={workspace.trip.budget_nzd}
      budgetSummary={state.budgetSummary} budgetLoading={state.budgetLoading} budgetError={state.budgetError}
      isOffline={state.isOffline} readOnly={state.isOffline}
      onRefreshBudget={state.refreshBudget} onUpdateBudget={state.updateTripBudget}
    />
  )
  return { mapNode, budgetNode }
}

export const WorkspaceViews: React.FC<WorkspaceViewsProps> = (props) => {
  const { workspace, mobileTab } = props
  const timelineNode = buildTimelineNode(props)
  const { bookingsNode, listsNode } = buildBookingsAndListsNodes(props)
  const { mapNode, budgetNode } = buildMapAndBudgetNodes(props)
  const backlogCount = workspace.itinerary_items.filter((i) => i.day_id === null).length

  return (
    <>
      <div data-testid="desktop-workspace" className="hidden lg:grid lg:grid-cols-[210px_minmax(0,1fr)_42%] lg:gap-5 lg:items-start">
        <LeftJumpRail
          legs={workspace.legs} bookingCount={workspace.bookings.length} placeCount={workspace.places.length}
          backlogCount={backlogCount} checklistCount={workspace.checklists.length} noteCount={workspace.travel_notes.length}
          onJumpToLeg={(legId) => { props.onChangeMapLegId(legId); props.onChangeMapScope('leg') }}
        />
        <div className="space-y-4 min-w-0">
          {timelineNode}{bookingsNode}{listsNode}{budgetNode}
        </div>
        {mapNode}
      </div>
      <div data-testid="mobile-workspace" className="lg:hidden space-y-4">
        {mobileTab === 'itinerary' && timelineNode}
        {mobileTab === 'map' && mapNode}
        {mobileTab === 'bookings' && bookingsNode}
        {mobileTab === 'lists' && listsNode}
        {mobileTab === 'budget' && budgetNode}
      </div>
    </>
  )
}
