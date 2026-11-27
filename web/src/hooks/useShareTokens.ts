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

  const runTokenMutation = useCallback(
    async <T,>(fn: (tripId: string) => Promise<T>): Promise<T> => {
      if (isOffline) {
        const msg = 'Offline Read-Only mode is active. Reconnect to manage share links.'
        setShareTokensError(msg)
        throw new Error(msg)
      }
      if (!selectedTripId) {
        throw new Error('Select a trip before managing share links.')
      }
      setShareTokensError(null)
      try {
        return await fn(selectedTripId)
      } catch (err: unknown) {
        setShareTokensError(extractShareError(err))
        throw err
      }
    },
    [isOffline, selectedTripId],
  )

  const createShareToken = useCallback(
    (payload: ShareTokenCreatePayload) =>
      runTokenMutation(async (tripId) => {
        const created = await adapter.createShareToken(tripId, payload)
        setShareTokens((prev) => [created, ...prev])
        return created
      }),
    [adapter, runTokenMutation],
  )

  const updateShareToken = useCallback(
    (tokenId: string, payload: ShareTokenUpdatePayload) =>
      runTokenMutation(async (tripId) => {
        const updated = await adapter.updateShareToken(tripId, tokenId, payload)
        setShareTokens((prev) => prev.map((t) => (t.id === tokenId ? updated : t)))
        return updated
      }),
    [adapter, runTokenMutation],
  )

  const rotateShareToken = useCallback(
    (tokenId: string) =>
      runTokenMutation(async (tripId) => {
        const rotated = await adapter.rotateShareToken(tripId, tokenId)
        setShareTokens((prev) =>
          prev.map((t) => (t.id === tokenId ? { ...t, is_active: false, revoked_at: t.revoked_at ?? new Date().toISOString() } : t)).concat(rotated),
        )
        return rotated
      }),
    [adapter, runTokenMutation],
  )

  const revokeShareToken = useCallback(
    (tokenId: string) =>
      runTokenMutation(async (tripId) => {
        const revoked = await adapter.revokeShareToken(tripId, tokenId)
        setShareTokens((prev) => prev.map((t) => (t.id === tokenId ? revoked : t)))
        return revoked
      }),
    [adapter, runTokenMutation],
  )

  const deleteShareToken = useCallback(
    (tokenId: string) =>
      runTokenMutation(async (tripId) => {
        await adapter.deleteShareToken(tripId, tokenId)
        setShareTokens((prev) => prev.filter((t) => t.id !== tokenId))
      }),
    [adapter, runTokenMutation],
  )

  return {
    shareTokens,
    shareTokensLoading,
    shareTokensError,
    loadShareTokens,
    createShareToken,
    updateShareToken,
    rotateShareToken,
    revokeShareToken,
    deleteShareToken,
  }
}
