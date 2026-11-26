import React, { useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckSquare,
  Compass,
  Map as MapIcon,
  Plus,
  Ticket,
  Wallet,
} from 'lucide-react'
import {
  AlertBanner,
  AppHeader,
  BottomNav,
  Button,
  EmptyState,
  LoadingState,
  SessionExpiredBanner,
} from '@yggdrasil-lab/ui'

import { OdysseusHttpAdapter, type OdysseusApiAdapter } from './api/client'
import { ChecklistsAndNotesSection } from './components/ChecklistsAndNotesSection'
import { LeftJumpRail } from './components/LeftJumpRail'
import { MapPreviewPanel } from './components/MapPreviewPanel'
import {
  BookingsPlaceholderCard,
  BudgetPlaceholderCard,
} from './components/PlaceholderSectionCards'
import { TripDocumentTimeline } from './components/TripDocumentTimeline'
import { WorkspaceModals } from './components/WorkspaceModals'
import { useOdysseusWorkspace, type WorkspaceErrorState } from './hooks/useOdysseusWorkspace'
import type { ItineraryItem, MapScope, MobileTab, TripWorkspace } from './types'

export interface AppProps {
  adapter?: OdysseusApiAdapter
}

const MOBILE_TABS = [
  { id: 'itinerary', label: 'Itinerary', icon: <CalendarDays className="w-4 h-4" /> },
  { id: 'map', label: 'Map', icon: <MapIcon className="w-4 h-4" /> },
  { id: 'bookings', label: 'Bookings', icon: <Ticket className="w-4 h-4" /> },
  { id: 'lists', label: 'Lists', icon: <CheckSquare className="w-4 h-4" /> },
  { id: 'budget', label: 'Budget', icon: <Wallet className="w-4 h-4" /> },
]

const WorkspaceErrorDisplay: React.FC<{
  error: WorkspaceErrorState | null
  onRetry: () => void
}> = ({ error, onRetry }) => {
  if (!error) return null
  if (error.kind === 'session') {
    return <SessionExpiredBanner onReauth={onRetry} message={error.message} />
  }
  return (
    <AlertBanner
      variant="error"
      title={error.kind === 'routing' ? 'API Routing Error' : 'Odysseus API Error'}
      action={
        <Button size="xs" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {error.message}
    </AlertBanner>
  )
}

interface WorkspaceViewsProps {
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
}

const WorkspaceViews: React.FC<WorkspaceViewsProps> = (props) => {
  const { workspace, state, mobileTab } = props
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
      onSelectTrip={(id) => void state.selectTrip(id)}
      onOpenNewTrip={props.onOpenNewTrip}
      onOpenNewLeg={props.onOpenNewLeg}
      onOpenNewItem={props.onOpenNewItem}
      onToggleItemDone={handleToggleDone}
      onMoveItemDay={(itemId, dayId) => state.updateItem(itemId, { day_id: dayId })}
      onDeleteItem={state.deleteItem}
    />
  )
  const listsNode = (
    <ChecklistsAndNotesSection
      checklists={workspace.checklists}
      notes={workspace.travel_notes}
      legs={workspace.legs}
      onOpenNewChecklist={props.onOpenNewChecklist}
      onAddChecklistItem={(checklistId, label) => state.addChecklistItem(checklistId, { label })}
      onToggleChecklistItem={state.toggleChecklistItem}
      onDeleteChecklistItem={state.deleteChecklistItem}
      onOpenNewNote={props.onOpenNewNote}
      onDeleteNote={state.deleteNote}
    />
  )
  const mapNode = (
    <MapPreviewPanel
      legs={workspace.legs}
      days={workspace.days}
      items={workspace.itinerary_items}
      scope={props.mapScope}
      onChangeScope={props.onChangeMapScope}
      selectedLegId={props.mapLegId}
      onChangeLegId={props.onChangeMapLegId}
      selectedDayId={props.mapDayId}
      onChangeDayId={props.onChangeMapDayId}
    />
  )
  return (
    <>
      <div
        data-testid="desktop-workspace"
        className="hidden lg:grid lg:grid-cols-[210px_minmax(0,1fr)_42%] lg:gap-5 lg:items-start"
      >
        <LeftJumpRail
          legs={workspace.legs}
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
          <BookingsPlaceholderCard />
          {listsNode}
          <BudgetPlaceholderCard budgetNzd={workspace.trip.budget_nzd} />
        </div>
        {mapNode}
      </div>
      <div data-testid="mobile-workspace" className="lg:hidden space-y-4">
        {mobileTab === 'itinerary' && timelineNode}
        {mobileTab === 'map' && mapNode}
        {mobileTab === 'bookings' && <BookingsPlaceholderCard />}
        {mobileTab === 'lists' && listsNode}
        {mobileTab === 'budget' && <BudgetPlaceholderCard budgetNzd={workspace.trip.budget_nzd} />}
      </div>
    </>
  )
}

function useShellUiState() {
  const [mobileTab, setMobileTab] = useState<MobileTab>('itinerary')
  const [mapScope, setMapScope] = useState<MapScope>('trip')
  const [mapLegId, setMapLegId] = useState('')
  const [mapDayId, setMapDayId] = useState('')
  const [tripModalOpen, setTripModalOpen] = useState(false)
  const [legModalOpen, setLegModalOpen] = useState(false)
  const [itemModalDayId, setItemModalDayId] = useState<string | null | undefined>(undefined)
  const [checklistModalOpen, setChecklistModalOpen] = useState(false)
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  return {
    mobileTab, setMobileTab, mapScope, setMapScope, mapLegId, setMapLegId,
    mapDayId, setMapDayId, tripModalOpen, setTripModalOpen, legModalOpen, setLegModalOpen,
    itemModalDayId, setItemModalDayId, checklistModalOpen, setChecklistModalOpen,
    noteModalOpen, setNoteModalOpen,
  }
}

export function App({ adapter }: AppProps) {
  const resolvedAdapter = useMemo(() => adapter ?? new OdysseusHttpAdapter(), [adapter])
  const state = useOdysseusWorkspace(resolvedAdapter)
  const ui = useShellUiState()
  const workspace = state.workspace
  const activeError = state.loadError ?? state.actionError

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground pb-24 lg:pb-8">
      <AppHeader
        variant="brand"
        brandIcon={<Compass className="w-4 h-4" />}
        title="Odysseus"
        subtitle={workspace ? workspace.trip.title : 'Aegean Travel Planner'}
        isRefreshing={state.isRefreshing}
        onRefresh={() => void state.refresh()}
        actions={
          <Button variant="brand" size="sm" className="min-h-[38px]" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => ui.setTripModalOpen(true)}>
            New Trip
          </Button>
        }
      />
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 pt-4 space-y-4">
        <WorkspaceErrorDisplay error={activeError} onRetry={() => void state.refresh()} />
        {state.isLoading && <LoadingState label="Loading trip workspace..." variant="brand" />}
        {!state.isLoading && !workspace && !state.loadError && (
          <EmptyState
            title="Plan your first voyage"
            description="Create a trip with flexible planning dates or locked travel dates to begin building legs, days, and checklists."
            icon={<Compass className="w-8 h-8 text-accent" />}
            action={<Button variant="brand" size="md" onClick={() => ui.setTripModalOpen(true)}>Create First Trip</Button>}
          />
        )}
        {workspace && (
          <WorkspaceViews
            workspace={workspace}
            state={state}
            mobileTab={ui.mobileTab}
            mapScope={ui.mapScope}
            onChangeMapScope={ui.setMapScope}
            mapLegId={ui.mapLegId || workspace.legs[0]?.id || ''}
            onChangeMapLegId={ui.setMapLegId}
            mapDayId={ui.mapDayId || workspace.days[0]?.id || ''}
            onChangeMapDayId={ui.setMapDayId}
            onOpenNewTrip={() => ui.setTripModalOpen(true)}
            onOpenNewLeg={() => ui.setLegModalOpen(true)}
            onOpenNewItem={(dayId) => ui.setItemModalDayId(dayId)}
            onOpenNewChecklist={() => ui.setChecklistModalOpen(true)}
            onOpenNewNote={() => ui.setNoteModalOpen(true)}
          />
        )}
      </main>
      <BottomNav hideOnDesktop variant="brand" activeTab={ui.mobileTab} onChangeTab={(id) => ui.setMobileTab(id as MobileTab)} tabs={MOBILE_TABS} />
      <WorkspaceModals
        tripModalOpen={ui.tripModalOpen}
        onCloseTripModal={() => ui.setTripModalOpen(false)}
        onCreateTrip={state.createTrip}
        legModalOpen={ui.legModalOpen}
        onCloseLegModal={() => ui.setLegModalOpen(false)}
        onCreateLeg={state.createLeg}
        itemModalDayId={ui.itemModalDayId}
        days={workspace?.days ?? []}
        defaultTimezone={workspace?.legs[0]?.base_timezone ?? workspace?.trip.home_timezone ?? 'Pacific/Auckland'}
        onCloseItemModal={() => ui.setItemModalDayId(undefined)}
        onCreateItem={state.createItem}
        checklistModalOpen={ui.checklistModalOpen}
        onCloseChecklistModal={() => ui.setChecklistModalOpen(false)}
        onCreateChecklist={state.createChecklist}
        noteModalOpen={ui.noteModalOpen}
        legs={workspace?.legs ?? []}
        onCloseNoteModal={() => ui.setNoteModalOpen(false)}
        onCreateNote={state.createNote}
      />
    </div>
  )
}
