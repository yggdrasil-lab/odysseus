import React from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Inbox,
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
  ItineraryItem,
  Leg,
  Place,
  Trip,
  TripStatus,
} from '../types'
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
  trips: Trip[]
  trip: Trip
  legs: Leg[]
  days: Day[]
  items: ItineraryItem[]
  bookings?: Booking[]
  places?: Place[]
  readOnly?: boolean
  onSelectTrip: (tripId: string) => void
  onOpenNewTrip: () => void
  onOpenNewLeg: () => void
  onOpenNewItem: (defaultDayId: string | null) => void
  onToggleItemDone: (item: ItineraryItem) => Promise<void>
  onMoveItemDay: (itemId: string, dayId: string | null) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
}

interface DaySegmentEntry {
  booking: Booking
  segment: BookingSegment
  kind: 'departure' | 'arrival'
}

const SegmentTimelineRow: React.FC<{ entry: DaySegmentEntry }> = ({ entry }) => {
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
      </div>
      <span className="font-mono text-[11px] text-accent shrink-0">{timeText}</span>
    </div>
  )
}

const ScheduledItemRow: React.FC<{
  item: ItineraryItem
  linkedPlace?: Place
  readOnly: boolean
  onToggleDone: (item: ItineraryItem) => Promise<void>
  onMoveToBacklog: (itemId: string) => Promise<void>
  onDelete: (itemId: string) => Promise<void>
}> = ({ item, linkedPlace, readOnly, onToggleDone, onMoveToBacklog, onDelete }) => {
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
          <span
            className={`text-xs font-semibold ${
              isDone ? 'line-through text-muted' : 'text-foreground'
            }`}
          >
            {item.title}
          </span>
          <StatusBadge label={item.category} variant="info" size="xs" showDot={false} />
          <StatusBadge
            label={item.status}
            variant={isDone ? 'success' : item.status === 'confirmed' ? 'info' : 'idle'}
            size="xs"
          />
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

      <div className="flex items-center gap-1.5 shrink-0">
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
    </div>
  )
}

const LegChaptersList: React.FC<{ legs: Leg[]; readOnly: boolean; onOpenNewLeg: () => void }> = ({
  legs,
  readOnly,
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
        description="Add destination legs to automatically provision flat Trip days and timezone chapters."
        action={
          <Button variant="brand" size="sm" disabled={readOnly} onClick={onOpenNewLeg}>
            Add First Leg
          </Button>
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

const TripOverviewCard: React.FC<{
  trips: Trip[]
  trip: Trip
  legs: Leg[]
  readOnly: boolean
  onSelectTrip: (tripId: string) => void
  onOpenNewTrip: () => void
  onOpenNewLeg: () => void
}> = ({ trips, trip, legs, readOnly, onSelectTrip, onOpenNewTrip, onOpenNewLeg }) => {
  const dateSummary =
    trip.start_date && trip.end_date
      ? `${trip.start_date} to ${trip.end_date}`
      : 'Dates flexible (planning)'

  return (
    <GlassCard id="section-overview" tone="glass" padding="md" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold font-display text-foreground truncate">
              {trip.title}
            </h2>
            <StatusBadge
              label={trip.status}
              variant={TRIP_STATUS_VARIANTS[trip.status]}
              size="xs"
            />
          </div>
          <p className="text-xs text-muted">
            {dateSummary} · Home TZ: <span className="font-mono">{trip.home_timezone}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {trips.length > 1 && (
            <SelectInput
              aria-label="Switch active trip"
              variant="brand"
              value={trip.id}
              onChange={(e) => onSelectTrip(e.target.value)}
              containerClassName="w-44"
              options={trips.map((entry) => ({ value: entry.id, label: entry.title }))}
            />
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={readOnly}
            className="min-h-[44px]"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={onOpenNewTrip}
          >
            New Trip
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={readOnly}
            className="min-h-[44px]"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={onOpenNewLeg}
          >
            Add Leg
          </Button>
        </div>
      </div>

      {Boolean(trip.summary) && (
        <p className="text-xs text-slate-300 leading-relaxed border-t border-border/60 pt-3">
          {trip.summary}
        </p>
      )}
      <LegChaptersList legs={legs} readOnly={readOnly} onOpenNewLeg={onOpenNewLeg} />
    </GlassCard>
  )
}

const DayCard: React.FC<{
  day: Day
  coveringLegs: Leg[]
  dayItems: ItineraryItem[]
  daySegments: DaySegmentEntry[]
  placesById: Map<string, Place>
  readOnly: boolean
  onOpenNewItem: (dayId: string) => void
  onToggleItemDone: (item: ItineraryItem) => Promise<void>
  onMoveToBacklog: (itemId: string) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
}> = ({
  day,
  coveringLegs,
  dayItems,
  daySegments,
  placesById,
  readOnly,
  onOpenNewItem,
  onToggleItemDone,
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
    </div>

    {daySegments.length > 0 && (
      <div className="space-y-1.5">
        {daySegments.map((entry) => (
          <SegmentTimelineRow
            key={`${entry.kind}-${entry.segment.id}`}
            entry={entry}
          />
        ))}
      </div>
    )}

    {dayItems.length === 0 && daySegments.length === 0 ? (
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
              onToggleDone={onToggleItemDone}
              onMoveToBacklog={onMoveToBacklog}
              onDelete={onDeleteItem}
            />
          ))}
        </div>
      )
    )}
  </section>
)

const BacklogSectionCard: React.FC<{
  backlogItems: ItineraryItem[]
  days: Day[]
  readOnly: boolean
  onOpenNewItem: () => void
  onMoveItemDay: (itemId: string, dayId: string | null) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
}> = ({ backlogItems, days, readOnly, onOpenNewItem, onMoveItemDay, onDeleteItem }) => (
  <GlassCard id="section-backlog" tone="glass" padding="md" className="space-y-3">
    <SectionHeader
      title="Idea Backlog"
      subtitle="Unscheduled activities ready to slot onto any Trip day"
      icon={<Inbox className="w-4 h-4" />}
      variant="sky"
      actions={
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
            </div>
          )
        })}
      </div>
    )}
  </GlassCard>
)

function buildDaySegmentsMap(bookings: Booking[]): Map<string, DaySegmentEntry[]> {
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

export const TripDocumentTimeline: React.FC<TripDocumentTimelineProps> = (props) => {
  const readOnly = Boolean(props.readOnly)
  const backlogItems = props.items.filter((item) => item.day_id === null)
  const placesById = new Map((props.places ?? []).map((p) => [p.id, p]))
  const segmentsByDate = buildDaySegmentsMap(props.bookings ?? [])
  return (
    <div className="space-y-4">
      <TripOverviewCard
        trips={props.trips}
        trip={props.trip}
        legs={props.legs}
        readOnly={readOnly}
        onSelectTrip={props.onSelectTrip}
        onOpenNewTrip={props.onOpenNewTrip}
        onOpenNewLeg={props.onOpenNewLeg}
      />
      <GlassCard id="section-timeline" tone="glass" padding="md" className="space-y-4">
        <SectionHeader
          title="Chronological Timeline"
          subtitle="Flat Trip days with overlapping Leg chapters and event-local wall-clock times"
          icon={<CalendarDays className="w-4 h-4" />}
          variant="brand"
          actions={
            <Button
              variant="brand"
              size="sm"
              disabled={readOnly}
              className="min-h-[44px]"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => props.onOpenNewItem(props.days[0]?.id ?? null)}
            >
              Add Activity
            </Button>
          }
        />
        {props.days.length === 0 ? (
          <EmptyState
            title="No calendar days provisioned"
            description="Set trip dates or add a destination Leg to generate chronological Day buckets."
          />
        ) : (
          <div className="space-y-3">
            {props.days.map((day) => (
              <DayCard
                key={day.id}
                day={day}
                coveringLegs={legsCoveringDate(props.legs, day.date)}
                dayItems={props.items.filter((item) => item.day_id === day.id)}
                daySegments={segmentsByDate.get(day.date) ?? []}
                placesById={placesById}
                readOnly={readOnly}
                onOpenNewItem={(dayId) => props.onOpenNewItem(dayId)}
                onToggleItemDone={props.onToggleItemDone}
                onMoveToBacklog={(itemId) => props.onMoveItemDay(itemId, null)}
                onDeleteItem={props.onDeleteItem}
              />
            ))}
          </div>
        )}
      </GlassCard>
      <BacklogSectionCard
        backlogItems={backlogItems}
        days={props.days}
        readOnly={readOnly}
        onOpenNewItem={() => props.onOpenNewItem(null)}
        onMoveItemDay={props.onMoveItemDay}
        onDeleteItem={props.onDeleteItem}
      />
    </div>
  )
}
