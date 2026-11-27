import { useCallback, useEffect, useState } from 'react'

import { OdysseusApiError, type OdysseusApiAdapter } from '../api/client'
import type { TripBudgetSummary } from '../types'

function extractBudgetError(err: unknown): string {
  if (err instanceof OdysseusApiError) {
    return err.detail || `Plutus budget request failed (${err.status}).`
  }
  return err instanceof Error ? err.message : 'Unable to load Plutus trip budget.'
}

export interface UseTripBudgetResult {
  budgetSummary: TripBudgetSummary | null
  isLoading: boolean
  budgetError: string | null
  refreshBudget: () => Promise<void>
}

export function useTripBudget(
  adapter: Pick<OdysseusApiAdapter, 'getTripBudget'>,
  tripId: string | null,
  isOffline: boolean,
  workspaceVersion?: string | number,
): UseTripBudgetResult {
  const [budgetSummary, setBudgetSummary] = useState<TripBudgetSummary | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [budgetError, setBudgetError] = useState<string | null>(null)

  const loadBudget = useCallback(
    async (signal?: AbortSignal) => {
      if (!tripId || isOffline) return
      setIsLoading(true)
      setBudgetError(null)
      try {
        const result = await adapter.getTripBudget(tripId, signal)
        if (!signal?.aborted) {
          setBudgetSummary(result)
          setBudgetError(null)
        }
      } catch (err: unknown) {
        if (!signal?.aborted) {
          setBudgetSummary(null)
          setBudgetError(extractBudgetError(err))
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [adapter, isOffline, tripId],
  )

  useEffect(() => {
    if (!tripId) {
      setBudgetSummary(null)
      setBudgetError(null)
      setIsLoading(false)
      return
    }
    if (isOffline) {
      setIsLoading(false)
      return
    }
    const controller = new AbortController()
    void loadBudget(controller.signal)
    return () => controller.abort()
  }, [isOffline, loadBudget, tripId, workspaceVersion])

  const refreshBudget = useCallback(async () => {
    await loadBudget()
  }, [loadBudget])

  return { budgetSummary, isLoading, budgetError, refreshBudget }
}
