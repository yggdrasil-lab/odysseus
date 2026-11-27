import React, { useState } from 'react'
import {
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Inbox,
  Link2,
  MapPin,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Route,
  Trash2,
} from 'lucide-react'
import {
  Button,
  EmptyState,
  GlassCard,
  SectionHeader,
  SelectInput,
  StatusBadge,
  type StatusBadgeVariant,
} from '@yggdrasil-lab/ui'

import type {
  Booking,
  BookingSegment,
  Day,
  ImmichPhotoItem,
  ItineraryItem,
  Leg,
  Place,
  SharedBooking,
  SharedTripSummary,
  Trip,
  TripPhotosResponse,
  TripStatus,
} from '../types'
import { DayPhotoStrip, ImmichStatusBanner } from './DayPhotoStrip'

type TimelineTrip = Trip | SharedTripSummary
type TimelineBooking = Booking | SharedBooking
import {
  extractLocalDate,
  formatCalendarDayLabel,
  formatEventLocalTimeLabel,
  formatSegmentWallClock,
  legsCoveringDate,
} from '../utils/time'

const TRIP_STATUS_VARIANTS: Record<TripStatus, StatusBadgeVariant> = {
  planning: 'info',
  booked: 'success',
  active: 'busy',
  completed: 'purple',
  archived: 'idle',
}

export interface TripDocumentTimelineProps {
  trips: TimelineTrip[]
  trip: TimelineTrip
  legs: Leg[]
  days: Day[]
  items: ItineraryItem[]
  bookings?: TimelineBooking[]
  places?: Place[]
  tripPhotos?: TripPhotosResponse | null
  tripPhotosLoading?: boolean
  readOnly?: boolean
  companionMode?: boolean
  onSelectTrip: (tripId: string) => void
  onOpenNewTrip: () => void
  onOpenNewLeg: () => void
  onOpenNewItem: (defaultDayId: string | null) => void
  onOpenChronosSync?: () => void
  onOpenTripSettings?: () => void
  onExportMarkdown?: () => Promise<string>
  onRetryTripPhotos?: () => void
  onToggleItemDone: (item: ItineraryItem) => Promise<void>
  onToggleItemChronosSync?: (item: ItineraryItem) => Promise<void>
  onMoveItemDay: (itemId: string, dayId: string | null) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
}

interface DaySegmentEntry {
  booking: TimelineBooking
  segment: BookingSegment
  kind: 'departure' | 'arrival'
}

const SegmentTimelineRow: React.FC<{ entry: DaySegmentEntry; chronosSyncEnabled: boolean }> = ({
  entry,
  chronosSyncEnabled,
}) => {
  const { booking, segment, kind } = entry
  const origin = segment.origin_code ?? segment.origin_label
  const dest = segment.destination_code ?? segment.destination_label
  const timeText =
    kind === 'departure'
      ? formatSegmentWallClock(segment.departure_local, segment.departure_utc, segment.departure_tz)
      : formatSegmentWallClock(segment.arrival_local, segment.arrival_utc, segment.arrival_tz)

  return (
    <div
      data-testid={`day-${kind}-${segment.id}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-ui-control bg-card/65 border border-sky-500/30 px-3 py-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {kind === 'departure' ? (
          <PlaneTakeoff className="w-3.5 h-3.5 text-accent shrink-0" />
        ) : (
          <PlaneLanding className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}
        <span className="font-semibold text-foreground truncate">
          {kind === 'arrival' ? `Arrival: ${booking.title}` : booking.title}
        </span>
        <span className="font-mono text-[11px] text-muted">
          {origin} -&gt; {dest}
        </span>
        {segment.day_offset > 0 && (
          <StatusBadge label={`+${segment.day_offset}`} variant="warning" size="xs" showDot={false} />
        )}
        {Boolean(booking.confirmation_code) && (
          <span className="px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[10px] text-accent">
            {booking.confirmation_code}
          </span>
        )}
        {chronosSyncEnabled && booking.status === 'confirmed' && (
          <StatusBadge label="Chronos" variant="success" size="xs" showDot={false} />
        )}
      </div>
      <span className="font-mono text-[11px] text-accent shrink-0">{timeText}</span>
    </div>
  )
}

const ScheduledItemActions: React.FC<{
  item: ItineraryItem
  isDone: boolean
  readOnly: boolean
  onToggleDone: (item: ItineraryItem) => Promise<void>
  onToggleChronosSync?: (item: ItineraryItem) => Promise<void>
  onMoveToBacklog: (itemId: string) => Promise<void>
  onDelete: (itemId: string) => Promise<void>
}> = ({ item, isDone, readOnly, onToggleDone, onToggleChronosSync, onMoveToBacklog, onDelete }) => {
  const isTimed = Boolean(item.start_utc || item.start_local)
  return (
    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
      {isTimed && onToggleChronosSync && (
        <Button
          variant={item.sync_to_chronos ? 'secondary' : 'outline'}
          size="xs"
          disabled={readOnly}
          aria-label={`Toggle Chronos sync for ${item.title}`}
          className="min-h-[44px] sm:min-h-[34px]"
          icon={<CalendarCheck2 className="w-3.5 h-3.5" />}
          onClick={() => void onToggleChronosSync(item)}
        >
          Chronos
        </Button>
      )}
      <Button
        variant={isDone ? 'secondary' : 'outline'}
        size="xs"
        disabled={readOnly}
        className="min-h-[44px] sm:min-h-[34px]"
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        onClick={() => void onToggleDone(item)}
      >
        {isDone ? 'Reopen' : 'Done'}
      </Button>
      <Button
        variant="ghost"
        size="xs"
        disabled={readOnly}
        className="min-h-[44px] sm:min-h-[34px]"
        onClick={() => void onMoveToBacklog(item.id)}
      >
        Backlog
      </Button>
      <Button
        variant="danger"
        size="xs"
        disabled={readOnly}
        aria-label={`Delete ${item.title}`}
        className="min-h-[44px] sm:min-h-[34px]"
        icon={<Trash2 className="w-3.5 h-3.5" />}
        onClick={() => void onDelete(item.id)}
      />
    </div>
  )
}

const ScheduledItemRow: React.FC<{
  item: ItineraryItem
  linkedPlace?: Place
  readOnly: boolean
  companionMode: boolean
  onToggleDone: (item: ItineraryItem) => Promise<void>
  onToggleChronosSync?: (item: ItineraryItem) => Promise<void>
  onMoveToBacklog: (itemId: string) => Promise<void>
  onDelete: (itemId: string) => Promise<void>
}> = ({
  item,
  linkedPlace,
  readOnly,
  companionMode,
  onToggleDone,
  onToggleChronosSync,
  onMoveToBacklog,
  onDelete,
}) => {
  const timeLabel = formatEventLocalTimeLabel(item)
  const isDone = item.status === 'done'
  const placeDisplay = linkedPlace?.name ?? item.place_label
  return (
    <div
      data-testid={`itinerary-item-${item.id}`}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-ui-control bg-background/70 border border-border/80 px-3 py-2.5"
    >
      <div className="space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-xs font-semibold ${isDone ? 'line-through text-muted' : 'text-foreground'}`}>
            {item.title}
          </span>
          <StatusBadge label={item.category} variant="info" size="xs" showDot={false} />
          <StatusBadge label={item.status} variant={isDone ? 'success' : item.status === 'confirmed' ? 'info' : 'idle'} size="xs" />
          {item.sync_to_chronos && <StatusBadge label="Chronos" variant="success" size="xs" showDot={false} />}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
          {Boolean(timeLabel) && (
            <span className="inline-flex items-center gap-1 font-mono text-accent">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{timeLabel}</span>
            </span>
          )}
          {Boolean(placeDisplay) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3 shrink-0 text-accent" />
              <span>{placeDisplay}</span>
            </span>
          )}
        </div>
      </div>
      {!companionMode && (
        <ScheduledItemActions
          item={item}
          isDone={isDone}
          readOnly={readOnly}
          onToggleDone={onToggleDone}
          onToggleChronosSync={onToggleChronosSync}
          onMoveToBacklog={onMoveToBacklog}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}

const LegChaptersList: React.FC<{ legs: Leg[]; readOnly: boolean; companionMode: boolean; onOpenNewLeg: () => void }> = ({
  legs,
  readOnly,
  companionMode,
  onOpenNewLeg,
}) => (
  <div className="space-y-2 pt-1">
    <span className="text-xs font-semibold uppercase tracking-wider text-muted inline-flex items-center gap-1.5">
      <Route className="w-3.5 h-3.5 text-accent" />
      <span>Leg Chapters ({legs.length})</span>
    </span>
    {legs.length === 0 ? (
      <EmptyState
        title="No destination legs yet"
        description={companionMode ? 'No destination legs have been added to this trip yet.' : 'Add destination legs to automatically provision flat Trip days and timezone chapters.'}
        action={
          !companionMode ? (
            <Button variant="brand" size="sm" disabled={readOnly} onClick={onOpenNewLeg}>
              Add First Leg
            </Button>
          ) : undefined
        }
      />
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {legs.map((leg) => (
          <div
            key={leg.id}
            id={`leg-${leg.id}`}
            className="rounded-ui-control bg-background/60 border border-border/80 px-3 py-2.5 space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: leg.color }}
                />
                <span className="text-xs font-bold text-foreground truncate">{leg.name}</span>
              </div>
              <span className="text-[10px] font-mono text-muted shrink-0">{leg.base_timezone}</span>
            </div>
            <p className="text-[11px] text-muted">
              {leg.primary_city}
              {leg.country_code ? `, ${leg.country_code}` : ''} · {leg.start_date} to{' '}
              {leg.end_date}
            </p>
          </div>
        ))}
      </div>
    )}
  </div>
)

const TripOverviewActions: React.FC<{
  trips: TimelineTrip[]
  tripId: string
  readOnly: boolean
  onSelectTrip: (tripId: string) => void
  onOpenNewTrip: () => void
  onOpenNewLeg: () => void
}> = ({ trips, tripId, readOnly, onSelectTrip, onOpenNewTrip, onOpenNewLeg }) => (
  <div className="flex flex-wrap items-center gap-2">
    {trips.length > 1 && (
      <SelectInput
        aria-label="Switch active trip"
        variant="brand"
        value={tripId}
        onChange={(e) => onSelectTrip(e.target.value)}
        containerClassName="w-44"
        options={trips.map((entry) => ({ value: entry.id, label: entry.title }))}
      />
    )}
    <Button variant="outline" size="sm" disabled={readOnly} className="min-h-[44px]" icon={<Plus className="w-3.5 h-3.5" />} onClick={onOpenNewTrip}>
      New Trip
    </Button>
    <Button variant="brand" size="sm" disabled={readOnly} className="min-h-[44px]" icon={<Plus className="w-3.5 h-3.5" />} onClick={onOpenNewLeg}>
      Add Leg
    </Button>
  </div>
)

function triggerMarkdownDownload(tripSlug: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${tripSlug}.md`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const TripExportAndLinksBar: React.FC<{
  tripSlug: string
  vaultNotePath: string | null
  readOnly: boolean
  onOpenTripSettings?: () => void
  onExportMarkdown?: () => Promise<string>
}> = ({ tripSlug, vaultNotePath, readOnly, onOpenTripSettings, onExportMarkdown }) => {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const runExport = async (mode: 'copy' | 'download') => {
    if (!onExportMarkdown || readOnly) return
    setBusy(true)
    try {
      const md = await onExportMarkdown()
      if (mode === 'download') { triggerMarkdownDownload(tripSlug, md); return }
      if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {Boolean(vaultNotePath) && (
          <span data-testid="vault-note-path-pill" className="inline-flex items-center gap-1.5 rounded-full bg-background/80 border border-border px-2.5 py-1 text-[11px] font-mono text-muted max-w-full truncate" title={vaultNotePath as string}>
            <FileText className="w-3 h-3 text-accent shrink-0" /><span className="truncate">{vaultNotePath}</span>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onExportMarkdown && (
          <>
            <Button variant="outline" size="xs" disabled={readOnly || busy} className="min-h-[44px] sm:min-h-[34px]" icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} onClick={() => void runExport('copy')}>{copied ? 'Copied!' : 'Copy Markdown'}</Button>
            <Button variant="outline" size="xs" disabled={readOnly || busy} className="min-h-[44px] sm:min-h-[34px]" icon={<Download className="w-3.5 h-3.5" />} onClick={() => void runExport('download')}>Download .md</Button>
          </>
        )}
        {onOpenTripSettings && <Button variant="outline" size="xs" disabled={readOnly} className="min-h-[44px] sm:min-h-[34px]" icon={<Link2 className="w-3.5 h-3.5" />} onClick={onOpenTripSettings}>Trip Links</Button>}
      </div>
    </div>
  )
}

const TripOverviewCard: React.FC<{
  trips: TimelineTrip[]
  trip: TimelineTrip
  legs: Leg[]
  readOnly: boolean
  companionMode: boolean
  onSelectTrip: (tripId: string) => void
  onOpenNewTrip: () => void
  onOpenNewLeg: () => void
  onOpenChronosSync?: () => void
  onOpenTripSettings?: () => void
  onExportMarkdown?: () => Promise<string>
}> = ({ trips, trip, legs, readOnly, companionMode, onSelectTrip, onOpenNewTrip, onOpenNewLeg, onOpenChronosSync, onOpenTripSettings, onExportMarkdown }) => {
  const dateSummary = trip.start_date && trip.end_date ? `${trip.start_date} to ${trip.end_date}` : 'Dates flexible (planning)'
  const chronosEnabled = 'chronos_sync_enabled' in trip && Boolean(trip.chronos_sync_enabled)
  const vaultNotePath = !companionMode && 'vault_note_path' in trip ? trip.vault_note_path : null

  return (
    <GlassCard id="section-overview" tone="glass" padding="md" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold font-display text-foreground truncate">{trip.title}</h2>
            <StatusBadge label={trip.status} variant={TRIP_STATUS_VARIANTS[trip.status]} size="xs" />
            {!companionMode && onOpenChronosSync && (
              <Button
                data-testid="chronos-status-pill"
                variant={chronosEnabled ? 'secondary' : 'outline'}
                size="xs"
                className="min-h-[44px] sm:min-h-[30px]"
                icon={<CalendarCheck2 className={`w-3.5 h-3.5 ${chronosEnabled ? 'text-emerald-400' : ''}`} />}
                onClick={onOpenChronosSync}
              >
                {chronosEnabled ? 'Chronos: Active' : 'Chronos: Off'}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">
            {dateSummary} · Home TZ: <span className="font-mono">{trip.home_timezone}</span>
          </p>
        </div>
        {!companionMode && (
          <TripOverviewActions trips={trips} tripId={trip.id} readOnly={readOnly} onSelectTrip={onSelectTrip} onOpenNewTrip={onOpenNewTrip} onOpenNewLeg={onOpenNewLeg} />
        )}
      </div>
      {Boolean(trip.summary) && <p className="text-xs text-slate-300 leading-relaxed border-t border-border/60 pt-3">{trip.summary}</p>}
      {!companionMode && (onExportMarkdown || onOpenTripSettings || Boolean(vaultNotePath)) && (
        <TripExportAndLinksBar tripSlug={trip.slug} vaultNotePath={vaultNotePath} readOnly={readOnly} onOpenTripSettings={onOpenTripSettings} onExportMarkdown={onExportMarkdown} />
      )}
      <LegChaptersList legs={legs} readOnly={readOnly} companionMode={companionMode} onOpenNewLeg={onOpenNewLeg} />
    </GlassCard>
  )
}

const DayCard: React.FC<{
  day: Day
  coveringLegs: Leg[]
  dayItems: ItineraryItem[]
  daySegments: DaySegmentEntry[]
  dayPhotos: ImmichPhotoItem[]
  placesById: Map<string, Place>
  readOnly: boolean
  companionMode: boolean
  chronosSyncEnabled: boolean
  onOpenNewItem: (dayId: string) => void
  onToggleItemDone: (item: ItineraryItem) => Promise<void>
  onToggleItemChronosSync?: (item: ItineraryItem) => Promise<void>
  onMoveToBacklog: (itemId: string) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
}> = ({
  day,
  coveringLegs,
  dayItems,
  daySegments,
  dayPhotos,
  placesById,
  readOnly,
  companionMode,
  chronosSyncEnabled,
  onOpenNewItem,
  onToggleItemDone,
  onToggleItemChronosSync,
  onMoveToBacklog,
  onDeleteItem,
}) => (
  <section
    data-testid={`day-card-${day.date}`}
    className="rounded-ui-control bg-card-muted/40 border border-border/80 p-3.5 space-y-2.5"
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-foreground">
          {formatCalendarDayLabel(day.date)}
          {day.title ? ` · ${day.title}` : ''}
        </h3>
        {coveringLegs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {coveringLegs.map((leg) => (
              <span
                key={leg.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-background/80 border border-border text-foreground"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: leg.color }} />
                <span>{leg.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {!companionMode && (
        <Button
          variant="outline"
          size="xs"
          disabled={readOnly}
          className="min-h-[44px] sm:min-h-[34px]"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => onOpenNewItem(day.id)}
        >
          Add to Day
        </Button>
      )}
    </div>

    {daySegments.length > 0 && (
      <div className="space-y-1.5">
        {daySegments.map((entry) => (
          <SegmentTimelineRow
            key={`${entry.kind}-${entry.segment.id}`}
            entry={entry}
            chronosSyncEnabled={chronosSyncEnabled}
          />
        ))}
      </div>
    )}

    {dayItems.length === 0 && daySegments.length === 0 && dayPhotos.length === 0 ? (
      <p className="text-xs text-muted italic">No scheduled items for this day.</p>
    ) : (
      dayItems.length > 0 && (
        <div className="space-y-2">
          {dayItems.map((item) => (
            <ScheduledItemRow
              key={item.id}
              item={item}
              linkedPlace={item.place_id ? placesById.get(item.place_id) : undefined}
              readOnly={readOnly}
              companionMode={companionMode}
              onToggleDone={onToggleItemDone}
              onToggleChronosSync={onToggleItemChronosSync}
              onMoveToBacklog={onMoveToBacklog}
              onDelete={onDeleteItem}
            />
          ))}
        </div>
      )
    )}

    <DayPhotoStrip photos={dayPhotos} companionMode={companionMode} readOnly={readOnly} />
  </section>
)

const BacklogSectionCard: React.FC<{
  backlogItems: ItineraryItem[]
  days: Day[]
  readOnly: boolean
  companionMode: boolean
  onOpenNewItem: () => void
  onMoveItemDay: (itemId: string, dayId: string | null) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
}> = ({ backlogItems, days, readOnly, companionMode, onOpenNewItem, onMoveItemDay, onDeleteItem }) => (
  <GlassCard id="section-backlog" tone="glass" padding="md" className="space-y-3">
    <SectionHeader
      title="Idea Backlog"
      subtitle="Unscheduled activities ready to slot onto any Trip day"
      icon={<Inbox className="w-4 h-4" />}
      variant="sky"
      actions={
        !companionMode ? (
          <Button
            variant="outline"
            size="sm"
            disabled={readOnly}
            className="min-h-[44px]"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={onOpenNewItem}
          >
            Add Backlog Idea
          </Button>
        ) : undefined
      }
    />
    {backlogItems.length === 0 ? (
      <EmptyState
        title="Backlog is clear"
        description="Save unscheduled ideas here before committing them to a specific day."
      />
    ) : (
      <div className="space-y-2">
        {backlogItems.map((item) => {
          const timeLabel = formatEventLocalTimeLabel(item)
          return (
            <div
              key={item.id}
              data-testid={`backlog-item-${item.id}`}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-ui-control bg-background/70 border border-border/80 px-3 py-2.5"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">{item.title}</span>
                  <StatusBadge label={item.category} variant="info" size="xs" showDot={false} />
                </div>
                {(Boolean(timeLabel) || Boolean(item.place_label)) && (
                  <p className="text-[11px] text-muted">
                    {[timeLabel, item.place_label].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {!companionMode && (
                <div className="flex items-center gap-2 shrink-0">
                  {days.length > 0 && (
                    <SelectInput
                      aria-label={`Schedule ${item.title} to day`}
                      variant="brand"
                      disabled={readOnly}
                      value=""
                      containerClassName="w-40"
                      placeholder="Schedule day..."
                      onChange={(e) => {
                        if (e.target.value) void onMoveItemDay(item.id, e.target.value)
                      }}
                      options={days.map((day) => ({ value: day.id, label: day.date }))}
                    />
                  )}
                  <Button
                    variant="danger"
                    size="xs"
                    disabled={readOnly}
                    aria-label={`Delete ${item.title}`}
                    className="min-h-[44px]"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => void onDeleteItem(item.id)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    )}
  </GlassCard>
)

function buildDaySegmentsMap(bookings: TimelineBooking[]): Map<string, DaySegmentEntry[]> {
  const map = new Map<string, DaySegmentEntry[]>()
  const append = (date: string | null, entry: DaySegmentEntry) => {
    if (!date) return
    const list = map.get(date) ?? []
    list.push(entry)
    map.set(date, list)
  }
  for (const booking of bookings) {
    for (const segment of booking.segments) {
      append(extractLocalDate(segment.departure_local), { booking, segment, kind: 'departure' })
      if (segment.projected_arrival_date) {
        append(segment.projected_arrival_date, { booking, segment, kind: 'arrival' })
      }
    }
  }
  return map
}

const TimelineDaysSection: React.FC<{
  days: Day[]
  legs: Leg[]
  items: ItineraryItem[]
  segmentsByDate: Map<string, DaySegmentEntry[]>
  photosByDayId: Map<string, ImmichPhotoItem[]>
  placesById: Map<string, Place>
  readOnly: boolean
  companionMode: boolean
  chronosSyncEnabled: boolean
  onOpenNewItem: (dayId: string | null) => void
  onToggleItemDone: (item: ItineraryItem) => Promise<void>
  onToggleItemChronosSync?: (item: ItineraryItem) => Promise<void>
  onMoveItemDay: (itemId: string, dayId: string | null) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
}> = (p) => (
  <GlassCard id="section-timeline" tone="glass" padding="md" className="space-y-4">
    <SectionHeader
      title="Chronological Timeline"
      subtitle="Flat Trip days with overlapping Leg chapters and event-local wall-clock times"
      icon={<CalendarDays className="w-4 h-4" />}
      variant="brand"
      actions={
        !p.companionMode ? (
          <Button variant="brand" size="sm" disabled={p.readOnly} className="min-h-[44px]" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => p.onOpenNewItem(p.days[0]?.id ?? null)}>
            Add Activity
          </Button>
        ) : undefined
      }
    />
    {p.days.length === 0 ? (
      <EmptyState title="No calendar days provisioned" description="Set trip dates or add a destination Leg to generate chronological Day buckets." />
    ) : (
      <div className="space-y-3">
        {p.days.map((day) => (
          <DayCard
            key={day.id} day={day} coveringLegs={legsCoveringDate(p.legs, day.date)}
            dayItems={p.items.filter((item) => item.day_id === day.id)}
            daySegments={p.segmentsByDate.get(day.date) ?? []}
            dayPhotos={p.photosByDayId.get(day.id) ?? []}
            placesById={p.placesById}
            readOnly={p.readOnly} companionMode={p.companionMode} chronosSyncEnabled={p.chronosSyncEnabled}
            onOpenNewItem={p.onOpenNewItem} onToggleItemDone={p.onToggleItemDone}
            onToggleItemChronosSync={p.onToggleItemChronosSync}
            onMoveToBacklog={(itemId) => p.onMoveItemDay(itemId, null)} onDeleteItem={p.onDeleteItem}
          />
        ))}
      </div>
    )}
  </GlassCard>
)

export const TripDocumentTimeline: React.FC<TripDocumentTimelineProps> = (props) => {
  const readOnly = Boolean(props.readOnly)
  const companionMode = Boolean(props.companionMode)
  const chronosSyncEnabled = 'chronos_sync_enabled' in props.trip && Boolean(props.trip.chronos_sync_enabled)
  const backlogItems = props.items.filter((item) => item.day_id === null)
  const placesById = new Map((props.places ?? []).map((p) => [p.id, p]))
  const segmentsByDate = buildDaySegmentsMap(props.bookings ?? [])
  const photosByDayId = new Map((props.tripPhotos?.days ?? []).map((entry) => [entry.day_id, entry.photos]))
  return (
    <div className="space-y-4">
      <TripOverviewCard
        trips={props.trips} trip={props.trip} legs={props.legs} readOnly={readOnly} companionMode={companionMode}
        onSelectTrip={props.onSelectTrip} onOpenNewTrip={props.onOpenNewTrip} onOpenNewLeg={props.onOpenNewLeg}
        onOpenChronosSync={props.onOpenChronosSync} onOpenTripSettings={props.onOpenTripSettings}
        onExportMarkdown={props.onExportMarkdown}
      />
      <ImmichStatusBanner
        photosResponse={props.tripPhotos ?? null}
        isLoading={props.tripPhotosLoading}
        companionMode={companionMode}
        readOnly={readOnly}
        onRetry={props.onRetryTripPhotos ?? (() => {})}
      />
      <TimelineDaysSection
        days={props.days} legs={props.legs} items={props.items} segmentsByDate={segmentsByDate}
        photosByDayId={photosByDayId} placesById={placesById}
        readOnly={readOnly} companionMode={companionMode} chronosSyncEnabled={chronosSyncEnabled}
        onOpenNewItem={props.onOpenNewItem} onToggleItemDone={props.onToggleItemDone}
        onToggleItemChronosSync={props.onToggleItemChronosSync} onMoveItemDay={props.onMoveItemDay} onDeleteItem={props.onDeleteItem}
      />
      <BacklogSectionCard
        backlogItems={backlogItems} days={props.days} readOnly={readOnly} companionMode={companionMode}
        onOpenNewItem={() => props.onOpenNewItem(null)} onMoveItemDay={props.onMoveItemDay} onDeleteItem={props.onDeleteItem}
      />
    </div>
  )
}
