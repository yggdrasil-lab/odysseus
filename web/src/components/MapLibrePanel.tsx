import React, { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Compass, ExternalLink, MapPin, Navigation, Pencil, Plus, Route, Trash2 } from 'lucide-react'
import {
  AlertBanner,
  Button,
  GlassCard,
  SectionHeader,
  SegmentedControl,
  SelectInput,
  StatusBadge,
  TextInput,
} from '@yggdrasil-lab/ui'

import { OdysseusApiError } from '../api/client'
import { OFFLINE_FALLBACK_MAP_STYLE, registerOfflineMapPacks } from '../offline/pmtilesProtocol'
import type {
  Day,
  DayRoutesComputeResponse,
  ItineraryItem,
  Leg,
  MapScope,
  OfflineMapPackEntry,
  Place,
  RouteEstimate,
  RouteEstimateUpdatePayload,
  TravelMode,
} from '../types'
import {
  PLACE_CATEGORY_COLORS,
  PLACE_CATEGORY_LABELS,
  buildNavigationUrl,
  formatDistanceMeters,
  formatDurationMinutes,
  readNavProviderPreference,
  writeNavProviderPreference,
  type NavProvider,
} from '../utils/maps'
import { formatCalendarDayLabel } from '../utils/time'
import {
  buildPlacesGeoJson,
  buildRoutesGeoJson,
  computePlacesBounds,
  filterPlacesForMap,
  syncMapLibreSourcesAndLayers,
  type GeoJsonFeatureCollection,
} from './mapLayers'

const DEFAULT_MAP_STYLE =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty'

function canUseWebGL(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (/jsdom/i.test(window.navigator?.userAgent ?? '')) return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function fitMapViewport(map: maplibregl.Map, visiblePlaces: Place[], animate: boolean): void {
  const bounds = computePlacesBounds(visiblePlaces)
  if (bounds && visiblePlaces.length > 1) {
    map.fitBounds(bounds, { padding: 44, maxZoom: 14, duration: animate ? 250 : 0 })
  } else if (visiblePlaces.length === 1) {
    const center: [number, number] = [visiblePlaces[0].longitude, visiblePlaces[0].latitude]
    if (animate) map.easeTo({ center, zoom: 12 })
    else map.jumpTo({ center, zoom: 12 })
  }
}

function useMapLibreLifecycle(options: {
  webglAvailable: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  mapStyle: string | StyleSpecification
  visiblePlaces: Place[]
  placesGeoJson: GeoJsonFeatureCollection
  routesGeoJson: GeoJsonFeatureCollection
  dropPinMode: boolean
  onSelectPlace: (id: string) => void
  onDropPinAt: (lat: number, lng: number) => void
}): void {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const dropRef = useRef(options.dropPinMode)
  dropRef.current = options.dropPinMode
  const selectRef = useRef(options.onSelectPlace)
  selectRef.current = options.onSelectPlace
  const onDropRef = useRef(options.onDropPinAt)
  onDropRef.current = options.onDropPinAt
  const latestDataRef = useRef({ places: options.placesGeoJson, routes: options.routesGeoJson, visible: options.visiblePlaces })
  latestDataRef.current = { places: options.placesGeoJson, routes: options.routesGeoJson, visible: options.visiblePlaces }

  useEffect(() => {
    if (!options.webglAvailable || !options.containerRef.current) return
    const first = latestDataRef.current.visible[0]
    const map = new maplibregl.Map({
      container: options.containerRef.current,
      style: options.mapStyle,
      center: first ? [first.longitude, first.latitude] : [174.7633, -36.8485],
      zoom: 11,
      attributionControl: false,
    })
    mapRef.current = map
    readyRef.current = false

    const syncCurrentLayers = () => {
      readyRef.current = true
      syncMapLibreSourcesAndLayers(map, latestDataRef.current.places, latestDataRef.current.routes)
      fitMapViewport(map, latestDataRef.current.visible, false)
    }

    map.on('load', syncCurrentLayers)
    map.on('style.load', syncCurrentLayers)
    map.on('click', (event) => {
      const hitLayers = map.getLayer('odysseus-places-circle') ? ['odysseus-places-circle'] : []
      const hitId = map.queryRenderedFeatures(event.point, { layers: hitLayers })[0]?.properties?.id
      if (typeof hitId === 'string') { selectRef.current(hitId); return }
      if (dropRef.current) {
        onDropRef.current(Number(event.lngLat.lat.toFixed(6)), Number(event.lngLat.lng.toFixed(6)))
      }
    })

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [options.containerRef, options.webglAvailable])

  useEffect(() => {
    if (!mapRef.current) return
    readyRef.current = false
    mapRef.current.setStyle(options.mapStyle)
  }, [options.mapStyle])

  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return
    syncMapLibreSourcesAndLayers(mapRef.current, options.placesGeoJson, options.routesGeoJson)
    fitMapViewport(mapRef.current, options.visiblePlaces, true)
  }, [options.placesGeoJson, options.routesGeoJson, options.visiblePlaces])
}

const MapFallbackStage: React.FC<{
  visiblePlaces: Place[]
  stopNumbers: Map<string, number>
  isOffline: boolean
  hasPmtiles: boolean
  onSelectPlace: (id: string) => void
}> = ({ visiblePlaces, stopNumbers, isOffline, hasPmtiles, onSelectPlace }) => (
  <div
    data-testid="map-fallback-stage"
    className="rounded-ui-control border border-border/80 bg-[#0b1623] p-3.5 min-h-[220px] space-y-2.5"
  >
    <div className="flex items-center justify-between text-[11px] text-accent font-semibold uppercase tracking-wider">
      <span>Map Canvas (Fallback Preview)</span>
      <div className="flex items-center gap-2">
        {isOffline && (
          <StatusBadge
            label={hasPmtiles ? 'Offline PMTiles' : 'Offline Pins'}
            variant={hasPmtiles ? 'success' : 'warning'}
            size="xs"
          />
        )}
        <span className="font-mono text-muted">{visiblePlaces.length} pins</span>
      </div>
    </div>
    {visiblePlaces.length === 0 ? (
      <p className="text-xs text-muted">
        No saved places match this scope yet. Add a place via search, Google link, or manual pin.
      </p>
    ) : (
      <div className="space-y-1.5">
        {visiblePlaces.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelectPlace(place.id)}
            className="w-full flex items-center justify-between gap-2 rounded-lg bg-card/85 border border-border/70 px-2.5 py-2 text-left text-xs min-h-[44px]"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 text-slate-950"
                style={{ backgroundColor: PLACE_CATEGORY_COLORS[place.category] }}
              >
                {stopNumbers.get(place.id) ?? '*'}
              </span>
              <span className="truncate font-semibold text-foreground">{place.name}</span>
            </span>
            <span className="text-[10px] font-mono text-muted shrink-0">
              {place.is_backlog ? 'Backlog' : PLACE_CATEGORY_LABELS[place.category]}
            </span>
          </button>
        ))}
      </div>
    )}
  </div>
)

const MapCanvasStage: React.FC<{
  mapStyle: string | StyleSpecification
  isOffline: boolean
  hasPmtiles: boolean
  visiblePlaces: Place[]
  scopedRoutes: RouteEstimate[]
  stopNumbers: Map<string, number>
  placesById: Map<string, Place>
  dropPinMode: boolean
  onSelectPlace: (placeId: string) => void
  onDropPinAt: (lat: number, lng: number) => void
}> = ({
  mapStyle,
  isOffline,
  hasPmtiles,
  visiblePlaces,
  scopedRoutes,
  stopNumbers,
  placesById,
  dropPinMode,
  onSelectPlace,
  onDropPinAt,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const webglAvailable = useMemo(() => canUseWebGL(), [])
  const placesGeoJson = useMemo(() => buildPlacesGeoJson(visiblePlaces, stopNumbers), [stopNumbers, visiblePlaces])
  const routesGeoJson = useMemo(() => buildRoutesGeoJson(scopedRoutes, placesById), [placesById, scopedRoutes])

  useMapLibreLifecycle({
    webglAvailable,
    containerRef,
    mapStyle,
    visiblePlaces,
    placesGeoJson,
    routesGeoJson,
    dropPinMode,
    onSelectPlace,
    onDropPinAt,
  })

  if (!webglAvailable) {
    return (
      <MapFallbackStage
        visiblePlaces={visiblePlaces}
        stopNumbers={stopNumbers}
        isOffline={isOffline}
        hasPmtiles={hasPmtiles}
        onSelectPlace={onSelectPlace}
      />
    )
  }

  return (
    <div className="relative rounded-ui-control overflow-hidden border border-border/80 bg-[#0b1623] h-[270px]">
      <div
        ref={containerRef}
        data-testid="maplibre-canvas"
        className={`w-full h-full ${dropPinMode ? 'cursor-crosshair' : 'cursor-grab'}`}
      />
      {isOffline && (
        <div className="absolute top-2 right-2 pointer-events-none">
          <StatusBadge
            label={hasPmtiles ? 'Offline PMTiles' : 'Offline Pins'}
            variant={hasPmtiles ? 'success' : 'warning'}
            size="xs"
          />
        </div>
      )}
      {dropPinMode && (
        <div className="absolute top-2 left-2 right-2 pointer-events-none flex justify-center">
          <span className="px-2.5 py-1 rounded-full bg-slate-950/90 border border-accent/60 text-[11px] font-semibold text-accent shadow">
            Tap anywhere on the map to drop a Place pin
          </span>
        </div>
      )}
    </div>
  )
}

const SelectedPlaceDetailCard: React.FC<{
  place: Place
  navProvider: NavProvider
  readOnly: boolean
  onEdit: (place: Place) => void
  onDelete: (placeId: string) => Promise<void>
}> = ({ place, navProvider, readOnly, onEdit, onDelete }) => (
  <div data-testid={`selected-place-${place.id}`} className="rounded-ui-control bg-background/70 border border-border/80 p-3 space-y-2">
    <div className="flex items-start justify-between gap-2">
      <div className="space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PLACE_CATEGORY_COLORS[place.category] }} />
          <h4 className="text-xs font-bold text-foreground">{place.name}</h4>
          <StatusBadge label={PLACE_CATEGORY_LABELS[place.category]} variant="info" size="xs" showDot={false} />
          {place.is_backlog && <StatusBadge label="Backlog" variant="warning" size="xs" showDot={false} />}
        </div>
        {Boolean(place.address) && <p className="text-[11px] text-muted">{place.address}</p>}
        <p className="text-[10px] font-mono text-muted">
          {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="xs" disabled={readOnly} aria-label={`Edit place ${place.name}`} className="min-h-[44px] sm:min-h-[34px]" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => onEdit(place)} />
        <Button variant="ghost" size="xs" disabled={readOnly} aria-label={`Delete place ${place.name}`} className="min-h-[44px] sm:min-h-[34px]" icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />} onClick={() => void onDelete(place.id)} />
      </div>
    </div>
    {Boolean(place.notes) && <p className="text-xs text-slate-300">{place.notes}</p>}
    <a
      href={buildNavigationUrl(place, navProvider)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold min-h-[44px] sm:min-h-[36px] hover:opacity-90 transition-opacity"
    >
      <Navigation className="w-3.5 h-3.5" />
      <span>Navigate ({navProvider === 'apple' ? 'Apple Maps' : 'Google Maps'})</span>
      <ExternalLink className="w-3 h-3" />
    </a>
  </div>
)

const RouteEstimateRow: React.FC<{
  route: RouteEstimate
  fromName: string
  toName: string
  readOnly: boolean
  onUpdateRoute: (routeId: string, payload: RouteEstimateUpdatePayload) => Promise<void>
}> = ({ route, fromName, toName, readOnly, onUpdateRoute }) => {
  const [editing, setEditing] = useState(false)
  const [durationDraft, setDurationDraft] = useState(String(route.duration_minutes))
  const [modeDraft, setModeDraft] = useState<TravelMode>(route.travel_mode)
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const mins = Number(durationDraft)
    if (Number.isNaN(mins) || mins < 0) return
    setSaving(true)
    try {
      await onUpdateRoute(route.id, { duration_minutes: Math.round(mins), travel_mode: modeDraft, manual_override: true })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-background/70 border border-border/70 px-2.5 py-2 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{fromName} -&gt; {toName}</p>
          <p className="text-[11px] font-mono text-muted">
            {formatDistanceMeters(route.distance_meters)} · {formatDurationMinutes(route.duration_minutes)} · {route.travel_mode}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge label={route.source} variant={route.source === 'osrm' ? 'success' : route.source === 'manual' ? 'purple' : 'info'} size="xs" showDot={false} />
          <Button variant="ghost" size="xs" disabled={readOnly} className="min-h-[44px] sm:min-h-[32px]" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Close' : 'Override'}
          </Button>
        </div>
      </div>
      {editing && !readOnly && (
        <form onSubmit={(e) => void handleSave(e)} className="flex flex-wrap items-center gap-2 pt-1">
          <TextInput aria-label="Override duration minutes" type="number" min="0" variant="brand" containerClassName="w-24" value={durationDraft} onChange={(e) => setDurationDraft(e.target.value)} />
          <SelectInput
            aria-label="Override travel mode"
            variant="brand"
            containerClassName="w-28"
            value={modeDraft}
            onChange={(e) => setModeDraft(e.target.value as TravelMode)}
            options={[
              { value: 'drive', label: 'Drive' },
              { value: 'walk', label: 'Walk' },
              { value: 'transit', label: 'Transit' },
              { value: 'ferry', label: 'Ferry' },
              { value: 'flight', label: 'Flight' },
            ]}
          />
          <Button type="submit" variant="brand" size="xs" loading={saving} className="min-h-[44px]">Save</Button>
        </form>
      )}
    </div>
  )
}

const DayRoutesSection: React.FC<{
  activeDayId: string
  scopedRoutes: RouteEstimate[]
  placesById: Map<string, Place>
  readOnly: boolean
  onComputeDayRoutes: (dayId: string, travelMode: TravelMode) => Promise<DayRoutesComputeResponse>
  onUpdateRouteEstimate: (routeId: string, payload: RouteEstimateUpdatePayload) => Promise<void>
}> = ({ activeDayId, scopedRoutes, placesById, readOnly, onComputeDayRoutes, onUpdateRouteEstimate }) => {
  const [travelMode, setTravelMode] = useState<TravelMode>('drive')
  const [computing, setComputing] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCompute = async () => {
    setComputing(true); setError(null); setWarning(null)
    try {
      const res = await onComputeDayRoutes(activeDayId, travelMode)
      if (res.fallback_used && res.warning) setWarning(res.warning)
    } catch (err: unknown) {
      setError(err instanceof OdysseusApiError ? err.detail : 'Unable to compute day routes.')
    } finally {
      setComputing(false)
    }
  }

  return (
    <div className="space-y-2 pt-2 border-t border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted inline-flex items-center gap-1.5">
          <Route className="w-3.5 h-3.5 text-accent" />
          <span>Day Route Estimates ({scopedRoutes.length})</span>
        </span>
        <div className="flex items-center gap-1.5">
          <SelectInput aria-label="Route travel mode" variant="brand" containerClassName="w-28" disabled={readOnly} value={travelMode} onChange={(e) => setTravelMode(e.target.value as TravelMode)} options={[{ value: 'drive', label: 'Drive' }, { value: 'walk', label: 'Walk' }, { value: 'transit', label: 'Transit' }]} />
          <Button variant="outline" size="xs" disabled={readOnly} loading={computing} className="min-h-[44px]" onClick={() => void handleCompute()}>
            Estimate Road Route
          </Button>
        </div>
      </div>
      {warning && <AlertBanner variant="warning" title="OSRM Fallback Active">{warning}</AlertBanner>}
      {error && <AlertBanner variant="error" title="Route Compute Failed">{error}</AlertBanner>}
      {scopedRoutes.map((route) => (
        <RouteEstimateRow
          key={route.id}
          route={route}
          fromName={placesById.get(route.from_place_id)?.name ?? 'Origin'}
          toName={placesById.get(route.to_place_id)?.name ?? 'Destination'}
          readOnly={readOnly}
          onUpdateRoute={onUpdateRouteEstimate}
        />
      ))}
    </div>
  )
}

export interface MapLibrePanelProps {
  legs: Leg[]
  days: Day[]
  items: ItineraryItem[]
  places: Place[]
  routeEstimates: RouteEstimate[]
  scope: MapScope
  onChangeScope: (scope: MapScope) => void
  selectedLegId: string
  onChangeLegId: (legId: string) => void
  selectedDayId: string
  onChangeDayId: (dayId: string) => void
  readOnly?: boolean
  isOffline?: boolean
  offlineMapPacks?: OfflineMapPackEntry[]
  onOpenAddPlace: (initialCoords?: { lat: number; lng: number }) => void
  onEditPlace: (place: Place) => void
  onDeletePlace: (placeId: string) => Promise<void>
  onComputeDayRoutes: (dayId: string, travelMode: TravelMode) => Promise<DayRoutesComputeResponse>
  onUpdateRouteEstimate: (routeId: string, payload: RouteEstimateUpdatePayload) => Promise<void>
}

const MapScopeControls: React.FC<{
  scope: MapScope
  legs: Leg[]
  days: Day[]
  selectedLegId: string
  selectedDayId: string
  showBacklog: boolean
  navProvider: NavProvider
  onChangeScope: (scope: MapScope) => void
  onChangeLegId: (legId: string) => void
  onChangeDayId: (dayId: string) => void
  onToggleBacklog: (v: boolean) => void
  onChangeNavProvider: (p: NavProvider) => void
}> = (p) => (
  <>
    <SegmentedControl<MapScope> value={p.scope} onChange={p.onChangeScope} variant="brand" fullWidth idPrefix="map-scope" options={[{ id: 'trip', label: 'All Trip' }, { id: 'leg', label: 'Leg' }, { id: 'day', label: 'Day' }]} />
    {p.scope === 'leg' && p.legs.length > 0 && (
      <SelectInput aria-label="Scope map to leg" variant="brand" value={p.selectedLegId} onChange={(e) => p.onChangeLegId(e.target.value)} options={p.legs.map((leg) => ({ value: leg.id, label: `${leg.name} (${leg.primary_city})` }))} />
    )}
    {p.scope === 'day' && p.days.length > 0 && (
      <SelectInput aria-label="Scope map to day" variant="brand" value={p.selectedDayId} onChange={(e) => p.onChangeDayId(e.target.value)} options={p.days.map((day) => ({ value: day.id, label: formatCalendarDayLabel(day.date) }))} />
    )}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <label className="inline-flex items-center gap-2 min-h-[44px] sm:min-h-[32px] text-foreground cursor-pointer">
        <input type="checkbox" checked={p.showBacklog} onChange={(e) => p.onToggleBacklog(e.target.checked)} className="w-4 h-4 accent-sky-400" />
        <span>Show Backlog Pins</span>
      </label>
      <div className="inline-flex items-center gap-1 rounded-lg bg-background/70 border border-border/70 p-0.5">
        <button type="button" onClick={() => p.onChangeNavProvider('google')} className={`px-2 py-1 rounded-md text-[11px] font-semibold min-h-[34px] ${p.navProvider === 'google' ? 'bg-accent text-accent-fg' : 'text-muted'}`}>Google</button>
        <button type="button" onClick={() => p.onChangeNavProvider('apple')} className={`px-2 py-1 rounded-md text-[11px] font-semibold min-h-[34px] ${p.navProvider === 'apple' ? 'bg-accent text-accent-fg' : 'text-muted'}`}>Apple</button>
      </div>
    </div>
  </>
)

export const MapLibrePanel: React.FC<MapLibrePanelProps> = (props) => {
  const [showBacklog, setShowBacklog] = useState(true)
  const [dropPinMode, setDropPinMode] = useState(false)
  const [selectedPlaceId, setSelectedPlaceId] = useState('')
  const [navProvider, setNavProvider] = useState<NavProvider>(() => readNavProviderPreference())
  const readOnly = Boolean(props.readOnly)
  const isOffline = Boolean(props.isOffline)
  const offlinePacks = props.offlineMapPacks ?? []

  const mapStyle = useMemo<string | StyleSpecification>(() => {
    if (!isOffline) return DEFAULT_MAP_STYLE
    return offlinePacks.length > 0 ? registerOfflineMapPacks(offlinePacks) : OFFLINE_FALLBACK_MAP_STYLE
  }, [isOffline, offlinePacks])

  const placesById = useMemo(() => new Map(props.places.map((p) => [p.id, p])), [props.places])
  const { visiblePlaces, stopNumbers } = useMemo(
    () => filterPlacesForMap({
      scope: props.scope, places: props.places, items: props.items, routes: props.routeEstimates,
      legs: props.legs, days: props.days, selectedLegId: props.selectedLegId, selectedDayId: props.selectedDayId, showBacklog,
    }),
    [props.scope, props.places, props.items, props.routeEstimates, props.legs, props.days, props.selectedLegId, props.selectedDayId, showBacklog],
  )
  const scopedRoutes = useMemo(
    () => (props.scope === 'day' && props.selectedDayId ? props.routeEstimates.filter((r) => r.day_id === props.selectedDayId) : props.routeEstimates),
    [props.routeEstimates, props.scope, props.selectedDayId],
  )
  const selectedPlace = placesById.get(selectedPlaceId) ?? visiblePlaces[0] ?? null
  const activeDayId = props.selectedDayId || props.days[0]?.id || ''

  return (
    <GlassCard id="section-places" tone="glass" padding="md" className="space-y-3.5 lg:sticky lg:top-20" data-testid="map-preview-panel">
      <SectionHeader
        title="Aegean Atlas"
        subtitle="MapLibre vector pins, day routes, and zero-key Place entry"
        icon={<Compass className="w-4 h-4" />}
        variant="brand"
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant={dropPinMode ? 'brand' : 'outline'} size="xs" disabled={readOnly} className="min-h-[44px] sm:min-h-[34px]" icon={<MapPin className="w-3.5 h-3.5" />} onClick={() => setDropPinMode((v) => !v)}>
              {dropPinMode ? 'Tap Map...' : 'Drop Pin'}
            </Button>
            <Button variant="brand" size="xs" disabled={readOnly} className="min-h-[44px] sm:min-h-[34px]" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => props.onOpenAddPlace()}>
              Add Place
            </Button>
          </div>
        }
      />
      <MapScopeControls
        scope={props.scope} legs={props.legs} days={props.days} selectedLegId={props.selectedLegId} selectedDayId={props.selectedDayId}
        showBacklog={showBacklog} navProvider={navProvider} onChangeScope={props.onChangeScope} onChangeLegId={props.onChangeLegId}
        onChangeDayId={props.onChangeDayId} onToggleBacklog={setShowBacklog} onChangeNavProvider={(p) => { setNavProvider(p); writeNavProviderPreference(p) }}
      />
      <MapCanvasStage mapStyle={mapStyle} isOffline={isOffline} hasPmtiles={offlinePacks.length > 0} visiblePlaces={visiblePlaces} scopedRoutes={scopedRoutes} stopNumbers={stopNumbers} placesById={placesById} dropPinMode={!readOnly && dropPinMode} onSelectPlace={setSelectedPlaceId} onDropPinAt={(lat, lng) => { if (readOnly) return; setDropPinMode(false); props.onOpenAddPlace({ lat, lng }) }} />
      {visiblePlaces.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visiblePlaces.map((place) => {
            const num = stopNumbers.get(place.id)
            const active = selectedPlace?.id === place.id
            return (
              <button key={place.id} type="button" onClick={() => setSelectedPlaceId(place.id)} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium min-h-[36px] transition-colors ${active ? 'bg-accent/15 border-accent/60 text-accent' : 'bg-background/60 border-border/80 text-muted hover:text-foreground'}`}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PLACE_CATEGORY_COLORS[place.category] }} />
                <span>{num ? `${num}. ` : ''}{place.name}</span>
              </button>
            )
          })}
        </div>
      )}
      {selectedPlace && <SelectedPlaceDetailCard place={selectedPlace} navProvider={navProvider} readOnly={readOnly} onEdit={props.onEditPlace} onDelete={props.onDeletePlace} />}
      {activeDayId && <DayRoutesSection activeDayId={activeDayId} scopedRoutes={scopedRoutes} placesById={placesById} readOnly={readOnly} onComputeDayRoutes={props.onComputeDayRoutes} onUpdateRouteEstimate={props.onUpdateRouteEstimate} />}
    </GlassCard>
  )
}
