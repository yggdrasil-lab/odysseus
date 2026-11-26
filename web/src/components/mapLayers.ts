import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl'

import type { Day, ItineraryItem, Leg, MapScope, Place, RouteEstimate } from '../types'
import { PLACE_CATEGORY_COLORS } from '../utils/maps'

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: {
      type: 'Point' | 'LineString'
      coordinates: [number, number] | Array<[number, number]>
    }
    properties: Record<string, string | number | boolean>
  }>
}

export function resolveScopedDayIds(
  scope: MapScope,
  legs: Leg[],
  days: Day[],
  selectedLegId: string,
  selectedDayId: string,
): Set<string> | null {
  if (scope === 'day' && selectedDayId) {
    return new Set([selectedDayId])
  }
  if (scope === 'leg' && selectedLegId) {
    const leg = legs.find((entry) => entry.id === selectedLegId)
    if (!leg) return null
    return new Set(
      days
        .filter((day) => day.date >= leg.start_date && day.date <= leg.end_date)
        .map((day) => day.id),
    )
  }
  return null
}

export function computeStopOrderMap(
  items: ItineraryItem[],
  scopedDayIds: Set<string> | null,
): Map<string, number> {
  const ordered = new Map<string, number>()
  const relevant = items.filter(
    (item) =>
      item.place_id !== null &&
      item.day_id !== null &&
      (scopedDayIds === null || scopedDayIds.has(item.day_id)),
  )
  relevant.sort((a, b) => {
    const timeA = a.start_local ?? ''
    const timeB = b.start_local ?? ''
    if (timeA !== timeB) return timeA.localeCompare(timeB)
    return a.sort_order - b.sort_order
  })
  let nextNumber = 1
  for (const item of relevant) {
    if (item.place_id && !ordered.has(item.place_id)) {
      ordered.set(item.place_id, nextNumber)
      nextNumber += 1
    }
  }
  return ordered
}

export function filterPlacesForMap(options: {
  scope: MapScope
  places: Place[]
  items: ItineraryItem[]
  routes: RouteEstimate[]
  legs: Leg[]
  days: Day[]
  selectedLegId: string
  selectedDayId: string
  showBacklog: boolean
}): { visiblePlaces: Place[]; stopNumbers: Map<string, number> } {
  const scopedDayIds = resolveScopedDayIds(
    options.scope,
    options.legs,
    options.days,
    options.selectedLegId,
    options.selectedDayId,
  )
  const stopNumbers = computeStopOrderMap(options.items, scopedDayIds)

  if (options.scope === 'trip') {
    const visible = options.places.filter((place) => !place.is_backlog || options.showBacklog)
    return { visiblePlaces: visible, stopNumbers }
  }

  const linkedIds = new Set<string>(stopNumbers.keys())
  for (const route of options.routes) {
    if (scopedDayIds === null || scopedDayIds.has(route.day_id)) {
      linkedIds.add(route.from_place_id)
      linkedIds.add(route.to_place_id)
    }
  }

  const visible = options.places.filter((place) => {
    if (linkedIds.has(place.id)) return true
    if (place.is_backlog) return options.showBacklog
    return linkedIds.size === 0
  })
  return { visiblePlaces: visible, stopNumbers }
}

export function buildPlacesGeoJson(
  places: Place[],
  stopNumbers: Map<string, number>,
): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: places.map((place) => {
      const stopNum = stopNumbers.get(place.id)
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [place.longitude, place.latitude],
        },
        properties: {
          id: place.id,
          name: place.name,
          category: place.category,
          color: PLACE_CATEGORY_COLORS[place.category] ?? PLACE_CATEGORY_COLORS.other,
          is_backlog: place.is_backlog,
          stop_label: stopNum ? `${stopNum}` : '',
        },
      }
    }),
  }
}

export function buildRoutesGeoJson(
  routes: RouteEstimate[],
  placesById: Map<string, Place>,
): GeoJsonFeatureCollection {
  const features: GeoJsonFeatureCollection['features'] = []
  for (const route of routes) {
    const geom = route.geometry_geojson as { type?: string; coordinates?: unknown } | null
    if (geom && geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: geom.coordinates as Array<[number, number]>,
        },
        properties: {
          id: route.id,
          source: route.source,
          travel_mode: route.travel_mode,
        },
      })
      continue
    }
    const fromPlace = placesById.get(route.from_place_id)
    const toPlace = placesById.get(route.to_place_id)
    if (fromPlace && toPlace) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [fromPlace.longitude, fromPlace.latitude],
            [toPlace.longitude, toPlace.latitude],
          ],
        },
        properties: {
          id: route.id,
          source: route.source,
          travel_mode: route.travel_mode,
        },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export function computePlacesBounds(
  places: Place[],
): [[number, number], [number, number]] | null {
  if (places.length === 0) return null
  let minLng = places[0].longitude
  let maxLng = places[0].longitude
  let minLat = places[0].latitude
  let maxLat = places[0].latitude
  for (const p of places) {
    minLng = Math.min(minLng, p.longitude)
    maxLng = Math.max(maxLng, p.longitude)
    minLat = Math.min(minLat, p.latitude)
    maxLat = Math.max(maxLat, p.latitude)
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

export function syncMapLibreSourcesAndLayers(
  map: MapLibreMap,
  placesGeoJson: GeoJsonFeatureCollection,
  routesGeoJson: GeoJsonFeatureCollection,
): void {
  const routeSrc = map.getSource('odysseus-routes') as GeoJSONSource | undefined
  if (routeSrc) {
    routeSrc.setData(routesGeoJson as unknown as GeoJSON.FeatureCollection)
  } else {
    map.addSource('odysseus-routes', {
      type: 'geojson',
      data: routesGeoJson as unknown as GeoJSON.FeatureCollection,
    })
    map.addLayer({
      id: 'odysseus-routes-line',
      type: 'line',
      source: 'odysseus-routes',
      paint: {
        'line-color': '#38bdf8',
        'line-width': 3.5,
        'line-opacity': 0.85,
      },
    })
  }

  const placeSrc = map.getSource('odysseus-places') as GeoJSONSource | undefined
  if (placeSrc) {
    placeSrc.setData(placesGeoJson as unknown as GeoJSON.FeatureCollection)
  } else {
    map.addSource('odysseus-places', {
      type: 'geojson',
      data: placesGeoJson as unknown as GeoJSON.FeatureCollection,
    })
    map.addLayer({
      id: 'odysseus-places-circle',
      type: 'circle',
      source: 'odysseus-places',
      paint: {
        'circle-radius': ['case', ['boolean', ['get', 'is_backlog'], false], 6, 9],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['case', ['boolean', ['get', 'is_backlog'], false], 0.55, 0.95],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#0f172a',
      },
    })
  }
}
