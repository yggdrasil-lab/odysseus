import React from 'react'

import { BookingsHubSection } from './components/BookingsHubSection'
import { BudgetSection } from './components/BudgetSection'
import { ChecklistsAndNotesSection } from './components/ChecklistsAndNotesSection'
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
  onOpenNewChecklist: () => void
  onOpenNewNote: () => void
  onOpenNewBooking: () => void
  onEditBooking: (booking: Booking) => void
  onViewAttachment: (attachment: Attachment | SharedAttachment) => void
  onOpenAddPlace: (coords?: { lat: number; lng: number }) => void
  onEditPlace: (place: Place) => void
}

function buildSectionNodes(props: WorkspaceViewsProps) {
  const { workspace, state } = props
  const readOnly = state.isOffline
  const handleToggleDone = async (item: ItineraryItem) => {
    await state.updateItem(item.id, { status: item.status === 'done' ? 'planned' : 'done' })
  }
  const timelineNode = (
    <TripDocumentTimeline
      trips={state.trips}
      trip={workspace.trip}
      legs={workspace.legs}
      days={workspace.days}
      items={workspace.itinerary_items}
      bookings={workspace.bookings}
      places={workspace.places}
      readOnly={readOnly}
      onSelectTrip={(id) => void state.selectTrip(id)}
      onOpenNewTrip={props.onOpenNewTrip}
      onOpenNewLeg={props.onOpenNewLeg}
      onOpenNewItem={props.onOpenNewItem}
      onToggleItemDone={handleToggleDone}
      onMoveItemDay={(itemId, dayId) => state.updateItem(itemId, { day_id: dayId })}
      onDeleteItem={state.deleteItem}
    />
  )
  const bookingsNode = (
    <BookingsHubSection
      bookings={workspace.bookings}
      attachments={workspace.attachments}
      readOnly={readOnly}
      onOpenNewBooking={props.onOpenNewBooking}
      onEditBooking={props.onEditBooking}
      onDeleteBooking={state.deleteBooking}
      onUploadAttachment={state.uploadAttachment}
      onDeleteAttachment={state.deleteAttachment}
      onViewAttachment={props.onViewAttachment}
    />
  )
  const listsNode = (
    <ChecklistsAndNotesSection
      checklists={workspace.checklists}
      notes={workspace.travel_notes}
      legs={workspace.legs}
      readOnly={readOnly}
      onOpenNewChecklist={props.onOpenNewChecklist}
      onAddChecklistItem={(checklistId, label) => state.addChecklistItem(checklistId, { label })}
      onToggleChecklistItem={state.toggleChecklistItem}
      onDeleteChecklistItem={state.deleteChecklistItem}
      onOpenNewNote={props.onOpenNewNote}
      onDeleteNote={state.deleteNote}
    />
  )
  const mapNode = (
    <MapLibrePanel
      legs={workspace.legs}
      days={workspace.days}
      items={workspace.itinerary_items}
      places={workspace.places}
      routeEstimates={workspace.route_estimates}
      scope={props.mapScope}
      onChangeScope={props.onChangeMapScope}
      selectedLegId={props.mapLegId}
      onChangeLegId={props.onChangeMapLegId}
      selectedDayId={props.mapDayId}
      onChangeDayId={props.onChangeMapDayId}
      readOnly={readOnly}
      isOffline={state.isOffline}
      offlineMapPacks={state.offlineMapPacks}
      onOpenAddPlace={props.onOpenAddPlace}
      onEditPlace={props.onEditPlace}
      onDeletePlace={state.deletePlace}
      onComputeDayRoutes={state.computeDayRoutes}
      onUpdateRouteEstimate={state.updateRouteEstimate}
    />
  )
  const budgetNode = (
    <BudgetSection
      tripSlug={workspace.trip.slug}
      configuredBudgetNzd={workspace.trip.budget_nzd}
      budgetSummary={state.budgetSummary}
      budgetLoading={state.budgetLoading}
      budgetError={state.budgetError}
      isOffline={state.isOffline}
      readOnly={readOnly}
      onRefreshBudget={state.refreshBudget}
      onUpdateBudget={state.updateTripBudget}
    />
  )
  return { timelineNode, bookingsNode, listsNode, mapNode, budgetNode }
}

export const WorkspaceViews: React.FC<WorkspaceViewsProps> = (props) => {
  const { workspace, mobileTab } = props
  const { timelineNode, bookingsNode, listsNode, mapNode, budgetNode } = buildSectionNodes(props)

  return (
    <>
      <div
        data-testid="desktop-workspace"
        className="hidden lg:grid lg:grid-cols-[210px_minmax(0,1fr)_42%] lg:gap-5 lg:items-start"
      >
        <LeftJumpRail
          legs={workspace.legs}
          bookingCount={workspace.bookings.length}
          placeCount={workspace.places.length}
          backlogCount={workspace.itinerary_items.filter((i) => i.day_id === null).length}
          checklistCount={workspace.checklists.length}
          noteCount={workspace.travel_notes.length}
          onJumpToLeg={(legId) => {
            props.onChangeMapLegId(legId)
            props.onChangeMapScope('leg')
          }}
        />
        <div className="space-y-4 min-w-0">
          {timelineNode}
          {bookingsNode}
          {listsNode}
          {budgetNode}
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
