import { useCallback, useEffect, useState } from 'react'

import type { OdysseusApiAdapter } from '../api/client'
import type { OfflineStorageAdapter } from '../offline/storage'
import {
  clearTripOffline,
  readTripOfflineSummary,
  saveTripOffline as runSaveTripOffline,
  type OfflineSyncProgress,
} from '../offline/sync'
import type { MapPackCreatePayload, OfflineMapPackEntry, OfflineSyncSummary } from '../types'

interface UseOfflineTripSyncOptions {
  adapter: OdysseusApiAdapter
  storage: OfflineStorageAdapter
  selectedTripId: string | null
  isOffline: boolean
  reloadWorkspace: (tripId: string) => Promise<void>
}

async function loadMapPacksFromStorage(
  tripId: string,
  storage: OfflineStorageAdapter,
): Promise<OfflineMapPackEntry[]> {
  const packIds = await storage.listMapPackIdsForTrip(tripId)
  const loaded = await Promise.all(packIds.map((id) => storage.getMapPackBlob(id)))
  return loaded
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => ({ packId: entry.packId, label: entry.label, blob: entry.blob }))
}

function useMapPackActions(
  adapter: OdysseusApiAdapter,
  selectedTripId: string | null,
  isOffline: boolean,
  reloadWorkspace: (tripId: string) => Promise<void>,
) {
  const createMapPack = useCallback(
    async (payload: MapPackCreatePayload) => {
      if (!selectedTripId) return
      if (isOffline) throw new Error('Offline Read-Only mode is active. Reconnect to extract MapPacks.')
      await adapter.createMapPack(selectedTripId, payload)
      await reloadWorkspace(selectedTripId)
    },
    [adapter, isOffline, reloadWorkspace, selectedTripId],
  )

  const deleteMapPack = useCallback(
    async (packId: string) => {
      if (!selectedTripId) return
      if (isOffline) throw new Error('Offline Read-Only mode is active. Reconnect to delete MapPacks.')
      await adapter.deleteMapPack(selectedTripId, packId)
      await reloadWorkspace(selectedTripId)
    },
    [adapter, isOffline, reloadWorkspace, selectedTripId],
  )

  return { createMapPack, deleteMapPack }
}

function useOfflineBundleActions(options: {
  storage: OfflineStorageAdapter
  selectedTripId: string | null
  isOffline: boolean
  setOfflineSummary: (s: OfflineSyncSummary | null) => void
  setOfflineMapPacks: (p: OfflineMapPackEntry[]) => void
  setSyncProgress: (p: OfflineSyncProgress | null) => void
  setIsSyncing: (b: boolean) => void
  setOfflineError: (e: string | null) => void
}) {
  const { storage, selectedTripId, isOffline } = options

  const saveTripOffline = useCallback(
    async (includeMapPacks: boolean) => {
      if (!selectedTripId) return
      if (isOffline) {
        const msg = 'Reconnect to the network before syncing a trip offline.'
        options.setOfflineError(msg)
        throw new Error(msg)
      }
      options.setIsSyncing(true); options.setOfflineError(null); options.setSyncProgress(null)
      try {
        const summary = await runSaveTripOffline({
          tripId: selectedTripId, includeMapPacks, storage, onProgress: options.setSyncProgress,
        })
        options.setOfflineSummary(summary)
        options.setOfflineMapPacks(await loadMapPacksFromStorage(selectedTripId, storage))
      } catch (err: unknown) {
        options.setOfflineError(err instanceof Error ? err.message : 'Offline sync failed.')
        throw err
      } finally {
        options.setIsSyncing(false)
      }
    },
    [isOffline, options.setIsSyncing, options.setOfflineError, options.setOfflineMapPacks, options.setOfflineSummary, options.setSyncProgress, selectedTripId, storage],
  )

  const clearOfflineCopy = useCallback(async () => {
    if (!selectedTripId) return
    options.setOfflineError(null)
    await clearTripOffline(selectedTripId, storage)
    options.setOfflineSummary(null); options.setOfflineMapPacks([]); options.setSyncProgress(null)
  }, [options.setOfflineError, options.setOfflineMapPacks, options.setOfflineSummary, options.setSyncProgress, selectedTripId, storage])

  return { saveTripOffline, clearTripOffline: clearOfflineCopy }
}

export function useOfflineTripSync(options: UseOfflineTripSyncOptions) {
  const { adapter, storage, selectedTripId, isOffline, reloadWorkspace } = options
  const [offlineSummary, setOfflineSummary] = useState<OfflineSyncSummary | null>(null)
  const [offlineMapPacks, setOfflineMapPacks] = useState<OfflineMapPackEntry[]>([])
  const [syncProgress, setSyncProgress] = useState<OfflineSyncProgress | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [offlineError, setOfflineError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedTripId) {
      setOfflineSummary(null); setOfflineMapPacks([]); return
    }
    void Promise.all([readTripOfflineSummary(selectedTripId, storage), loadMapPacksFromStorage(selectedTripId, storage)]).then(([summary, packs]) => {
      setOfflineSummary(summary); setOfflineMapPacks(packs)
    })
  }, [selectedTripId, storage])

  const loadOfflineAttachmentBlob = useCallback(
    async (attachmentId: string): Promise<Blob | null> => (await storage.getAttachmentBlob(attachmentId))?.blob ?? null,
    [storage],
  )
  const bundleActions = useOfflineBundleActions({
    storage, selectedTripId, isOffline, setOfflineSummary, setOfflineMapPacks, setSyncProgress, setIsSyncing, setOfflineError,
  })
  const packActions = useMapPackActions(adapter, selectedTripId, isOffline, reloadWorkspace)

  return {
    offlineSummary, offlineMapPacks, syncProgress, isSyncing, offlineError,
    clearOfflineError: () => setOfflineError(null),
    loadOfflineAttachmentBlob, ...bundleActions, ...packActions,
  }
}
