import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiRoutingError, SessionExpiredError, type OdysseusApiAdapter } from '../api/client'
import { BrowserOfflineStorageAdapter, type OfflineStorageAdapter } from '../offline/storage'
import type {
  ChronosPreview,
  ChronosSyncRequest,
  ChronosSyncResponse,
  DayRoutesComputeResponse,
  TravelMode,
  Trip,
  TripWorkspace,
} from '../types'
import { useOfflineTripSync } from './useOfflineTripSync'
import { useShareTokens } from './useShareTokens'
import { useTripBudget } from './useTripBudget'
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

function readNavigatorOffline(): boolean {
  return typeof navigator !== 'undefined' ? !navigator.onLine : false
}

function useOfflineStatus(): boolean {
  const [isOffline, setIsOffline] = useState<boolean>(() => readNavigatorOffline())

  useEffect(() => {
    const syncStatus = () => setIsOffline(readNavigatorOffline())
    window.addEventListener('online', syncStatus)
    window.addEventListener('offline', syncStatus)
    return () => {
      window.removeEventListener('online', syncStatus)
      window.removeEventListener('offline', syncStatus)
    }
  }, [])

  return isOffline
}

async function hydrateFromStorage(
  storage: OfflineStorageAdapter,
  preferredTripId?: string | null,
): Promise<{ trips: Trip[]; selectedTripId: string; workspace: TripWorkspace } | null> {
  const records = await storage.listTripRecords()
  if (records.length === 0) return null
  const target = (preferredTripId && records.find((r) => r.tripId === preferredTripId)) || records[0]
  return {
    trips: records.map((r) => r.workspace.trip),
    selectedTripId: target.tripId,
    workspace: target.workspace,
  }
}

async function fetchInitialWorkspace(adapter: OdysseusApiAdapter, signal?: AbortSignal) {
  const tripList = await adapter.listTrips(signal)
  if (signal?.aborted) return null
  if (tripList.length === 0) return { trips: tripList, selectedTripId: null, workspace: null }
  const targetId = tripList[0].id
  const loaded = await adapter.getWorkspace(targetId, signal)
  if (signal?.aborted) return null
  return { trips: tripList, selectedTripId: targetId, workspace: loaded }
}

function useWorkspaceQueries(adapter: OdysseusApiAdapter, storage: OfflineStorageAdapter) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<TripWorkspace | null>(null)
  const [workspaceVersion, setWorkspaceVersion] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<WorkspaceErrorState | null>(null)

  const applyOfflineFallback = useCallback(
    async (preferredTripId?: string | null): Promise<boolean> => {
      const cached = await hydrateFromStorage(storage, preferredTripId)
      if (!cached) return false
      setTrips(cached.trips); setSelectedTripId(cached.selectedTripId)
      setWorkspace(cached.workspace); setWorkspaceVersion((v) => v + 1); setLoadError(null)
      return true
    },
    [storage],
  )

  const hydrateTrips = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true); setLoadError(null)
      try {
        if (readNavigatorOffline()) {
          if (!(await applyOfflineFallback()) && !signal?.aborted) {
            setLoadError({ kind: 'api', message: 'Offline and no cached trip found on this device.' })
          }
          return
        }
        const loaded = await fetchInitialWorkspace(adapter, signal)
        if (loaded) {
          setTrips(loaded.trips); setSelectedTripId(loaded.selectedTripId)
          setWorkspace(loaded.workspace); setWorkspaceVersion((v) => v + 1)
        }
      } catch (err: unknown) {
        if (signal?.aborted || (readNavigatorOffline() && (await applyOfflineFallback()))) return
        setLoadError(classifyError(err))
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [adapter, applyOfflineFallback],
  )

  const reloadWorkspace = useCallback(
    async (tripId: string) => {
      setIsRefreshing(true); setLoadError(null)
      try {
        if (readNavigatorOffline()) {
          if (!(await applyOfflineFallback(tripId))) setLoadError({ kind: 'api', message: 'Offline copy not found for selected trip.' })
          return
        }
        const [tripList, loaded] = await Promise.all([adapter.listTrips(), adapter.getWorkspace(tripId)])
        setTrips(tripList); setWorkspace(loaded); setWorkspaceVersion((v) => v + 1)
      } catch (err: unknown) {
        if (readNavigatorOffline() && (await applyOfflineFallback(tripId))) return
        setLoadError(classifyError(err))
      } finally {
        setIsRefreshing(false)
      }
    },
    [adapter, applyOfflineFallback],
  )

  return {
    trips, selectedTripId, setSelectedTripId, workspace, workspaceVersion,
    isLoading, isRefreshing, loadError, hydrateTrips, reloadWorkspace,
  }
}

function useWave3WorkspaceQueries(options: {
  adapter: OdysseusApiAdapter
  selectedTripId: string | null
  isOffline: boolean
  reloadWorkspace: (tripId: string) => Promise<void>
  setActionError: (err: WorkspaceErrorState | null) => void
}) {
  const { adapter, selectedTripId, isOffline, reloadWorkspace, setActionError } = options
  const searchPlaces = useCallback(
    async (query: string) => {
      if (isOffline) throw new Error('Offline Read-Only mode is active. Place search requires a connection.')
      return selectedTripId ? adapter.searchPlaces(selectedTripId, query) : []
    },
    [adapter, isOffline, selectedTripId],
  )
  const resolvePlaceUrl = useCallback(
    async (url: string) => {
      if (isOffline) throw new Error('Offline Read-Only mode is active. Link resolution requires a connection.')
      if (!selectedTripId) throw new Error('Select a trip before resolving map links.')
      return adapter.resolvePlaceUrl(selectedTripId, url)
    },
    [adapter, isOffline, selectedTripId],
  )
  const computeDayRoutes = useCallback(
    async (dayId: string, travelMode: TravelMode): Promise<DayRoutesComputeResponse> => {
      if (isOffline) throw new Error('Offline Read-Only mode is active. Route computation requires a connection.')
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
    [adapter, isOffline, reloadWorkspace, selectedTripId, setActionError],
  )
  const attachmentContentUrl = useCallback(
    (attachmentId: string) => (selectedTripId ? adapter.attachmentContentUrl(selectedTripId, attachmentId) : ''),
    [adapter, selectedTripId],
  )
  return { searchPlaces, resolvePlaceUrl, computeDayRoutes, attachmentContentUrl }
}

function useGuardedWorkspaceMutations(options: {
  adapter: OdysseusApiAdapter
  isOffline: boolean
  selectedTripId: string | null
  setSelectedTripId: (id: string | null) => void
  reloadWorkspace: (tripId: string) => Promise<void>
  setActionError: (err: WorkspaceErrorState | null) => void
}) {
  const { adapter, isOffline, selectedTripId, setSelectedTripId, reloadWorkspace, setActionError } = options
  const assertOnline = useCallback(() => {
    if (isOffline || readNavigatorOffline()) {
      const err = new Error('Offline Read-Only mode is active. Reconnect to edit this trip.')
      setActionError(classifyError(err))
      throw err
    }
  }, [isOffline, setActionError])

  const runMutation = useCallback(
    async (fn: (tripId: string) => Promise<void>) => {
      assertOnline()
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
    [assertOnline, reloadWorkspace, selectedTripId, setActionError],
  )

  const actions = useMemo(
    () =>
      buildWorkspaceActions({
        adapter, runMutation,
        onTripCreated: async (tripId) => { setActionError(null); setSelectedTripId(tripId); await reloadWorkspace(tripId) },
        onActionError: (err) => setActionError(classifyError(err)),
      }),
    [adapter, reloadWorkspace, runMutation, setActionError, setSelectedTripId],
  )
  const guardedCreateTrip = useCallback(
    async (payload: Parameters<typeof actions.createTrip>[0]) => { assertOnline(); return actions.createTrip(payload) },
    [actions, assertOnline],
  )
  return { ...actions, createTrip: guardedCreateTrip }
}

function useChronosSyncActions(options: {
  adapter: OdysseusApiAdapter
  selectedTripId: string | null
  isOffline: boolean
  reloadWorkspace: (tripId: string) => Promise<void>
}) {
  const { adapter, selectedTripId, isOffline, reloadWorkspace } = options
  const loadChronosPreview = useCallback(async (): Promise<ChronosPreview> => {
    if (isOffline || readNavigatorOffline()) {
      throw new Error('Offline Read-Only mode is active. Reconnect to preview Chronos sync.')
    }
    if (!selectedTripId) throw new Error('Select a trip before previewing Chronos sync.')
    return adapter.getChronosPreview(selectedTripId)
  }, [adapter, isOffline, selectedTripId])

  const syncTripToChronos = useCallback(
    async (payload?: ChronosSyncRequest): Promise<ChronosSyncResponse> => {
      if (isOffline || readNavigatorOffline()) {
        throw new Error('Offline Read-Only mode is active. Reconnect to sync Chronos.')
      }
      if (!selectedTripId) throw new Error('Select a trip before syncing to Chronos.')
      const result = await adapter.syncTripToChronos(selectedTripId, payload)
      await reloadWorkspace(selectedTripId)
      return result
    },
    [adapter, isOffline, reloadWorkspace, selectedTripId],
  )

  return { loadChronosPreview, syncTripToChronos }
}

export function useOdysseusWorkspace(adapter: OdysseusApiAdapter, storage?: OfflineStorageAdapter) {
  const resolvedStorage = useMemo(() => storage ?? new BrowserOfflineStorageAdapter(), [storage])
  const isOffline = useOfflineStatus()
  const queries = useWorkspaceQueries(adapter, resolvedStorage)
  const [actionError, setActionError] = useState<WorkspaceErrorState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void queries.hydrateTrips(controller.signal)
    return () => controller.abort()
  }, [queries.hydrateTrips])

  const mutations = useGuardedWorkspaceMutations({
    adapter, isOffline, selectedTripId: queries.selectedTripId,
    setSelectedTripId: queries.setSelectedTripId, reloadWorkspace: queries.reloadWorkspace, setActionError,
  })
  const wave3 = useWave3WorkspaceQueries({
    adapter, selectedTripId: queries.selectedTripId, isOffline, reloadWorkspace: queries.reloadWorkspace, setActionError,
  })
  const offline = useOfflineTripSync({
    adapter, storage: resolvedStorage, selectedTripId: queries.selectedTripId, isOffline, reloadWorkspace: queries.reloadWorkspace,
  })
  const shareTokens = useShareTokens({
    adapter, selectedTripId: queries.selectedTripId, isOffline,
  })
  const budget = useTripBudget(adapter, queries.selectedTripId, isOffline, queries.workspaceVersion)
  const chronos = useChronosSyncActions({
    adapter, selectedTripId: queries.selectedTripId, isOffline, reloadWorkspace: queries.reloadWorkspace,
  })

  const selectTrip = useCallback(
    async (tripId: string) => { queries.setSelectedTripId(tripId); setActionError(null); await queries.reloadWorkspace(tripId) },
    [queries.reloadWorkspace, queries.setSelectedTripId],
  )
  const refresh = useCallback(async () => {
    if (!queries.selectedTripId) await queries.hydrateTrips()
    else await queries.reloadWorkspace(queries.selectedTripId)
  }, [queries.hydrateTrips, queries.reloadWorkspace, queries.selectedTripId])

  return {
    trips: queries.trips, selectedTripId: queries.selectedTripId, workspace: queries.workspace,
    isLoading: queries.isLoading, isRefreshing: queries.isRefreshing, loadError: queries.loadError,
    actionError, isOffline, clearActionError: () => setActionError(null), selectTrip, refresh,
    budgetSummary: budget.budgetSummary, budgetLoading: budget.isLoading, budgetError: budget.budgetError, refreshBudget: budget.refreshBudget,
    ...wave3, ...mutations, ...offline, ...shareTokens, ...chronos,
  }
}
