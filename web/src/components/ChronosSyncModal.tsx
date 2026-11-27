import React, { useCallback, useEffect, useState } from 'react'
import { CalendarCheck2, Clock, RefreshCw, ShieldAlert } from 'lucide-react'
import { AlertBanner, Button, EmptyState, LoadingState, Modal, StatusBadge } from '@yggdrasil-lab/ui'

import { OdysseusApiError } from '../api/client'
import type {
  ChronosAnchorPreview,
  ChronosOverlayMode,
  ChronosPreview,
  ChronosSyncRequest,
  ChronosSyncResponse,
  Trip,
} from '../types'

export interface ChronosSyncModalProps {
  isOpen: boolean
  onClose: () => void
  trip: Trip
  isOffline: boolean
  onLoadPreview: () => Promise<ChronosPreview>
  onSync: (payload: ChronosSyncRequest) => Promise<ChronosSyncResponse>
}

const OVERLAY_OPTIONS: Array<{ mode: ChronosOverlayMode; label: string; description: string }> = [
  {
    mode: 'suppress_all_grid_blocks',
    label: 'Suppress all grid blocks',
    description: 'Pause all recurring Chronos schedule blocks while away.',
  },
  {
    mode: 'keep_work_blocks',
    label: 'Keep work blocks',
    description: 'Keep workday blocks active while suppressing personal grid blocks.',
  },
]

function extractChronosError(err: unknown): string {
  if (err instanceof OdysseusApiError) return err.detail
  return err instanceof Error ? err.message : 'Chronos sync failed.'
}

function formatMinuteRange(startMinute: number, endMinute: number): string {
  const fmt = (mins: number) => {
    const clamped = Math.max(0, Math.min(1440, mins))
    const hh = String(Math.floor(clamped / 60)).padStart(2, '0')
    const mm = String(clamped % 60).padStart(2, '0')
    return `${hh}:${mm}`
  }
  return `${fmt(startMinute)} - ${fmt(endMinute)}`
}

const OverlayModeSelector: React.FC<{
  mode: ChronosOverlayMode
  disabled: boolean
  onChange: (nextMode: ChronosOverlayMode) => void
}> = ({ mode, disabled, onChange }) => (
  <div className="space-y-1.5">
    <p className="text-xs font-semibold text-foreground">Travel Mode Overlay Policy</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Chronos overlay mode">
      {OVERLAY_OPTIONS.map((opt) => {
        const selected = mode === opt.mode
        return (
          <button
            key={opt.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.mode)}
            className={`text-left rounded-ui-control border px-3 py-2.5 min-h-[44px] transition ${
              selected ? 'border-sky-400 bg-sky-500/15 text-foreground' : 'border-border/80 bg-background/60 text-muted'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-sky-400/60'}`}
          >
            <span className="block text-xs font-semibold text-foreground">{opt.label}</span>
            <span className="block text-[11px] text-muted mt-0.5">{opt.description}</span>
          </button>
        )
      })}
    </div>
  </div>
)

const AnchorPreviewRow: React.FC<{ anchor: ChronosAnchorPreview; homeTimezone: string }> = ({ anchor, homeTimezone }) => (
  <div className="rounded-lg bg-background/70 border border-border/70 px-3 py-2 text-xs space-y-1">
    <div className="flex flex-wrap items-center justify-between gap-1.5">
      <span className="font-semibold text-foreground truncate">{anchor.title}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <StatusBadge label={anchor.source_kind === 'booking_segment' ? 'Booking' : 'Item'} variant="info" size="xs" showDot={false} />
        {anchor.urgent_quiet_bypass && <StatusBadge label="Urgent bypass" variant="warning" size="xs" showDot={false} />}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-accent">
      <Clock className="w-3 h-3 shrink-0" />
      <span>{anchor.target_date} · {formatMinuteRange(anchor.start_minute, anchor.end_minute)} ({homeTimezone})</span>
    </div>
    {Boolean(anchor.notes) && <p className="text-[11px] text-muted">{anchor.notes}</p>}
  </div>
)

const AnchorPreviewSection: React.FC<{ preview: ChronosPreview; homeTimezone: string }> = ({ preview, homeTimezone }) => (
  <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="font-semibold text-foreground">Projected Chronos Anchors ({preview.anchors.length})</span>
      <span className="font-mono text-[11px] text-muted">
        {preview.confirmed_segment_count} segments · {preview.synced_item_count} items
      </span>
    </div>
    {preview.anchors.length === 0 ? (
      <EmptyState
        title="No anchor commitments yet"
        description="Confirm flight/lodging bookings or enable Sync to Chronos on timed itinerary items."
      />
    ) : (
      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
        {preview.anchors.map((anchor) => (
          <AnchorPreviewRow key={anchor.external_ref} anchor={anchor} homeTimezone={homeTimezone} />
        ))}
      </div>
    )}
  </div>
)

const SyncResultBanner: React.FC<{ result: ChronosSyncResponse | null }> = ({ result }) => {
  if (!result) return null
  const message = result.sync_enabled
    ? `Synced ${result.upserted_count} anchor(s) and pruned ${result.deleted_count} stale commitment(s).`
    : `Chronos sync disabled and ${result.deleted_count} commitment(s) removed.`
  return <AlertBanner variant="success" title="Chronos Sync Complete">{message}</AlertBanner>
}

const ChronosStatusBar: React.FC<{
  tripTitle: string
  isEnabled: boolean
  isOffline: boolean
  loading: boolean
  onRefresh: () => void
}> = ({ tripTitle, isEnabled, isOffline, loading, onRefresh }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui-control bg-background/70 border border-border/80 px-3 py-2.5 text-xs">
    <div className="flex items-center gap-2">
      <CalendarCheck2 className="w-4 h-4 text-accent shrink-0" />
      <span className="font-semibold text-foreground">{tripTitle}</span>
      <StatusBadge label={isEnabled ? 'Sync Active' : 'Sync Off'} variant={isEnabled ? 'success' : 'idle'} size="xs" />
    </div>
    <Button
      variant="ghost"
      size="xs"
      disabled={isOffline || loading}
      className="min-h-[44px] sm:min-h-[34px]"
      icon={<RefreshCw className="w-3.5 h-3.5" />}
      onClick={onRefresh}
    >
      Refresh
    </Button>
  </div>
)

const ChronosModalFooter: React.FC<{
  isEnabled: boolean
  eligible: boolean
  isOffline: boolean
  submitting: boolean
  onClose: () => void
  onSyncAction: (enabled: boolean) => void
}> = ({ isEnabled, eligible, isOffline, submitting, onClose, onSyncAction }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
    {isEnabled ? (
      <Button variant="danger" size="sm" disabled={isOffline || submitting} loading={submitting} className="min-h-[44px]" onClick={() => onSyncAction(false)}>
        Disable Sync
      </Button>
    ) : <span />}
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={onClose}>Close</Button>
      <Button variant="brand" size="sm" disabled={isOffline || submitting || !eligible} loading={submitting} className="min-h-[44px]" onClick={() => onSyncAction(true)}>
        {isEnabled ? 'Update Chronos Sync' : 'Sync to Chronos'}
      </Button>
    </div>
  </div>
)

function useChronosSyncModalState(props: Pick<ChronosSyncModalProps, 'isOpen' | 'trip' | 'isOffline' | 'onLoadPreview' | 'onSync'>) {
  const { isOpen, trip, isOffline, onLoadPreview, onSync } = props
  const [preview, setPreview] = useState<ChronosPreview | null>(null)
  const [overlayMode, setOverlayMode] = useState<ChronosOverlayMode>(trip.chronos_overlay_mode)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<ChronosSyncResponse | null>(null)

  const loadPreview = useCallback(async () => {
    if (isOffline) { setErrorMessage('Reconnect to preview and sync Chronos travel mode.'); return }
    setLoading(true); setErrorMessage(null)
    try {
      const loaded = await onLoadPreview()
      setPreview(loaded); setOverlayMode(loaded.overlay_mode)
    } catch (err: unknown) { setErrorMessage(extractChronosError(err)) } finally { setLoading(false) }
  }, [isOffline, onLoadPreview])

  useEffect(() => {
    if (!isOpen) return
    setSyncResult(null); setOverlayMode(trip.chronos_overlay_mode)
    void loadPreview()
  }, [isOpen, loadPreview, trip.chronos_overlay_mode])

  const handleSyncAction = async (enabled: boolean) => {
    setSubmitting(true); setErrorMessage(null); setSyncResult(null)
    try {
      const res = await onSync({ enabled, overlay_mode: overlayMode })
      setSyncResult(res); await loadPreview()
    } catch (err: unknown) { setErrorMessage(extractChronosError(err)) } finally { setSubmitting(false) }
  }

  return { preview, overlayMode, setOverlayMode, loading, submitting, errorMessage, syncResult, loadPreview, handleSyncAction }
}

export const ChronosSyncModal: React.FC<ChronosSyncModalProps> = (props) => {
  const state = useChronosSyncModalState(props)
  const eligible = state.preview?.eligible ?? false
  const isEnabled = state.preview?.sync_enabled ?? props.trip.chronos_sync_enabled

  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose} title="Chronos Travel Mode & Anchors">
      <div data-testid="chronos-sync-modal" className="space-y-4">
        <ChronosStatusBar tripTitle={props.trip.title} isEnabled={isEnabled} isOffline={props.isOffline} loading={state.loading} onRefresh={() => void state.loadPreview()} />
        {state.errorMessage && (
          <AlertBanner variant="error" title="Chronos Sync Error" action={<Button size="xs" variant="outline" disabled={props.isOffline || state.loading} onClick={() => void state.loadPreview()}>Retry</Button>}>
            {state.errorMessage}
          </AlertBanner>
        )}
        <SyncResultBanner result={state.syncResult} />
        {state.preview && !state.preview.eligible && (
          <AlertBanner variant="warning" title="Trip Not Eligible Yet" icon={<ShieldAlert className="w-4 h-4 text-amber-300" />}>
            {state.preview.ineligible_reason ?? 'Trip must be booked or active with start and end dates.'}
          </AlertBanner>
        )}
        <OverlayModeSelector mode={state.overlayMode} disabled={props.isOffline || state.submitting} onChange={state.setOverlayMode} />
        {state.loading && !state.preview ? <LoadingState label="Loading Chronos anchor preview..." variant="brand" /> : state.preview && <AnchorPreviewSection preview={state.preview} homeTimezone={props.trip.home_timezone} />}
        <ChronosModalFooter isEnabled={isEnabled} eligible={eligible} isOffline={props.isOffline} submitting={state.submitting} onClose={props.onClose} onSyncAction={(enabled) => void state.handleSyncAction(enabled)} />
      </div>
    </Modal>
  )
}
