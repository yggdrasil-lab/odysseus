import React, { useEffect, useState } from 'react'
import { Link2, MapPin, Search } from 'lucide-react'
import {
  AlertBanner,
  Button,
  FormField,
  LoadingState,
  Modal,
  SearchInput,
  SegmentedControl,
  SelectInput,
  TextArea,
  TextInput,
  useDebouncedValue,
} from '@yggdrasil-lab/ui'

import { OdysseusApiError } from '../api/client'
import type {
  Place,
  PlaceCategory,
  PlaceCreatePayload,
  PlaceSearchCandidate,
  PlaceUpdatePayload,
  ResolvePlaceUrlResponse,
} from '../types'

type PlaceEntryTab = 'search' | 'url' | 'manual'

interface PlaceDraftState {
  name: string
  category: PlaceCategory
  latitude: string
  longitude: string
  address: string
  externalMapUrl: string
  googlePlaceId: string
  osmId: string
  notes: string
  isBacklog: boolean
}

const VALID_CATEGORIES = new Set<PlaceCategory>([
  'lodging', 'airport', 'food', 'activity', 'transit', 'other',
])

function normalizeCategoryHint(hint: string | null): PlaceCategory {
  return hint && VALID_CATEGORIES.has(hint as PlaceCategory) ? (hint as PlaceCategory) : 'other'
}

function hydratePlaceDraft(
  editingPlace: Place | null,
  initialCoords: { lat: number; lng: number } | null,
): PlaceDraftState {
  if (editingPlace) {
    return {
      name: editingPlace.name,
      category: editingPlace.category,
      latitude: String(editingPlace.latitude),
      longitude: String(editingPlace.longitude),
      address: editingPlace.address ?? '',
      externalMapUrl: editingPlace.external_map_url ?? '',
      googlePlaceId: editingPlace.google_place_id ?? '',
      osmId: editingPlace.osm_id ?? '',
      notes: editingPlace.notes ?? '',
      isBacklog: editingPlace.is_backlog,
    }
  }
  return {
    name: '',
    category: 'activity',
    latitude: initialCoords ? String(initialCoords.lat) : '',
    longitude: initialCoords ? String(initialCoords.lng) : '',
    address: '',
    externalMapUrl: '',
    googlePlaceId: '',
    osmId: '',
    notes: '',
    isBacklog: false,
  }
}

const PhotonSearchTab: React.FC<{
  isOpen: boolean
  active: boolean
  onSearchPlaces: (query: string) => Promise<PlaceSearchCandidate[]>
  onSelectCandidate: (candidate: PlaceSearchCandidate) => void
}> = ({ isOpen, active, onSearchPlaces, onSelectCandidate }) => {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 350)
  const [candidates, setCandidates] = useState<PlaceSearchCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setCandidates([])
      setSearchError(null)
    }
  }, [isOpen])

  useEffect(() => {
    const trimmed = debounced.trim()
    if (!isOpen || !active || trimmed.length < 2) {
      setCandidates([])
      setSearchError(null)
      return
    }
    let cancelled = false
    setSearching(true)
    setSearchError(null)
    void onSearchPlaces(trimmed)
      .then((res) => { if (!cancelled) setCandidates(res) })
      .catch((err: unknown) => {
        if (!cancelled) setSearchError(err instanceof OdysseusApiError ? err.detail : 'Place search failed.')
      })
      .finally(() => { if (!cancelled) setSearching(false) })
    return () => { cancelled = true }
  }, [active, debounced, isOpen, onSearchPlaces])

  return (
    <div className="space-y-2.5">
      <SearchInput value={query} onChange={setQuery} variant="brand" placeholder="Search city, hotel, ferry terminal, or cafe..." data-testid="place-photon-search" />
      {searching && <LoadingState label="Searching Photon places..." variant="brand" />}
      {searchError && <AlertBanner variant="error" title="Geocoder error">{searchError}</AlertBanner>}
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {candidates.map((cand, idx) => (
          <button
            key={`${cand.osm_id ?? cand.name}-${idx}`}
            type="button"
            onClick={() => onSelectCandidate(cand)}
            className="w-full text-left rounded-ui-control bg-background/70 border border-border/80 hover:border-accent/60 px-3 py-2.5 space-y-0.5 min-h-[44px]"
          >
            <p className="text-xs font-semibold text-foreground">{cand.name}</p>
            {Boolean(cand.address) && <p className="text-[11px] text-muted truncate">{cand.address}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}

const ManualPlaceForm: React.FC<{
  draft: PlaceDraftState
  editing: boolean
  submitting: boolean
  saveError: string | null
  onPatch: (patch: Partial<PlaceDraftState>) => void
  onSubmit: (event: React.FormEvent) => Promise<void>
  onClose: () => void
}> = ({ draft, editing, submitting, saveError, onPatch, onSubmit, onClose }) => (
  <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
    {saveError && <AlertBanner variant="error" title="Place save failed">{saveError}</AlertBanner>}
    <FormField label="Place Name" htmlFor="place-name" required>
      <TextInput id="place-name" variant="brand" required value={draft.name} onChange={(e) => onPatch({ name: e.target.value })} placeholder="Harbour View Hotel" />
    </FormField>
    <FormField label="Category" htmlFor="place-category">
      <SelectInput
        id="place-category"
        variant="brand"
        value={draft.category}
        onChange={(e) => onPatch({ category: e.target.value as PlaceCategory })}
        options={[
          { value: 'lodging', label: 'Lodging' },
          { value: 'airport', label: 'Airport' },
          { value: 'food', label: 'Food' },
          { value: 'activity', label: 'Activity' },
          { value: 'transit', label: 'Transit' },
          { value: 'other', label: 'Other' },
        ]}
      />
    </FormField>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FormField label="Latitude" htmlFor="place-lat" required>
        <TextInput id="place-lat" type="number" step="any" variant="brand" required value={draft.latitude} onChange={(e) => onPatch({ latitude: e.target.value })} placeholder="-36.8485" />
      </FormField>
      <FormField label="Longitude" htmlFor="place-lng" required>
        <TextInput id="place-lng" type="number" step="any" variant="brand" required value={draft.longitude} onChange={(e) => onPatch({ longitude: e.target.value })} placeholder="174.7633" />
      </FormField>
    </div>
    <FormField label="Address" htmlFor="place-address">
      <TextInput id="place-address" variant="brand" value={draft.address} onChange={(e) => onPatch({ address: e.target.value })} placeholder="12 Quay Street" />
    </FormField>
    <FormField label="External Map URL" htmlFor="place-ext-url">
      <TextInput id="place-ext-url" variant="brand" value={draft.externalMapUrl} onChange={(e) => onPatch({ externalMapUrl: e.target.value })} placeholder="https://maps.google.com/..." />
    </FormField>
    <FormField label="Notes" htmlFor="place-notes">
      <TextArea id="place-notes" variant="brand" value={draft.notes} onChange={(e) => onPatch({ notes: e.target.value })} placeholder="Check-in desk notes or gate entrance" />
    </FormField>
    <label className="flex items-center gap-2.5 min-h-[44px] text-xs text-foreground cursor-pointer">
      <input type="checkbox" checked={draft.isBacklog} onChange={(e) => onPatch({ isBacklog: e.target.checked })} className="w-4 h-4 accent-sky-400" />
      <span>Save as Backlog / Wishlist Pin</span>
    </label>
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="ghost" onClick={onClose} className="min-h-[44px]">Cancel</Button>
      <Button type="submit" variant="brand" loading={submitting} className="min-h-[44px]">
        {editing ? 'Save Place' : 'Add Place'}
      </Button>
    </div>
  </form>
)

export interface PlaceEntryModalProps {
  isOpen: boolean
  editingPlace: Place | null
  initialCoords: { lat: number; lng: number } | null
  onClose: () => void
  onSearchPlaces: (query: string) => Promise<PlaceSearchCandidate[]>
  onResolvePlaceUrl: (url: string) => Promise<ResolvePlaceUrlResponse>
  onCreatePlace: (payload: PlaceCreatePayload) => Promise<void>
  onUpdatePlace: (placeId: string, payload: PlaceUpdatePayload) => Promise<void>
}

export const PlaceEntryModal: React.FC<PlaceEntryModalProps> = ({
  isOpen,
  editingPlace,
  initialCoords,
  onClose,
  onSearchPlaces,
  onResolvePlaceUrl,
  onCreatePlace,
  onUpdatePlace,
}) => {
  const [activeTab, setActiveTab] = useState<PlaceEntryTab>('search')
  const [rawUrl, setRawUrl] = useState('')
  const [resolvingUrl, setResolvingUrl] = useState(false)
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<PlaceDraftState>(() => hydratePlaceDraft(null, null))
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setRawUrl(''); setFallbackNotice(null); setSaveError(null)
    setActiveTab(editingPlace || initialCoords ? 'manual' : 'search')
    setDraft(hydratePlaceDraft(editingPlace, initialCoords))
  }, [editingPlace, initialCoords, isOpen])

  const patchDraft = (patch: Partial<PlaceDraftState>) => setDraft((prev) => ({ ...prev, ...patch }))

  const handleResolveUrl = async () => {
    const trimmed = rawUrl.trim()
    if (!trimmed) return
    setResolvingUrl(true); setFallbackNotice(null)
    try {
      const resolved = await onResolvePlaceUrl(trimmed)
      patchDraft({
        externalMapUrl: resolved.resolved_url || trimmed,
        latitude: String(resolved.latitude),
        longitude: String(resolved.longitude),
        name: draft.name.trim() ? draft.name : resolved.suggested_name ?? '',
        googlePlaceId: resolved.google_place_id ?? '',
      })
      setActiveTab('manual')
    } catch (err: unknown) {
      const detail = err instanceof OdysseusApiError ? err.detail : 'Unable to extract coordinates from link.'
      patchDraft({ externalMapUrl: trimmed })
      setFallbackNotice(`${detail} Switched to Manual Pin with your link preserved.`)
      setActiveTab('manual')
    } finally {
      setResolvingUrl(false)
    }
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    const latNum = Number(draft.latitude)
    const lngNum = Number(draft.longitude)
    if (!draft.name.trim() || Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      setSaveError('Name, valid latitude, and valid longitude are required.')
      return
    }
    setSubmitting(true); setSaveError(null)
    const payload: PlaceCreatePayload = {
      name: draft.name.trim(), category: draft.category, latitude: latNum, longitude: lngNum,
      address: draft.address.trim() || null, external_map_url: draft.externalMapUrl.trim() || null,
      google_place_id: draft.googlePlaceId.trim() || null, osm_id: draft.osmId.trim() || null,
      notes: draft.notes.trim() || null, is_backlog: draft.isBacklog,
    }
    try {
      if (editingPlace) await onUpdatePlace(editingPlace.id, payload)
      else await onCreatePlace(payload)
      onClose()
    } catch (err: unknown) {
      setSaveError(err instanceof OdysseusApiError ? err.detail : 'Unable to save place.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingPlace ? 'Edit Saved Place' : 'Add Trip Place'} className="max-w-lg">
      <div className="space-y-3">
        <SegmentedControl<PlaceEntryTab>
          value={activeTab}
          onChange={setActiveTab}
          variant="brand"
          fullWidth
          idPrefix="place-tab"
          options={[
            { id: 'search', label: 'Search (Photon)', icon: <Search className="w-3.5 h-3.5" /> },
            { id: 'url', label: 'Paste Google Link', icon: <Link2 className="w-3.5 h-3.5" /> },
            { id: 'manual', label: 'Map Tap / Manual', icon: <MapPin className="w-3.5 h-3.5" /> },
          ]}
        />
        {fallbackNotice && <AlertBanner variant="warning" title="Manual Pin Fallback">{fallbackNotice}</AlertBanner>}
        {activeTab === 'search' && (
          <PhotonSearchTab
            isOpen={isOpen}
            active={activeTab === 'search'}
            onSearchPlaces={onSearchPlaces}
            onSelectCandidate={(cand) => {
              patchDraft({
                name: cand.name, latitude: String(cand.latitude), longitude: String(cand.longitude),
                address: cand.address ?? '', osmId: cand.osm_id ?? '', category: normalizeCategoryHint(cand.category_hint),
              })
              setFallbackNotice(null); setActiveTab('manual')
            }}
          />
        )}
        {activeTab === 'url' && (
          <div className="space-y-3">
            <FormField label="Google Maps Share URL" htmlFor="place-google-url">
              <TextInput id="place-google-url" variant="brand" value={rawUrl} onChange={(e) => setRawUrl(e.target.value)} placeholder="https://maps.app.goo.gl/... or https://www.google.com/maps/@..." />
            </FormField>
            <Button variant="brand" size="sm" loading={resolvingUrl} className="min-h-[44px] w-full" onClick={() => void handleResolveUrl()}>
              Resolve Link
            </Button>
          </div>
        )}
        {activeTab === 'manual' && (
          <ManualPlaceForm draft={draft} editing={Boolean(editingPlace)} submitting={submitting} saveError={saveError} onPatch={patchDraft} onSubmit={handleSave} onClose={onClose} />
        )}
      </div>
    </Modal>
  )
}
