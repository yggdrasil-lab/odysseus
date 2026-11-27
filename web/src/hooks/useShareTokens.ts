import { useCallback, useEffect, useState } from 'react'

import { OdysseusApiError, type OdysseusApiAdapter } from '../api/client'
import type { ShareToken, ShareTokenCreatePayload, ShareTokenUpdatePayload } from '../types'

interface UseShareTokensOptions {
  adapter: OdysseusApiAdapter
  selectedTripId: string | null
  isOffline: boolean
}

function extractShareError(err: unknown): string {
  if (err instanceof OdysseusApiError) return err.detail
  return err instanceof Error ? err.message : 'Share link operation failed.'
}

function useShareTokenRunner(
  selectedTripId: string | null,
  isOffline: boolean,
  setError: (msg: string | null) => void,
) {
  return useCallback(
    async <T,>(fn: (tripId: string) => Promise<T>): Promise<T> => {
      if (isOffline) {
        const msg = 'Offline Read-Only mode is active. Reconnect to manage share links.'
        setError(msg)
        throw new Error(msg)
      }
      if (!selectedTripId) {
        throw new Error('Select a trip before managing share links.')
      }
      setError(null)
      try {
        return await fn(selectedTripId)
      } catch (err: unknown) {
        setError(extractShareError(err))
        throw err
      }
    },
    [isOffline, selectedTripId, setError],
  )
}

function useShareTokenActions(options: {
  adapter: OdysseusApiAdapter
  runMutation: <T>(fn: (tripId: string) => Promise<T>) => Promise<T>
  setTokens: React.Dispatch<React.SetStateAction<ShareToken[]>>
}) {
  const { adapter, runMutation, setTokens } = options
  const createShareToken = useCallback(
    (payload: ShareTokenCreatePayload) =>
      runMutation(async (tripId) => {
        const created = await adapter.createShareToken(tripId, payload)
        setTokens((prev) => [created, ...prev])
        return created
      }),
    [adapter, runMutation, setTokens],
  )
  const updateShareToken = useCallback(
    (tokenId: string, payload: ShareTokenUpdatePayload) =>
      runMutation(async (tripId) => {
        const updated = await adapter.updateShareToken(tripId, tokenId, payload)
        setTokens((prev) => prev.map((t) => (t.id === tokenId ? updated : t)))
        return updated
      }),
    [adapter, runMutation, setTokens],
  )
  const rotateShareToken = useCallback(
    (tokenId: string) =>
      runMutation(async (tripId) => {
        const rotated = await adapter.rotateShareToken(tripId, tokenId)
        const nowIso = new Date().toISOString()
        setTokens((prev) => [
          rotated,
          ...prev.map((t) => (t.id === tokenId ? { ...t, is_active: false, revoked_at: t.revoked_at ?? nowIso } : t)),
        ])
        return rotated
      }),
    [adapter, runMutation, setTokens],
  )
  const revokeShareToken = useCallback(
    (tokenId: string) =>
      runMutation(async (tripId) => {
        const revoked = await adapter.revokeShareToken(tripId, tokenId)
        setTokens((prev) => prev.map((t) => (t.id === tokenId ? revoked : t)))
        return revoked
      }),
    [adapter, runMutation, setTokens],
  )
  const deleteShareToken = useCallback(
    (tokenId: string) =>
      runMutation(async (tripId) => {
        await adapter.deleteShareToken(tripId, tokenId)
        setTokens((prev) => prev.filter((t) => t.id !== tokenId))
      }),
    [adapter, runMutation, setTokens],
  )
  return { createShareToken, updateShareToken, rotateShareToken, revokeShareToken, deleteShareToken }
}

export function useShareTokens({ adapter, selectedTripId, isOffline }: UseShareTokensOptions) {
  const [shareTokens, setShareTokens] = useState<ShareToken[]>([])
  const [shareTokensLoading, setShareTokensLoading] = useState(false)
  const [shareTokensError, setShareTokensError] = useState<string | null>(null)

  useEffect(() => {
    setShareTokens([])
    setShareTokensError(null)
  }, [selectedTripId])

  const loadShareTokens = useCallback(async () => {
    if (!selectedTripId) return
    if (isOffline) {
      setShareTokensError('Reconnect to manage share links.')
      return
    }
    setShareTokensLoading(true)
    setShareTokensError(null)
    try {
      setShareTokens(await adapter.listShareTokens(selectedTripId))
    } catch (err: unknown) {
      setShareTokensError(extractShareError(err))
    } finally {
      setShareTokensLoading(false)
    }
  }, [adapter, isOffline, selectedTripId])

  const runMutation = useShareTokenRunner(selectedTripId, isOffline, setShareTokensError)
  const actions = useShareTokenActions({ adapter, runMutation, setTokens: setShareTokens })

  return { shareTokens, shareTokensLoading, shareTokensError, loadShareTokens, ...actions }
}
