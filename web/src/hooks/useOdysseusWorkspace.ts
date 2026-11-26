import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiRoutingError, SessionExpiredError, type OdysseusApiAdapter } from '../api/client'
import type { Trip, TripWorkspace } from '../types'
import { buildWorkspaceActions } from './workspaceActions'

export interface WorkspaceErrorState {
  kind: 'session' | 'routing' | 'api'
  message: string
}

function classifyError(err: unknown): WorkspaceErrorState {
  if (err instanceof SessionExpiredError) {
    return { kind: 'session', message: err.message }
  }
  if (err instanceof ApiRoutingError) {
    return { kind: 'routing', message: err.message }
  }
  const message = err instanceof Error ? err.message : 'Unexpected Odysseus API failure'
  return { kind: 'api', message }
}

export function useOdysseusWorkspace(adapter: OdysseusApiAdapter) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<TripWorkspace | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<WorkspaceErrorState | null>(null)
  const [actionError, setActionError] = useState<WorkspaceErrorState | null>(null)

  const hydrateTrips = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const tripList = await adapter.listTrips(signal)
        if (signal?.aborted) return
        setTrips(tripList)
        if (tripList.length === 0) {
          setSelectedTripId(null)
          setWorkspace(null)
          return
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

  useEffect(() => {
    const controller = new AbortController()
    void hydrateTrips(controller.signal)
    return () => controller.abort()
  }, [hydrateTrips])

  const reloadWorkspace = useCallback(
    async (tripId: string) => {
      setIsRefreshing(true)
      setLoadError(null)
      try {
        const [tripList, loaded] = await Promise.all([
          adapter.listTrips(),
          adapter.getWorkspace(tripId),
        ])
        setTrips(tripList)
        setWorkspace(loaded)
      } catch (err: unknown) {
        setLoadError(classifyError(err))
      } finally {
        setIsRefreshing(false)
      }
    },
    [adapter],
  )

  const runMutation = useCallback(
    async (fn: (tripId: string) => Promise<void>) => {
      if (!selectedTripId) return
      setActionError(null)
      try {
        await fn(selectedTripId)
        await reloadWorkspace(selectedTripId)
      } catch (err: unknown) {
        setActionError(classifyError(err))
        throw err
      }
    },
    [reloadWorkspace, selectedTripId],
  )

  const actions = useMemo(
    () =>
      buildWorkspaceActions({
        adapter,
        runMutation,
        onTripCreated: async (tripId) => {
          setActionError(null)
          setSelectedTripId(tripId)
          await reloadWorkspace(tripId)
        },
        onActionError: (err) => setActionError(classifyError(err)),
      }),
    [adapter, reloadWorkspace, runMutation],
  )

  const selectTrip = useCallback(
    async (tripId: string) => {
      setSelectedTripId(tripId)
      setActionError(null)
      await reloadWorkspace(tripId)
    },
    [reloadWorkspace],
  )

  const refresh = useCallback(async () => {
    if (!selectedTripId) {
      await hydrateTrips()
      return
    }
    await reloadWorkspace(selectedTripId)
  }, [hydrateTrips, reloadWorkspace, selectedTripId])

  return {
    trips,
    selectedTripId,
    workspace,
    isLoading,
    isRefreshing,
    loadError,
    actionError,
    clearActionError: () => setActionError(null),
    selectTrip,
    refresh,
    ...actions,
  }
}
