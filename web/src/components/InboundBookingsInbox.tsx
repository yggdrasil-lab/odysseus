import React, { useEffect, useState } from 'react'
import { CheckCircle2, Eye, FileText, FolderInput, Inbox, Trash2 } from 'lucide-react'
import { Button, GlassCard, SectionHeader, StatusBadge } from '@yggdrasil-lab/ui'

import type { AssignBookingPayload, Attachment, Trip, UnassignedBooking } from '../types'
import { formatBytesCompact } from '../utils/maps'

export interface InboundBookingsInboxProps {
  bookings: UnassignedBooking[]
  trips: Trip[]
  selectedTripId: string | null
  readOnly?: boolean
  onAssign: (bookingId: string, payload: AssignBookingPayload) => Promise<void>
  onDismiss: (bookingId: string) => Promise<void>
  onViewAttachment: (attachment: Attachment) => void
}

type BusyAction = 'confirm' | 'draft' | 'dismiss' | null

function readMetaString(
  payload: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const val = payload?.[key]
  return typeof val === 'string' && val.trim() ? val.trim() : null
}

const InboundAttachmentPill: React.FC<{
  attachment: Attachment
  onView: (attachment: Attachment) => void
}> = ({ attachment, onView }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/70 border border-border/70 px-2.5 py-1.5 text-xs">
    <div className="flex items-center gap-2 min-w-0">
      <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
      <span className="font-medium text-foreground truncate">{attachment.filename}</span>
      <span className="text-[10px] font-mono text-muted shrink-0">
        {formatBytesCompact(attachment.size_bytes)}
      </span>
    </div>
    <Button
      variant="outline"
      size="xs"
      className="min-h-[44px] sm:min-h-[34px]"
      icon={<Eye className="w-3.5 h-3.5" />}
      onClick={() => onView(attachment)}
    >
      View
    </Button>
  </div>
)

const InboundBookingHeader: React.FC<{ booking: UnassignedBooking }> = ({ booking }) => {
  const sender = readMetaString(booking.raw_email_payload, 'from_address')
  const subject = readMetaString(booking.raw_email_payload, 'subject')
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <h4 className="text-sm font-bold text-foreground">{booking.title}</h4>
        <StatusBadge label={booking.booking_type} variant="info" size="xs" showDot={false} />
        <StatusBadge label="Draft" variant="idle" size="xs" />
        <StatusBadge label="Iris" variant="warning" size="xs" showDot={false} />
        {Boolean(booking.confirmation_code) && (
          <span className="px-2 py-0.5 rounded-md bg-card border border-border font-mono text-[11px] font-semibold text-accent">
            {booking.confirmation_code}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {Boolean(sender) && <span>From: {sender}</span>}
        {Boolean(subject) && subject !== booking.title && <span>Subject: {subject}</span>}
        {Boolean(booking.quoted_cost) && (
          <span className="font-mono text-foreground">
            {booking.quoted_currency ?? 'NZD'} {booking.quoted_cost}
          </span>
        )}
      </div>
    </div>
  )
}

const InboundActionButtons: React.FC<{
  targetTripId: string
  readOnly: boolean
  busyAction: BusyAction
  onConfirmAssign: () => void
  onDraftAssign: () => void
  onDismiss: () => void
}> = ({ targetTripId, readOnly, busyAction, onConfirmAssign, onDraftAssign, onDismiss }) => {
  const disabledAssign = readOnly || busyAction !== null || !targetTripId
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="brand"
        size="sm"
        disabled={disabledAssign}
        loading={busyAction === 'confirm'}
        className="min-h-[44px] sm:min-h-[38px]"
        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
        onClick={onConfirmAssign}
      >
        Assign & Confirm
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabledAssign}
        loading={busyAction === 'draft'}
        className="min-h-[44px] sm:min-h-[38px]"
        icon={<FolderInput className="w-3.5 h-3.5" />}
        onClick={onDraftAssign}
      >
        Assign Draft
      </Button>
      <Button
        variant="danger"
        size="sm"
        disabled={readOnly || busyAction !== null}
        loading={busyAction === 'dismiss'}
        className="min-h-[44px] sm:min-h-[38px]"
        icon={<Trash2 className="w-3.5 h-3.5" />}
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </div>
  )
}

const InboundBookingActionBar: React.FC<{
  bookingTitle: string
  trips: Trip[]
  targetTripId: string
  readOnly: boolean
  busyAction: BusyAction
  onChangeTripId: (tripId: string) => void
  onConfirmAssign: () => void
  onDraftAssign: () => void
  onDismiss: () => void
}> = ({
  bookingTitle,
  trips,
  targetTripId,
  readOnly,
  busyAction,
  onChangeTripId,
  onConfirmAssign,
  onDraftAssign,
  onDismiss,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-border/60">
    <select
      aria-label={`Assign trip for ${bookingTitle}`}
      disabled={readOnly || busyAction !== null || trips.length === 0}
      value={targetTripId}
      onChange={(e) => onChangeTripId(e.target.value)}
      className="w-full sm:w-auto sm:min-w-[200px] min-h-[44px] sm:min-h-[38px] rounded-xl bg-card border border-border px-3 text-base sm:text-xs text-foreground"
    >
      {trips.length === 0 ? (
        <option value="">Create a trip first</option>
      ) : (
        trips.map((trip) => (
          <option key={trip.id} value={trip.id}>
            {trip.title}
          </option>
        ))
      )}
    </select>
    <InboundActionButtons
      targetTripId={targetTripId}
      readOnly={readOnly}
      busyAction={busyAction}
      onConfirmAssign={onConfirmAssign}
      onDraftAssign={onDraftAssign}
      onDismiss={onDismiss}
    />
  </div>
)

const InboundBookingCard: React.FC<{
  booking: UnassignedBooking
  trips: Trip[]
  defaultTripId: string
  readOnly: boolean
  onAssign: (bookingId: string, payload: AssignBookingPayload) => Promise<void>
  onDismiss: (bookingId: string) => Promise<void>
  onViewAttachment: (attachment: Attachment) => void
}> = ({ booking, trips, defaultTripId, readOnly, onAssign, onDismiss, onViewAttachment }) => {
  const [targetTripId, setTargetTripId] = useState(defaultTripId)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const excerpt = readMetaString(booking.raw_email_payload, 'excerpt')

  useEffect(() => {
    setTargetTripId((prev) => (prev && trips.some((t) => t.id === prev) ? prev : defaultTripId))
  }, [defaultTripId, trips])

  const runAction = async (kind: Exclude<BusyAction, null>, fn: () => Promise<void>) => {
    setBusyAction(kind)
    try {
      await fn()
    } catch {
      // Failure is surfaced by the workspace actionError banner.
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <article
      data-testid={`inbound-booking-card-${booking.id}`}
      className="rounded-ui-control bg-background/65 border border-accent/35 p-3.5 space-y-3"
    >
      <InboundBookingHeader booking={booking} />
      {Boolean(excerpt) && <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{excerpt}</p>}
      {Boolean(booking.notes) && <p className="text-[11px] text-amber-300/90 leading-relaxed">{booking.notes}</p>}
      {booking.attachments.length > 0 && (
        <div className="space-y-1.5">
          {booking.attachments.map((att) => (
            <InboundAttachmentPill key={att.id} attachment={att} onView={onViewAttachment} />
          ))}
        </div>
      )}
      <InboundBookingActionBar
        bookingTitle={booking.title}
        trips={trips}
        targetTripId={targetTripId}
        readOnly={readOnly}
        busyAction={busyAction}
        onChangeTripId={setTargetTripId}
        onConfirmAssign={() => void runAction('confirm', () => onAssign(booking.id, { trip_id: targetTripId, confirm: true }))}
        onDraftAssign={() => void runAction('draft', () => onAssign(booking.id, { trip_id: targetTripId, confirm: false }))}
        onDismiss={() => void runAction('dismiss', () => onDismiss(booking.id))}
      />
    </article>
  )
}

export const InboundBookingsInbox: React.FC<InboundBookingsInboxProps> = ({
  bookings,
  trips,
  selectedTripId,
  readOnly = false,
  onAssign,
  onDismiss,
  onViewAttachment,
}) => {
  if (bookings.length === 0) return null
  const defaultTripId = selectedTripId || trips[0]?.id || ''

  return (
    <GlassCard
      data-testid="inbound-bookings-inbox"
      tone="glass"
      padding="md"
      className="space-y-3 border-accent/40"
    >
      <SectionHeader
        title={`Inbound Bookings Inbox (${bookings.length})`}
        subtitle="Staged travel confirmations forwarded from Iris awaiting trip assignment"
        icon={<Inbox className="w-4 h-4" />}
        variant="brand"
      />
      <div className="space-y-3">
        {bookings.map((booking) => (
          <InboundBookingCard
            key={booking.id}
            booking={booking}
            trips={trips}
            defaultTripId={defaultTripId}
            readOnly={readOnly}
            onAssign={onAssign}
            onDismiss={onDismiss}
            onViewAttachment={onViewAttachment}
          />
        ))}
      </div>
    </GlassCard>
  )
}
