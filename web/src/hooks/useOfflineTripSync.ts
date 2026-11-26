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

export function useOfflineTripSync(options: UseOfflineTripSyncOptions) {
  const { adapter, storage, selectedTripId, isOffline, reloadWorkspace } = options
  const [offlineSummary, setOfflineSummary] = useState<OfflineSyncSummary | null>(null)
  const [offlineMapPacks, setOfflineMapPacks] = useState<OfflineMapPackEntry[]>([])
  const [syncProgress, setSyncProgress] = useState<OfflineSyncProgress | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [offlineError, setOfflineError] = useState<string | null>(null)

  const refreshOfflineMeta = useCallback(
    async (tripId: string | null) => {
      if (!tripId) {
        setOfflineSummary(null)
        setOfflineMapPacks([])
        return
      }
      const [summary, packs] = await Promise.all([
        readTripOfflineSummary(tripId, storage),
        loadMapPacksFromStorage(tripId, storage),
      ])
      setOfflineSummary(summary)
      setOfflineMapPacks(packs)
    },
    [storage],
  )

  useEffect(() => {
    void refreshOfflineMeta(selectedTripId)
  }, [refreshOfflineMeta, selectedTripId])

  const saveTripOffline = useCallback(
    async (includeMapPacks: boolean) => {
      if (!selectedTripId) return
      if (isOffline) {
        const msg = 'Reconnect to the network before syncing a trip offline.'
        setOfflineError(msg)
        throw new Error(msg)
      }
      setIsSyncing(true)
      setOfflineError(null)
      setSyncProgress(null)
      try {
        const summary = await runSaveTripOffline({
          tripId: selectedTripId,
          includeMapPacks,
          storage,
          onProgress: setSyncProgress,
        })
        setOfflineSummary(summary)
        setOfflineMapPacks(await loadMapPacksFromStorage(selectedTripId, storage))
      } catch (err: unknown) {
        setOfflineError(err instanceof Error ? err.message : 'Offline sync failed.')
        throw err
      } finally {
        setIsSyncing(false)
      }
    },
    [isOffline, selectedTripId, storage],
  )

  const clearOfflineCopy = useCallback(async () => {
    if (!selectedTripId) return
    setOfflineError(null)
    await clearTripOffline(selectedTripId, storage)
    setOfflineSummary(null)
    setOfflineMapPacks([])
    setSyncProgress(null)
  }, [selectedTripId, storage])

  const loadOfflineAttachmentBlob = useCallback(
    async (attachmentId: string): Promise<Blob | null> => {
      const found = await storage.getAttachmentBlob(attachmentId)
      return found?.blob ?? null
    },
    [storage],
  )

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

  return {
    offlineSummary,
    offlineMapPacks,
    syncProgress,
    isSyncing,
    offlineError,
    clearOfflineError: () => setOfflineError(null),
    saveTripOffline,
    clearTripOffline: clearOfflineCopy,
    loadOfflineAttachmentBlob,
    createMapPack,
    deleteMapPack,
  }
}
