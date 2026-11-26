import React, { useEffect, useState } from 'react'
import { DownloadCloud, HardDrive, Map as MapIcon, Trash2 } from 'lucide-react'
import { AlertBanner, Button, Modal, ProgressBar, StatusBadge } from '@yggdrasil-lab/ui'

import type { OfflineSyncProgress } from '../offline/sync'
import type {
  Leg,
  MapPack,
  MapPackCreatePayload,
  OfflineSyncSummary,
  Trip,
} from '../types'
import { formatBytesCompact } from '../utils/maps'

export interface OfflineSyncModalProps {
  isOpen: boolean
  onClose: () => void
  trip: Trip
  legs: Leg[]
  mapPacks: MapPack[]
  isOffline: boolean
  offlineSummary: OfflineSyncSummary | null
  syncProgress: OfflineSyncProgress | null
  isSyncing: boolean
  offlineError: string | null
  onSaveOffline: (includeMapPacks: boolean) => Promise<void>
  onClearOffline: () => Promise<void>
  onCreateMapPack: (payload: MapPackCreatePayload) => Promise<void>
  onDeleteMapPack: (packId: string) => Promise<void>
}

interface StorageEstimateInfo {
  usage?: number
  quota?: number
}

function formatSyncTimestamp(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const OfflineStorageStatusCard: React.FC<{
  offlineSummary: OfflineSyncSummary | null
  estimate: StorageEstimateInfo
}> = ({ offlineSummary, estimate }) => (
  <div className="rounded-ui-control bg-background/70 border border-border/80 p-3 space-y-2 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-accent shrink-0" />
        <span className="font-semibold text-foreground">Device Offline Copy</span>
      </div>
      <StatusBadge
        label={offlineSummary ? 'Saved Offline' : 'Not Cached'}
        variant={offlineSummary ? 'success' : 'idle'}
        size="xs"
      />
    </div>
    {offlineSummary ? (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] font-mono text-muted">
        <div>
          <span className="block text-[10px] uppercase">Last synced</span>
          <span className="text-foreground">{formatSyncTimestamp(offlineSummary.syncedAt)}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase">Files cached</span>
          <span className="text-foreground">
            {offlineSummary.attachmentCount + offlineSummary.mapPackCount} files ({offlineSummary.attachmentCount} docs, {offlineSummary.mapPackCount} maps)
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase">Bundle size</span>
          <span className="text-foreground">{formatBytesCompact(offlineSummary.totalBytes)}</span>
        </div>
      </div>
    ) : (
      <p className="text-[11px] text-muted">
        Save this trip to read itineraries, bookings, PDF vouchers, and maps without a signal.
      </p>
    )}
    {typeof estimate.usage === 'number' && typeof estimate.quota === 'number' && (
      <p className="text-[11px] font-mono text-muted border-t border-border/50 pt-2">
        Device storage: {formatBytesCompact(estimate.usage)} / {formatBytesCompact(estimate.quota)}
      </p>
    )}
  </div>
)

const LegMapPackRow: React.FC<{
  leg: Leg
  pack: MapPack | undefined
  disabled: boolean
  busy: boolean
  onExtract: (leg: Leg) => Promise<void>
  onDelete: (packId: string) => Promise<void>
}> = ({ leg, pack, disabled, busy, onExtract, onDelete }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/65 border border-border/70 px-3 py-2 text-xs">
    <div className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: leg.color }} />
        <span className="font-semibold text-foreground truncate">{leg.name}</span>
        {pack && (
          <StatusBadge
            label={pack.status === 'ready' ? formatBytesCompact(pack.size_bytes) : 'Failed'}
            variant={pack.status === 'ready' ? 'success' : 'error'}
            size="xs"
            showDot={false}
          />
        )}
      </div>
      <p className="text-[11px] text-muted truncate">
        {leg.primary_city} {pack?.error_message ? `- ${pack.error_message}` : ''}
      </p>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      {pack ? (
        <Button
          variant="ghost"
          size="xs"
          disabled={disabled || busy}
          aria-label={`Delete MapPack for ${leg.name}`}
          className="min-h-[44px] sm:min-h-[34px]"
          icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
          onClick={() => void onDelete(pack.id)}
        >
          Remove
        </Button>
      ) : (
        <Button
          variant="outline"
          size="xs"
          disabled={disabled || busy}
          loading={busy}
          className="min-h-[44px] sm:min-h-[34px]"
          icon={<MapIcon className="w-3.5 h-3.5" />}
          onClick={() => void onExtract(leg)}
        >
          Extract Pack
        </Button>
      )}
    </div>
  </div>
)

const LegMapPackSection: React.FC<{
  legs: Leg[]
  mapPacks: MapPack[]
  isOffline: boolean
  isSyncing: boolean
  onCreateMapPack: (payload: MapPackCreatePayload) => Promise<void>
  onDeleteMapPack: (packId: string) => Promise<void>
  onError: (msg: string | null) => void
}> = ({ legs, mapPacks, isOffline, isSyncing, onCreateMapPack, onDeleteMapPack, onError }) => {
  const [busyLegId, setBusyLegId] = useState<string | null>(null)
  const packsByLegId = new Map(mapPacks.filter((p) => p.leg_id).map((p) => [p.leg_id as string, p]))

  const handleExtract = async (leg: Leg) => {
    setBusyLegId(leg.id)
    onError(null)
    try {
      await onCreateMapPack({ leg_id: leg.id, label: `${leg.name} Offline Map` })
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Unable to extract offline MapPack.')
    } finally {
      setBusyLegId(null)
    }
  }

  const handleDelete = async (legId: string, packId: string) => {
    setBusyLegId(legId)
    onError(null)
    try {
      await onDeleteMapPack(packId)
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Unable to delete MapPack.')
    } finally {
      setBusyLegId(null)
    }
  }

  if (legs.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          Per-Leg .pmtiles MapPacks
        </span>
        <span className="text-[11px] font-mono text-muted">
          {mapPacks.filter((p) => p.status === 'ready').length} ready
        </span>
      </div>
      <div className="space-y-1.5">
        {legs.map((leg) => (
          <LegMapPackRow
            key={leg.id}
            leg={leg}
            pack={packsByLegId.get(leg.id)}
            disabled={isOffline || isSyncing}
            busy={busyLegId === leg.id}
            onExtract={handleExtract}
            onDelete={(packId) => handleDelete(leg.id, packId)}
          />
        ))}
      </div>
    </div>
  )
}

export const OfflineSyncModal: React.FC<OfflineSyncModalProps> = (props) => {
  const [includeMapPacks, setIncludeMapPacks] = useState<boolean>(
    () => props.offlineSummary?.includesMapPacks ?? true,
  )
  const [estimate, setEstimate] = useState<StorageEstimateInfo>({})
  const [packError, setPackError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.isOpen || typeof navigator === 'undefined' || !navigator.storage?.estimate) return
    void navigator.storage.estimate().then((res) => {
      setEstimate({ usage: res.usage, quota: res.quota })
    }).catch(() => {})
  }, [props.isOpen, props.offlineSummary])

  const combinedError = props.offlineError ?? packError
  const totalCount = props.syncProgress?.totalCount ?? 0
  const completedCount = props.syncProgress?.completedCount ?? 0

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title="Save Trip Offline"
      subtitle={props.trip.title}
      className="max-w-xl"
    >
      <div data-testid="offline-sync-modal" className="space-y-4">
        <OfflineStorageStatusCard offlineSummary={props.offlineSummary} estimate={estimate} />
        {combinedError && <AlertBanner variant="error" title="Offline Sync Error">{combinedError}</AlertBanner>}

        <label className="flex items-center gap-2.5 rounded-lg bg-background/60 border border-border/70 px-3 py-2 min-h-[44px] text-xs text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={includeMapPacks}
            onChange={(e) => setIncludeMapPacks(e.target.checked)}
            disabled={props.isSyncing}
            className="w-4 h-4 accent-sky-400"
          />
          <span>Include per-Leg .pmtiles MapPacks</span>
        </label>

        {props.isSyncing && props.syncProgress && (
          <div className="space-y-1.5 rounded-lg bg-background/70 border border-border/70 p-3 text-xs">
            <div className="flex items-center justify-between font-mono text-[11px] text-muted">
              <span>Syncing ({props.syncProgress.phase})</span>
              <span>
                {completedCount}/{totalCount} files · {formatBytesCompact(props.syncProgress.downloadedBytes)}
              </span>
            </div>
            <ProgressBar
              value={totalCount > 0 ? completedCount : 25}
              max={totalCount > 0 ? totalCount : 100}
              variant="brand"
              label="Offline sync progress"
            />
          </div>
        )}

        <LegMapPackSection
          legs={props.legs}
          mapPacks={props.mapPacks}
          isOffline={props.isOffline}
          isSyncing={props.isSyncing}
          onCreateMapPack={props.onCreateMapPack}
          onDeleteMapPack={props.onDeleteMapPack}
          onError={setPackError}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
          <Button
            variant="ghost"
            size="sm"
            disabled={props.isSyncing || !props.offlineSummary}
            className="min-h-[44px]"
            icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
            onClick={() => void props.onClearOffline()}
          >
            Remove Offline Copy
          </Button>
          <Button
            variant="brand"
            size="sm"
            loading={props.isSyncing}
            disabled={props.isOffline}
            className="min-h-[44px]"
            icon={<DownloadCloud className="w-4 h-4" />}
            onClick={() => void props.onSaveOffline(includeMapPacks).catch(() => {})}
          >
            Save Trip Offline
          </Button>
        </div>
      </div>
    </Modal>
  )
}
