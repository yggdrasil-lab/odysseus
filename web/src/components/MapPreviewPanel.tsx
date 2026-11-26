import React, { useMemo } from 'react'
import { Compass, Layers, MapPin } from 'lucide-react'
import {
  GlassCard,
  SectionHeader,
  SegmentedControl,
  SelectInput,
  StatusBadge,
} from '@yggdrasil-lab/ui'

import type { Day, ItineraryItem, Leg, MapScope } from '../types'
import { formatCalendarDayLabel, formatEventLocalTimeLabel } from '../utils/time'

interface MapPreviewPanelProps {
  legs: Leg[]
  days: Day[]
  items: ItineraryItem[]
  scope: MapScope
  onChangeScope: (scope: MapScope) => void
  selectedLegId: string
  onChangeLegId: (legId: string) => void
  selectedDayId: string
  onChangeDayId: (dayId: string) => void
}

function filterItemsForScope(
  scope: MapScope,
  items: ItineraryItem[],
  legs: Leg[],
  days: Day[],
  selectedLegId: string,
  selectedDayId: string,
): ItineraryItem[] {
  if (scope === 'day' && selectedDayId) {
    return items.filter((item) => item.day_id === selectedDayId)
  }
  if (scope === 'leg' && selectedLegId) {
    const leg = legs.find((entry) => entry.id === selectedLegId)
    if (!leg) return items
    const dayIds = new Set(
      days
        .filter((day) => day.date >= leg.start_date && day.date <= leg.end_date)
        .map((day) => day.id),
    )
    return items.filter((item) => item.day_id !== null && dayIds.has(item.day_id))
  }
  return items.filter((item) => item.day_id !== null)
}

export const MapPreviewPanel: React.FC<MapPreviewPanelProps> = ({
  legs,
  days,
  items,
  scope,
  onChangeScope,
  selectedLegId,
  onChangeLegId,
  selectedDayId,
  onChangeDayId,
}) => {
  const scopedItems = useMemo(
    () => filterItemsForScope(scope, items, legs, days, selectedLegId, selectedDayId),
    [scope, items, legs, days, selectedLegId, selectedDayId],
  )

  return (
    <GlassCard
      tone="glass"
      padding="md"
      className="space-y-4 lg:sticky lg:top-20"
      data-testid="map-preview-panel"
    >
      <SectionHeader
        title="Aegean Atlas"
        subtitle="MapLibre + Protomaps offline packs (Ticket 05)"
        icon={<Compass className="w-4 h-4" />}
        variant="brand"
        actions={<StatusBadge label="Preview" variant="info" size="xs" />}
      />

      <SegmentedControl<MapScope>
        value={scope}
        onChange={onChangeScope}
        variant="brand"
        fullWidth
        idPrefix="map-scope"
        options={[
          { id: 'trip', label: 'All Trip' },
          { id: 'leg', label: 'Leg' },
          { id: 'day', label: 'Day' },
        ]}
      />

      {scope === 'leg' && legs.length > 0 && (
        <SelectInput
          aria-label="Scope map to leg"
          variant="brand"
          value={selectedLegId}
          onChange={(e) => onChangeLegId(e.target.value)}
          options={legs.map((leg) => ({
            value: leg.id,
            label: `${leg.name} (${leg.primary_city})`,
          }))}
        />
      )}

      {scope === 'day' && days.length > 0 && (
        <SelectInput
          aria-label="Scope map to day"
          variant="brand"
          value={selectedDayId}
          onChange={(e) => onChangeDayId(e.target.value)}
          options={days.map((day) => ({
            value: day.id,
            label: formatCalendarDayLabel(day.date),
          }))}
        />
      )}

      <div
        className="relative overflow-hidden rounded-ui-control border border-border/80 bg-[#0b1623] p-4 min-h-[240px] flex flex-col justify-between"
        style={{
          backgroundImage:
            'radial-gradient(circle at 75% 20%, rgba(56, 189, 248, 0.18), transparent 52%), linear-gradient(rgba(56, 189, 248, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.06) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 24px 24px, 24px 24px',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <Layers className="w-3.5 h-3.5" />
            <span>{scope === 'trip' ? 'Full Route' : scope === 'leg' ? 'Leg Focus' : 'Day Route'}</span>
          </span>
          <span className="text-[11px] font-mono text-muted">{scopedItems.length} stops</span>
        </div>

        <div className="my-3 space-y-2">
          {scopedItems.length === 0 ? (
            <p className="text-xs text-muted">
              Schedule itinerary activities with place labels to plot pins for this scope.
            </p>
          ) : (
            scopedItems.slice(0, 5).map((item, idx) => {
              const localLabel = formatEventLocalTimeLabel(item)
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-card/85 border border-border/70 px-2.5 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-accent/20 text-accent font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{item.title}</p>
                      {Boolean(item.place_label) && (
                        <p className="text-[11px] text-muted truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-accent shrink-0" />
                          <span>{item.place_label}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  {Boolean(localLabel) && (
                    <span className="text-[10px] font-mono text-muted shrink-0">{localLabel}</span>
                  )}
                </div>
              )
            })
          )}
        </div>

        <p className="text-[11px] text-muted border-t border-border/60 pt-2">
          Interactive vector tiles, offline Leg .pmtiles bundles, and transit route lines land in Ticket 05.
        </p>
      </div>
    </GlassCard>
  )
}
