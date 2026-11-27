import React, { useMemo, useState } from 'react'
import { CalendarDays, CheckSquare, Compass, DownloadCloud, HardDriveDownload, Map as MapIcon, Plus, Share2, Ticket, Wallet, WifiOff } from 'lucide-react'
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
import { WorkspaceViews } from './WorkspaceViews'
import { InboundBookingsInbox } from './components/InboundBookingsInbox'
import { IosInstallBanner } from './components/IosInstallBanner'
import { SharedTripView } from './components/SharedTripView'
import { WorkspaceModals } from './components/WorkspaceModals'
import { useOdysseusWorkspace, type WorkspaceErrorState } from './hooks/useOdysseusWorkspace'
import type { OfflineStorageAdapter } from './offline/storage'
import type { Attachment, Booking, MapScope, MobileTab, Place, SharedAttachment } from './types'

export interface AppProps {
  adapter?: OdysseusApiAdapter
  offlineStorage?: OfflineStorageAdapter
  initialPath?: string
}

const SHARE_PATH_PATTERN = /^\/share\/([A-Za-z0-9_-]+)\/?$/

export function parseShareTokenFromPath(pathname: string): string | null {
  const match = SHARE_PATH_PATTERN.exec(pathname)
  return match ? match[1] : null
}

const MOBILE_TABS = [
  { id: 'itinerary', label: 'Itinerary', icon: <CalendarDays className="w-4 h-4" /> },
  { id: 'map', label: 'Map', icon: <MapIcon className="w-4 h-4" /> },
  { id: 'bookings', label: 'Bookings', icon: <Ticket className="w-4 h-4" /> },
  { id: 'lists', label: 'Lists', icon: <CheckSquare className="w-4 h-4" /> },
  { id: 'budget', label: 'Budget', icon: <Wallet className="w-4 h-4" /> },
]

const WorkspaceErrorDisplay: React.FC<{ error: WorkspaceErrorState | null; onRetry: () => void }> = ({ error, onRetry }) => {
  if (!error) return null
  if (error.kind === 'session') return <SessionExpiredBanner onReauth={onRetry} message={error.message} />
  return (
    <AlertBanner variant="error" title={error.kind === 'routing' ? 'API Routing Error' : 'Odysseus API Error'} action={<Button size="xs" variant="outline" onClick={onRetry}>Retry</Button>}>
      {error.message}
    </AlertBanner>
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
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | SharedAttachment | null>(null)
  const [placeModalOpen, setPlaceModalOpen] = useState(false)
  const [editingPlace, setEditingPlace] = useState<Place | null>(null)
  const [initialPlaceCoords, setInitialPlaceCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [offlineModalOpen, setOfflineModalOpen] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [chronosModalOpen, setChronosModalOpen] = useState(false)

  return {
    mobileTab, setMobileTab, mapScope, setMapScope, mapLegId, setMapLegId, mapDayId, setMapDayId,
    tripModalOpen, setTripModalOpen, legModalOpen, setLegModalOpen, itemModalDayId, setItemModalDayId,
    checklistModalOpen, setChecklistModalOpen, noteModalOpen, setNoteModalOpen,
    bookingModalOpen, setBookingModalOpen, editingBooking, setEditingBooking,
    viewingAttachment, setViewingAttachment, placeModalOpen, setPlaceModalOpen,
    editingPlace, setEditingPlace, initialPlaceCoords, setInitialPlaceCoords,
    offlineModalOpen, setOfflineModalOpen, shareModalOpen, setShareModalOpen,
    chronosModalOpen, setChronosModalOpen,
  }
}

function resolveViewingAttachmentUrl(
  attachment: Attachment | SharedAttachment | null,
  state: ReturnType<typeof useOdysseusWorkspace>,
): string {
  if (!attachment) return ''
  if ('content_url' in attachment) return attachment.content_url
  if (attachment.trip_id === null && attachment.booking_id) {
    return state.unassignedAttachmentContentUrl(attachment.booking_id, attachment.id)
  }
  return state.attachmentContentUrl(attachment.id)
}

const AppModalsHost: React.FC<{
  ui: ReturnType<typeof useShellUiState>
  state: ReturnType<typeof useOdysseusWorkspace>
}> = ({ ui, state }) => {
  const workspace = state.workspace
  return (
    <WorkspaceModals
      tripModalOpen={ui.tripModalOpen} onCloseTripModal={() => ui.setTripModalOpen(false)} onCreateTrip={state.createTrip}
      legModalOpen={ui.legModalOpen} onCloseLegModal={() => ui.setLegModalOpen(false)} onCreateLeg={state.createLeg}
      itemModalDayId={ui.itemModalDayId} days={workspace?.days ?? []} places={workspace?.places ?? []}
      defaultTimezone={workspace?.legs[0]?.base_timezone ?? workspace?.trip.home_timezone ?? 'Pacific/Auckland'}
      onCloseItemModal={() => ui.setItemModalDayId(undefined)} onCreateItem={state.createItem}
      checklistModalOpen={ui.checklistModalOpen} onCloseChecklistModal={() => ui.setChecklistModalOpen(false)} onCreateChecklist={state.createChecklist}
      noteModalOpen={ui.noteModalOpen} legs={workspace?.legs ?? []} onCloseNoteModal={() => ui.setNoteModalOpen(false)} onCreateNote={state.createNote}
      bookingModalOpen={ui.bookingModalOpen} editingBooking={ui.editingBooking}
      onCloseBookingModal={() => { ui.setBookingModalOpen(false); ui.setEditingBooking(null) }}
      onCreateBooking={state.createBooking} onUpdateBooking={state.updateBooking}
      viewingAttachment={ui.viewingAttachment} attachmentContentUrl={resolveViewingAttachmentUrl(ui.viewingAttachment, state)}
      isOffline={state.isOffline} offlineBlobLoader={state.loadOfflineAttachmentBlob}
      onCloseAttachmentViewer={() => ui.setViewingAttachment(null)}
      placeModalOpen={ui.placeModalOpen} editingPlace={ui.editingPlace} initialPlaceCoords={ui.initialPlaceCoords}
      onClosePlaceModal={() => { ui.setPlaceModalOpen(false); ui.setEditingPlace(null); ui.setInitialPlaceCoords(null) }}
      onSearchPlaces={state.searchPlaces} onResolvePlaceUrl={state.resolvePlaceUrl}
      onCreatePlace={state.createPlace} onUpdatePlace={state.updatePlace}
      offlineModalOpen={ui.offlineModalOpen} onCloseOfflineModal={() => ui.setOfflineModalOpen(false)}
      activeTrip={workspace?.trip ?? null} mapPacks={workspace?.map_packs ?? []}
      offlineSummary={state.offlineSummary} syncProgress={state.syncProgress}
      isSyncing={state.isSyncing} offlineError={state.offlineError}
      onSaveOffline={state.saveTripOffline} onClearOffline={state.clearTripOffline}
      onCreateMapPack={state.createMapPack} onDeleteMapPack={state.deleteMapPack}
      shareModalOpen={ui.shareModalOpen} onCloseShareModal={() => ui.setShareModalOpen(false)}
      shareTokens={state.shareTokens} shareTokensLoading={state.shareTokensLoading}
      shareTokensError={state.shareTokensError} onLoadShareTokens={state.loadShareTokens}
      onCreateShareToken={state.createShareToken} onUpdateShareToken={state.updateShareToken}
      onRotateShareToken={state.rotateShareToken} onRevokeShareToken={state.revokeShareToken}
      onDeleteShareToken={state.deleteShareToken}
      chronosModalOpen={ui.chronosModalOpen} onCloseChronosModal={() => ui.setChronosModalOpen(false)}
      onLoadChronosPreview={state.loadChronosPreview} onSyncTripToChronos={state.syncTripToChronos}
    />
  )
}

const AuthorHeaderActions: React.FC<{
  hasWorkspace: boolean
  isOffline: boolean
  isSavedOffline: boolean
  onOpenShare: () => void
  onOpenOffline: () => void
  onOpenNewTrip: () => void
}> = ({ hasWorkspace, isOffline, isSavedOffline, onOpenShare, onOpenOffline, onOpenNewTrip }) => (
  <div className="flex items-center gap-1 sm:gap-1.5">
    {hasWorkspace && (
      <>
        <Button
          variant="outline"
          size="sm"
          disabled={isOffline}
          aria-label="Share trip"
          className="min-h-[44px] sm:min-h-[38px] min-w-[44px] sm:min-w-0 px-2.5 sm:px-3 gap-0 sm:gap-1.5"
          icon={<Share2 className="w-3.5 h-3.5" />}
          onClick={onOpenShare}
        >
          <span className="hidden sm:inline">Share</span>
        </Button>
        <Button
          variant={isSavedOffline ? 'secondary' : 'outline'}
          size="sm"
          aria-label={isSavedOffline ? 'Saved Offline' : 'Save Offline'}
          className="min-h-[44px] sm:min-h-[38px] min-w-[44px] sm:min-w-0 px-2.5 sm:px-3 gap-0 sm:gap-1.5"
          icon={isSavedOffline ? <HardDriveDownload className="w-3.5 h-3.5 text-emerald-400" /> : <DownloadCloud className="w-3.5 h-3.5" />}
          onClick={onOpenOffline}
        >
          <span className="hidden sm:inline">{isSavedOffline ? 'Saved Offline' : 'Save Offline'}</span>
        </Button>
      </>
    )}
    <Button
      variant="brand"
      size="sm"
      disabled={isOffline}
      aria-label="New Trip"
      className="min-h-[44px] sm:min-h-[38px] min-w-[44px] sm:min-w-0 px-2.5 sm:px-3 gap-0 sm:gap-1.5"
      icon={<Plus className="w-3.5 h-3.5" />}
      onClick={onOpenNewTrip}
    >
      <span className="hidden sm:inline">New Trip</span>
    </Button>
  </div>
)

const EmptyTripsView: React.FC<{
  state: ReturnType<typeof useOdysseusWorkspace>
  onOpenNewTrip: () => void
  onViewAttachment: (attachment: Attachment | SharedAttachment) => void
}> = ({ state, onOpenNewTrip, onViewAttachment }) => (
  <div className="space-y-4">
    <InboundBookingsInbox
      bookings={state.unassignedBookings}
      trips={state.trips}
      selectedTripId={state.selectedTripId}
      readOnly={state.isOffline}
      onAssign={state.assignUnassignedBooking}
      onDismiss={state.deleteUnassignedBooking}
      onViewAttachment={onViewAttachment}
    />
    <EmptyState
      title="Plan your first voyage"
      description="Create a trip with flexible planning dates or locked travel dates to begin building legs, days, and checklists."
      icon={<Compass className="w-8 h-8 text-accent" />}
      action={<Button variant="brand" size="md" disabled={state.isOffline} onClick={onOpenNewTrip}>Create First Trip</Button>}
    />
  </div>
)

const AuthorWorkspaceApp: React.FC<{
  adapter: OdysseusApiAdapter
  offlineStorage?: OfflineStorageAdapter
}> = ({ adapter, offlineStorage }) => {
  const state = useOdysseusWorkspace(adapter, offlineStorage)
  const ui = useShellUiState()
  const workspace = state.workspace

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground pb-24 lg:pb-8">
      <AppHeader
        variant="brand" brandIcon={<Compass className="w-4 h-4" />} title="Odysseus"
        subtitle={workspace ? workspace.trip.title : 'Aegean Travel Planner'}
        isRefreshing={state.isRefreshing} onRefresh={() => void state.refresh()}
        actions={
          <AuthorHeaderActions
            hasWorkspace={Boolean(workspace)} isOffline={state.isOffline} isSavedOffline={Boolean(state.offlineSummary)}
            onOpenShare={() => ui.setShareModalOpen(true)} onOpenOffline={() => ui.setOfflineModalOpen(true)} onOpenNewTrip={() => ui.setTripModalOpen(true)}
          />
        }
      />
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 pt-4 space-y-4">
        {state.isOffline && (
          <AlertBanner variant="warning" title="Offline Read-Only" icon={<WifiOff className="w-4 h-4 text-amber-300" />}>
            Viewing cached trip data. Editing, uploads, and route calculations are paused until you reconnect.
          </AlertBanner>
        )}
        <IosInstallBanner />
        <WorkspaceErrorDisplay error={state.loadError ?? state.actionError} onRetry={() => void state.refresh()} />
        {state.isLoading && <LoadingState label="Loading trip workspace..." variant="brand" />}
        {!state.isLoading && !workspace && !state.loadError && (
          <EmptyTripsView state={state} onOpenNewTrip={() => ui.setTripModalOpen(true)} onViewAttachment={(att) => ui.setViewingAttachment(att)} />
        )}
        {workspace && (
          <WorkspaceViews
            workspace={workspace} state={state} mobileTab={ui.mobileTab}
            mapScope={ui.mapScope} onChangeMapScope={ui.setMapScope}
            mapLegId={ui.mapLegId || workspace.legs[0]?.id || ''} onChangeMapLegId={ui.setMapLegId}
            mapDayId={ui.mapDayId || workspace.days[0]?.id || ''} onChangeMapDayId={ui.setMapDayId}
            onOpenNewTrip={() => ui.setTripModalOpen(true)} onOpenNewLeg={() => ui.setLegModalOpen(true)}
            onOpenNewItem={(dayId) => ui.setItemModalDayId(dayId)} onOpenChronosSync={() => ui.setChronosModalOpen(true)}
            onOpenNewChecklist={() => ui.setChecklistModalOpen(true)} onOpenNewNote={() => ui.setNoteModalOpen(true)}
            onOpenNewBooking={() => { ui.setEditingBooking(null); ui.setBookingModalOpen(true) }}
            onEditBooking={(b) => { ui.setEditingBooking(b); ui.setBookingModalOpen(true) }}
            onViewAttachment={(att) => ui.setViewingAttachment(att)}
            onOpenAddPlace={(coords) => { ui.setEditingPlace(null); ui.setInitialPlaceCoords(coords ?? null); ui.setPlaceModalOpen(true) }}
            onEditPlace={(place) => { ui.setEditingPlace(place); ui.setInitialPlaceCoords(null); ui.setPlaceModalOpen(true) }}
          />
        )}
      </main>
      <BottomNav hideOnDesktop variant="brand" activeTab={ui.mobileTab} onChangeTab={(id) => ui.setMobileTab(id as MobileTab)} tabs={MOBILE_TABS} />
      <AppModalsHost ui={ui} state={state} />
    </div>
  )
}

export function App({ adapter, offlineStorage, initialPath }: AppProps) {
  const resolvedAdapter = useMemo(() => adapter ?? new OdysseusHttpAdapter(), [adapter])
  const pathname = initialPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
  const shareToken = parseShareTokenFromPath(pathname)

  if (shareToken) {
    return <SharedTripView token={shareToken} adapter={resolvedAdapter} />
  }
  return <AuthorWorkspaceApp adapter={resolvedAdapter} offlineStorage={offlineStorage} />
}
