import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiRoutingError, SessionExpiredError, type OdysseusApiAdapter } from '../api/client'
import type { DayRoutesComputeResponse, TravelMode, Trip, TripWorkspace } from '../types'
import { buildWorkspaceActions } from './workspaceActions'

export interface WorkspaceErrorState {
  kind: 'session' | 'routing' | 'api'
  message: string
}

function classifyError(err: unknown): WorkspaceErrorState {
  if (err instanceof SessionExpiredError) return { kind: 'session', message: err.message }
  if (err instanceof ApiRoutingError) return { kind: 'routing', message: err.message }
  const message = err instanceof Error ? err.message : 'Unexpected Odysseus API failure'
  return { kind: 'api', message }
}

function useWorkspaceQueries(adapter: OdysseusApiAdapter) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<TripWorkspace | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<WorkspaceErrorState | null>(null)

  const hydrateTrips = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true); setLoadError(null)
      try {
        const tripList = await adapter.listTrips(signal)
        if (signal?.aborted) return
        setTrips(tripList)
        if (tripList.length === 0) {
          setSelectedTripId(null); setWorkspace(null); return
        }
        const targetId = tripList[0].id
        setSelectedTripId(targetId)
        const loaded = await adapter.getWorkspace(targetId, signal)
        if (!signal?.aborted) setWorkspace(loaded)
      } catch (err: unknown) {
        if (!signal?.aborted) setLoadError(classifyError(err))
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [adapter],
  )

  const reloadWorkspace = useCallback(
    async (tripId: string) => {
      setIsRefreshing(true); setLoadError(null)
      try {
        const [tripList, loaded] = await Promise.all([adapter.listTrips(), adapter.getWorkspace(tripId)])
        setTrips(tripList); setWorkspace(loaded)
      } catch (err: unknown) {
        setLoadError(classifyError(err))
      } finally {
        setIsRefreshing(false)
      }
    },
    [adapter],
  )

  return { trips, selectedTripId, setSelectedTripId, workspace, isLoading, isRefreshing, loadError, hydrateTrips, reloadWorkspace }
}

function useWave3WorkspaceQueries(options: {
  adapter: OdysseusApiAdapter
  selectedTripId: string | null
  reloadWorkspace: (tripId: string) => Promise<void>
  setActionError: (err: WorkspaceErrorState | null) => void
}) {
  const { adapter, selectedTripId, reloadWorkspace, setActionError } = options

  const searchPlaces = useCallback(
    async (query: string) => (selectedTripId ? adapter.searchPlaces(selectedTripId, query) : []),
    [adapter, selectedTripId],
  )

  const resolvePlaceUrl = useCallback(
    async (url: string) => {
      if (!selectedTripId) throw new Error('Select a trip before resolving map links.')
      return adapter.resolvePlaceUrl(selectedTripId, url)
    },
    [adapter, selectedTripId],
  )

  const computeDayRoutes = useCallback(
    async (dayId: string, travelMode: TravelMode): Promise<DayRoutesComputeResponse> => {
      if (!selectedTripId) throw new Error('Select a trip before computing routes.')
      setActionError(null)
      try {
        const result = await adapter.computeDayRoutes(selectedTripId, dayId, travelMode)
        await reloadWorkspace(selectedTripId)
        return result
      } catch (err: unknown) {
        setActionError(classifyError(err))
        throw err
      }
    },
    [adapter, reloadWorkspace, selectedTripId, setActionError],
  )

  const attachmentContentUrl = useCallback(
    (attachmentId: string) => (selectedTripId ? adapter.attachmentContentUrl(selectedTripId, attachmentId) : ''),
    [adapter, selectedTripId],
  )

  return { searchPlaces, resolvePlaceUrl, computeDayRoutes, attachmentContentUrl }
}

export function useOdysseusWorkspace(adapter: OdysseusApiAdapter) {
  const queries = useWorkspaceQueries(adapter)
  const [actionError, setActionError] = useState<WorkspaceErrorState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void queries.hydrateTrips(controller.signal)
    return () => controller.abort()
  }, [queries.hydrateTrips])

  const runMutation = useCallback(
    async (fn: (tripId: string) => Promise<void>) => {
      if (!queries.selectedTripId) return
      setActionError(null)
      try {
        await fn(queries.selectedTripId)
        await queries.reloadWorkspace(queries.selectedTripId)
      } catch (err: unknown) {
        setActionError(classifyError(err))
        throw err
      }
    },
    [queries.reloadWorkspace, queries.selectedTripId],
  )

  const actions = useMemo(
    () =>
      buildWorkspaceActions({
        adapter,
        runMutation,
        onTripCreated: async (tripId) => {
          setActionError(null); queries.setSelectedTripId(tripId); await queries.reloadWorkspace(tripId)
        },
        onActionError: (err) => setActionError(classifyError(err)),
      }),
    [adapter, queries.reloadWorkspace, queries.setSelectedTripId, runMutation],
  )

  const wave3 = useWave3WorkspaceQueries({
    adapter, selectedTripId: queries.selectedTripId, reloadWorkspace: queries.reloadWorkspace, setActionError,
  })

  const selectTrip = useCallback(
    async (tripId: string) => {
      queries.setSelectedTripId(tripId); setActionError(null); await queries.reloadWorkspace(tripId)
    },
    [queries.reloadWorkspace, queries.setSelectedTripId],
  )

  const refresh = useCallback(async () => {
    if (!queries.selectedTripId) await queries.hydrateTrips()
    else await queries.reloadWorkspace(queries.selectedTripId)
  }, [queries.hydrateTrips, queries.reloadWorkspace, queries.selectedTripId])

  return {
    trips: queries.trips, selectedTripId: queries.selectedTripId, workspace: queries.workspace,
    isLoading: queries.isLoading, isRefreshing: queries.isRefreshing, loadError: queries.loadError,
    actionError, clearActionError: () => setActionError(null), selectTrip, refresh, ...wave3, ...actions,
  }
}
