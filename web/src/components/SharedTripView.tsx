import React, { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CheckSquare, Compass, Map as MapIcon, Ticket } from 'lucide-react'
import {
  AlertBanner,
  AppHeader,
  BottomNav,
  Button,
  EmptyState,
  LoadingState,
  StatusBadge,
} from '@yggdrasil-lab/ui'

import { OdysseusApiError, type OdysseusApiAdapter } from '../api/client'
import type { MapScope, SharedAttachment, SharedTab, SharedTripView as SharedTripViewData } from '../types'
import { BookingsHubSection } from './BookingsHubSection'
import { ChecklistsAndNotesSection } from './ChecklistsAndNotesSection'
import { LeftJumpRail } from './LeftJumpRail'
import { MapLibrePanel } from './MapLibrePanel'
import { PdfViewerModal } from './PdfViewerModal'
import { TripDocumentTimeline } from './TripDocumentTimeline'

export interface SharedTripViewProps {
  token: string
  adapter: OdysseusApiAdapter
}

interface ShareErrorBannerState {
  title: string
  message: string
}

const SHARED_TABS = [
  { id: 'itinerary', label: 'Itinerary', icon: <CalendarDays className="w-4 h-4" /> },
  { id: 'map', label: 'Map', icon: <MapIcon className="w-4 h-4" /> },
  { id: 'bookings', label: 'Bookings', icon: <Ticket className="w-4 h-4" /> },
  { id: 'lists', label: 'Lists', icon: <CheckSquare className="w-4 h-4" /> },
]

const NOOP_ASYNC = async () => {}

function classifyShareError(err: unknown): ShareErrorBannerState {
  if (err instanceof OdysseusApiError) {
    if (err.status === 404) return { title: 'Link not found', message: err.detail || 'This share link does not exist.' }
    if (err.status === 410) return { title: 'Share link expired or revoked', message: err.detail || 'This share link is no longer active.' }
    if (err.status === 429) return { title: 'Rate limit exceeded, please try again shortly', message: err.detail || 'Too many requests.' }
    return { title: 'Unable to load shared trip', message: err.detail }
  }
  return {
    title: 'Unable to load shared trip',
    message: err instanceof Error ? err.message : 'Unexpected error loading shared trip.',
  }
}

function useSharedTripLoader(token: string, adapter: OdysseusApiAdapter) {
  const [data, setData] = useState<SharedTripViewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<ShareErrorBannerState | null>(null)

  const load = useCallback(
    async (isRefresh = false, signal?: AbortSignal) => {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await adapter.getSharedTrip(token, signal)
        if (!signal?.aborted) setData(res)
      } catch (err: unknown) {
        if (!signal?.aborted) setError(classifyShareError(err))
      } finally {
        if (!signal?.aborted) { setLoading(false); setRefreshing(false) }
      }
    },
    [adapter, token],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(false, controller.signal)
    return () => controller.abort()
  }, [load])

  return { data, loading, refreshing, error, reload: () => void load(true) }
}

interface SharedSectionsOptions {
  data: SharedTripViewData
  mapScope: MapScope
  mapLegId: string
  mapDayId: string
  onChangeMapScope: (s: MapScope) => void
  onChangeMapLegId: (id: string) => void
  onChangeMapDayId: (id: string) => void
  onViewAttachment: (att: SharedAttachment) => void
}

function buildTimelineAndBookings(data: SharedTripViewData, onViewAttachment: (att: SharedAttachment) => void) {
  const timelineNode = (
    <TripDocumentTimeline
      trips={[data.trip]} trip={data.trip} legs={data.legs} days={data.days}
      items={data.itinerary_items} bookings={data.bookings} places={data.places}
      readOnly companionMode
      onSelectTrip={() => {}} onOpenNewTrip={() => {}} onOpenNewLeg={() => {}} onOpenNewItem={() => {}}
      onToggleItemDone={NOOP_ASYNC} onMoveItemDay={NOOP_ASYNC} onDeleteItem={NOOP_ASYNC}
    />
  )
  const hiddenNote = !data.visibility.include_attachments && data.attachments.length === 0 ? 'Attachments hidden by trip owner' : undefined
  const bookingsNode = (
    <BookingsHubSection
      bookings={data.bookings} attachments={data.attachments} readOnly companionMode attachmentsHiddenNote={hiddenNote}
      onOpenNewBooking={() => {}} onEditBooking={() => {}} onDeleteBooking={NOOP_ASYNC}
      onUploadAttachment={NOOP_ASYNC} onDeleteAttachment={NOOP_ASYNC}
      onViewAttachment={(att) => onViewAttachment(att as SharedAttachment)}
    />
  )
  return { timelineNode, bookingsNode }
}

function buildListsAndMap(options: SharedSectionsOptions) {
  const { data } = options
  const showChecklists = data.visibility.include_checklists
  const showNotes = data.travel_notes.length > 0
  const listsNode = showChecklists || showNotes ? (
    <ChecklistsAndNotesSection
      checklists={data.checklists} notes={data.travel_notes} legs={data.legs}
      readOnly companionMode hideChecklists={!showChecklists} hideNotes={!showNotes}
      onOpenNewChecklist={() => {}} onAddChecklistItem={NOOP_ASYNC} onToggleChecklistItem={NOOP_ASYNC}
      onDeleteChecklistItem={NOOP_ASYNC} onOpenNewNote={() => {}} onDeleteNote={NOOP_ASYNC}
    />
  ) : null
  const mapNode = (
    <MapLibrePanel
      legs={data.legs} days={data.days} items={data.itinerary_items} places={data.places}
      routeEstimates={data.route_estimates} scope={options.mapScope} onChangeScope={options.onChangeMapScope}
      selectedLegId={options.mapLegId} onChangeLegId={options.onChangeMapLegId}
      selectedDayId={options.mapDayId} onChangeDayId={options.onChangeMapDayId}
      readOnly companionMode isOffline={false}
      onOpenAddPlace={() => {}} onEditPlace={() => {}} onDeletePlace={NOOP_ASYNC}
      onComputeDayRoutes={async () => ({ day_id: '', routes: [], fallback_used: false, warning: null })}
      onUpdateRouteEstimate={NOOP_ASYNC}
    />
  )
  return { listsNode, mapNode, showChecklists, showNotes }
}

const SharedWorkspaceContent: React.FC<SharedSectionsOptions & {
  mobileTab: SharedTab
  onJumpToLeg: (legId: string) => void
}> = (props) => {
  const { data, mobileTab } = props
  const { timelineNode, bookingsNode } = buildTimelineAndBookings(data, props.onViewAttachment)
  const { listsNode, mapNode, showChecklists, showNotes } = buildListsAndMap(props)
  return (
    <>
      <div data-testid="desktop-shared-workspace" className="hidden lg:grid lg:grid-cols-[210px_minmax(0,1fr)_42%] lg:gap-5 lg:items-start">
        <LeftJumpRail
          legs={data.legs} bookingCount={data.bookings.length} placeCount={data.places.length}
          backlogCount={data.itinerary_items.filter((i) => i.day_id === null).length}
          checklistCount={data.checklists.length} noteCount={data.travel_notes.length}
          hideBudget hideChecklists={!showChecklists} hideNotes={!showNotes} onJumpToLeg={props.onJumpToLeg}
        />
        <div className="space-y-4 min-w-0">
          {timelineNode}
          {bookingsNode}
          {listsNode}
        </div>
        {mapNode}
      </div>
      <div data-testid="mobile-shared-workspace" className="lg:hidden space-y-4">
        {mobileTab === 'itinerary' && timelineNode}
        {mobileTab === 'map' && mapNode}
        {mobileTab === 'bookings' && bookingsNode}
        {mobileTab === 'lists' && (listsNode ?? (
          <EmptyState title="Checklists & notes hidden" description="The trip owner did not include checklists or travel notes on this share link." />
        ))}
      </div>
    </>
  )
}

export const SharedTripView: React.FC<SharedTripViewProps> = ({ token, adapter }) => {
  const { data, loading, refreshing, error, reload } = useSharedTripLoader(token, adapter)
  const [mobileTab, setMobileTab] = useState<SharedTab>('itinerary')
  const [mapScope, setMapScope] = useState<MapScope>('trip')
  const [mapLegId, setMapLegId] = useState('')
  const [mapDayId, setMapDayId] = useState('')
  const [viewingAttachment, setViewingAttachment] = useState<SharedAttachment | null>(null)

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground pb-24 lg:pb-8">
      <AppHeader
        variant="brand" brandIcon={<Compass className="w-4 h-4" />} title="Odysseus"
        subtitle={data ? data.trip.title : 'Shared Trip Companion'} isRefreshing={refreshing} onRefresh={reload}
        actions={<StatusBadge label="Shared Read-Only" variant="info" size="xs" />}
      />
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 pt-4 space-y-4">
        {error && (
          <AlertBanner variant="error" title={error.title} action={<Button size="xs" variant="outline" onClick={reload}>Retry</Button>}>
            {error.message}
          </AlertBanner>
        )}
        {loading && <LoadingState label="Loading shared trip..." variant="brand" />}
        {data && (
          <SharedWorkspaceContent
            data={data} mobileTab={mobileTab} mapScope={mapScope}
            mapLegId={mapLegId || data.legs[0]?.id || ''} mapDayId={mapDayId || data.days[0]?.id || ''}
            onChangeMapScope={setMapScope} onChangeMapLegId={setMapLegId}
            onChangeMapDayId={setMapDayId} onViewAttachment={setViewingAttachment}
            onJumpToLeg={(legId) => { setMapLegId(legId); setMapScope('leg') }}
          />
        )}
      </main>
      {data && <BottomNav hideOnDesktop variant="brand" activeTab={mobileTab} onChangeTab={(id) => setMobileTab(id as SharedTab)} tabs={SHARED_TABS} />}
      <PdfViewerModal
        attachment={viewingAttachment}
        contentUrl={viewingAttachment ? adapter.sharedAttachmentContentUrl(token, viewingAttachment.id) : ''}
        isOffline={false}
        onClose={() => setViewingAttachment(null)}
      />
    </div>
  )
}
