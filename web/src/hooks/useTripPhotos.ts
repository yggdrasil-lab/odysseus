import { useCallback, useEffect, useState } from 'react'

import type { OdysseusApiAdapter } from '../api/client'
import type { TripPhotosResponse } from '../types'

const IMMICH_OFFLINE_MESSAGE = 'Immich offline (Muspelheim asleep)'

export interface UseTripPhotosOptions {
  adapter: Pick<OdysseusApiAdapter, 'getTripPhotos'>
  tripId: string | null
  companionMode?: boolean
  isOffline: boolean
  immichAlbumId?: string | null
  workspaceVersion?: number
}

export interface UseTripPhotosResult {
  photosResponse: TripPhotosResponse | null
  isLoading: boolean
  retry: () => void
}

function buildOfflineFallback(tripId: string): TripPhotosResponse {
  return {
    trip_id: tripId,
    status: 'offline',
    source: 'none',
    message: IMMICH_OFFLINE_MESSAGE,
    total_photos: 0,
    days: [],
    ungrouped_photos: [],
  }
}

async function loadTripPhotos(
  adapter: Pick<OdysseusApiAdapter, 'getTripPhotos'>,
  tripId: string,
  signal: AbortSignal,
): Promise<TripPhotosResponse> {
  try {
    return await adapter.getTripPhotos(tripId, signal)
  } catch {
    return buildOfflineFallback(tripId)
  }
}

export function useTripPhotos({
  adapter,
  tripId,
  companionMode = false,
  isOffline,
  immichAlbumId,
  workspaceVersion,
}: UseTripPhotosOptions): UseTripPhotosResult {
  const [photosResponse, setPhotosResponse] = useState<TripPhotosResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [reloadTick, setReloadTick] = useState<number>(0)
  const enabled = Boolean(tripId) && !companionMode && !isOffline

  useEffect(() => {
    if (!tripId || companionMode) { setPhotosResponse(null); setIsLoading(false); return }
    if (isOffline) { setIsLoading(false); return }
    const controller = new AbortController()
    setIsLoading(true)
    void loadTripPhotos(adapter, tripId, controller.signal).then((res) => {
      if (!controller.signal.aborted) { setPhotosResponse(res); setIsLoading(false) }
    })
    return () => controller.abort()
  }, [adapter, companionMode, immichAlbumId, isOffline, reloadTick, tripId, workspaceVersion])

  const retry = useCallback(() => { if (enabled) setReloadTick((tick) => tick + 1) }, [enabled])
  return { photosResponse, isLoading, retry }
}
