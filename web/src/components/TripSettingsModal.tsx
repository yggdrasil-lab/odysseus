import React, { useEffect, useState } from 'react'
import { AlertBanner, Button, FormField, Modal, TextInput } from '@yggdrasil-lab/ui'

import { OdysseusApiError } from '../api/client'
import type { Trip } from '../types'

export interface TripSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  trip: Trip
  isOffline?: boolean
  onSave: (payload: {
    immich_album_id: string | null
    vault_note_path: string | null
  }) => Promise<void>
}

function extractSaveError(err: unknown): string {
  if (err instanceof OdysseusApiError) return err.detail
  return err instanceof Error ? err.message : 'Unable to save trip links.'
}

function useTripSettingsForm(props: TripSettingsModalProps) {
  const { isOpen, onClose, trip, isOffline = false, onSave } = props
  const [albumId, setAlbumId] = useState(trip.immich_album_id ?? '')
  const [vaultPath, setVaultPath] = useState(trip.vault_note_path ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setAlbumId(trip.immich_album_id ?? '')
    setVaultPath(trip.vault_note_path ?? '')
    setErrorMessage(null)
  }, [isOpen, trip.immich_album_id, trip.vault_note_path])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isOffline) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await onSave({
        immich_album_id: albumId.trim() || null,
        vault_note_path: vaultPath.trim() || null,
      })
      onClose()
    } catch (err: unknown) {
      setErrorMessage(extractSaveError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return { albumId, setAlbumId, vaultPath, setVaultPath, submitting, errorMessage, handleSubmit }
}

const TripSettingsFields: React.FC<{
  albumId: string
  vaultPath: string
  disabled: boolean
  onChangeAlbumId: (value: string) => void
  onChangeVaultPath: (value: string) => void
}> = ({ albumId, vaultPath, disabled, onChangeAlbumId, onChangeVaultPath }) => (
  <>
    <FormField
      label="Immich Album ID"
      htmlFor="trip-immich-album-id"
      hint="Optional private Immich album UUID. Leave empty to match photos by Trip dates."
    >
      <TextInput
        id="trip-immich-album-id"
        variant="brand"
        disabled={disabled}
        className="text-base sm:text-xs"
        value={albumId}
        onChange={(e) => onChangeAlbumId(e.target.value)}
        placeholder="e.g. a1b2c3d4-0000-0000-0000-000000000000"
      />
    </FormField>
    <FormField
      label="Obsidian Vault Note Path"
      htmlFor="trip-vault-note-path"
      hint="Optional reference path included in one-way Markdown exports (never shared publicly)."
    >
      <TextInput
        id="trip-vault-note-path"
        variant="brand"
        disabled={disabled}
        className="text-base sm:text-xs"
        value={vaultPath}
        onChange={(e) => onChangeVaultPath(e.target.value)}
        placeholder="second-brain/Areas/40-Leisure/Trip Note.md"
      />
    </FormField>
  </>
)

export const TripSettingsModal: React.FC<TripSettingsModalProps> = (props) => {
  const { isOpen, onClose, isOffline = false } = props
  const form = useTripSettingsForm(props)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Trip Links">
      <form
        data-testid="trip-settings-modal"
        onSubmit={(e) => void form.handleSubmit(e)}
        className="space-y-3"
      >
        {form.errorMessage && (
          <AlertBanner variant="error" title="Save failed">
            {form.errorMessage}
          </AlertBanner>
        )}
        <TripSettingsFields
          albumId={form.albumId}
          vaultPath={form.vaultPath}
          disabled={isOffline || form.submitting}
          onChangeAlbumId={form.setAlbumId}
          onChangeVaultPath={form.setVaultPath}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" className="min-h-[44px]" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="brand"
            disabled={isOffline || form.submitting}
            loading={form.submitting}
            className="min-h-[44px]"
          >
            Save Links
          </Button>
        </div>
      </form>
    </Modal>
  )
}
