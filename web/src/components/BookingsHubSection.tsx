import React, { useMemo, useRef, useState } from 'react'
import { CheckCircle2, Eye, FileText, Pencil, Plane, Plus, Ticket, Trash2, Upload } from 'lucide-react'
import {
  AlertBanner,
  Button,
  EmptyState,
  FilterChipBar,
  GlassCard,
  SectionHeader,
  StatusBadge,
  type StatusBadgeVariant,
} from '@yggdrasil-lab/ui'

import { OdysseusApiError } from '../api/client'
import type {
  Attachment,
  Booking,
  BookingSegment,
  BookingStatus,
  BookingType,
  SharedAttachment,
  SharedBooking,
} from '../types'

type DisplayBooking = Booking | SharedBooking
type DisplayAttachment = Attachment | SharedAttachment
import { formatBytesCompact } from '../utils/maps'
import { extractLocalDate, formatSegmentWallClock } from '../utils/time'

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

const BOOKING_STATUS_VARIANT: Record<BookingStatus, StatusBadgeVariant> = {
  draft: 'idle', pending: 'warning', confirmed: 'success', cancelled: 'error',
}

const BOOKING_TYPE_OPTIONS: Array<{ id: 'all' | BookingType; label: string }> = [
  { id: 'all', label: 'All Types' }, { id: 'flight', label: 'Flights' }, { id: 'lodging', label: 'Lodging' },
  { id: 'transport', label: 'Transport' }, { id: 'activity', label: 'Activity' }, { id: 'insurance', label: 'Insurance' },
]

const BOOKING_STATUS_OPTIONS: Array<{ id: 'all' | BookingStatus; label: string }> = [
  { id: 'all', label: 'Any Status' }, { id: 'confirmed', label: 'Confirmed' },
  { id: 'pending', label: 'Pending' }, { id: 'draft', label: 'Draft' }, { id: 'cancelled', label: 'Cancelled' },
]

export interface BookingsHubSectionProps {
  bookings: DisplayBooking[]
  attachments: DisplayAttachment[]
  readOnly?: boolean
  companionMode?: boolean
  attachmentsHiddenNote?: string
  onOpenNewBooking: () => void
  onEditBooking: (booking: Booking) => void
  onConfirmBooking?: (bookingId: string) => Promise<void>
  onDeleteBooking: (bookingId: string) => Promise<void>
  onUploadAttachment: (file: File, bookingId?: string | null) => Promise<void>
  onDeleteAttachment: (attachmentId: string) => Promise<void>
  onViewAttachment: (attachment: DisplayAttachment) => void
}

function extractUploadError(err: unknown): string {
  if (err instanceof OdysseusApiError) return err.detail
  return err instanceof Error ? err.message : 'Attachment upload failed.'
}

const SegmentSummaryRow: React.FC<{ segment: BookingSegment }> = ({ segment }) => {
  const depDate = extractLocalDate(segment.departure_local)
  const depTime = formatSegmentWallClock(segment.departure_local, segment.departure_utc, segment.departure_tz)
  const arrTime = formatSegmentWallClock(segment.arrival_local, segment.arrival_utc, segment.arrival_tz)
  const origin = segment.origin_code ? `${segment.origin_code} (${segment.origin_label})` : segment.origin_label
  const dest = segment.destination_code ? `${segment.destination_code} (${segment.destination_label})` : segment.destination_label

  return (
    <div className="rounded-lg bg-card/75 border border-border/70 px-2.5 py-2 space-y-1 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 font-semibold text-foreground">
          <Plane className="w-3.5 h-3.5 text-accent shrink-0" />
          <span>{origin}</span>
          <span className="text-muted">-&gt;</span>
          <span>{dest}</span>
          {segment.day_offset > 0 && <StatusBadge label={`+${segment.day_offset}`} variant="warning" size="xs" showDot={false} />}
        </div>
        {(Boolean(segment.carrier) || Boolean(segment.flight_or_service_number)) && (
          <span className="font-mono text-[11px] text-accent">
            {[segment.carrier, segment.flight_or_service_number].filter(Boolean).join(' ')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted font-mono">
        <span>Dep: {depDate ? `${depDate} ` : ''}{depTime}</span>
        <span>Arr: {segment.projected_arrival_date ? `${segment.projected_arrival_date} ` : ''}{arrTime}</span>
        {Boolean(segment.seat_or_cabin) && <span>Seat: {segment.seat_or_cabin}</span>}
        {Boolean(segment.terminal_gate) && <span>Gate: {segment.terminal_gate}</span>}
      </div>
    </div>
  )
}

const AttachmentRow: React.FC<{
  attachment: DisplayAttachment
  readOnly: boolean
  companionMode: boolean
  onView: (attachment: DisplayAttachment) => void
  onDelete: (attachmentId: string) => Promise<void>
}> = ({ attachment, readOnly, companionMode, onView, onDelete }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/70 border border-border/70 px-2.5 py-1.5 text-xs">
    <div className="flex items-center gap-2 min-w-0">
      <FileText className="w-3.5 h-3.5 text-accent shrink-0" />
      <span className="font-medium text-foreground truncate">{attachment.filename}</span>
      <span className="text-[10px] font-mono text-muted shrink-0">{formatBytesCompact(attachment.size_bytes)}</span>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      <Button variant="outline" size="xs" className="min-h-[44px] sm:min-h-[34px]" icon={<Eye className="w-3.5 h-3.5" />} onClick={() => onView(attachment)}>
        View
      </Button>
      {!companionMode && (
        <Button variant="ghost" size="xs" disabled={readOnly} aria-label={`Delete attachment ${attachment.filename}`} className="min-h-[44px] sm:min-h-[34px]" icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />} onClick={() => void onDelete(attachment.id)} />
      )}
    </div>
  </div>
)

const BookingUploadControl: React.FC<{
  bookingId: string
  bookingTitle: string
  readOnly: boolean
  onUpload: (file: File, bookingId: string) => Promise<void>
}> = ({ bookingId, bookingTitle, readOnly, onUpload }) => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`File exceeds 15 MB limit (${formatBytesCompact(file.size)}).`)
      return
    }
    setUploading(true); setUploadError(null)
    try { await onUpload(file, bookingId) }
    catch (err: unknown) { setUploadError(extractUploadError(err)) }
    finally { setUploading(false) }
  }

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label={`Upload document for ${bookingTitle}`} className="hidden" disabled={readOnly} onChange={(e) => void handleFileChange(e)} />
      <Button variant="outline" size="xs" disabled={readOnly} loading={uploading} className="min-h-[44px] sm:min-h-[34px]" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => inputRef.current?.click()}>
        Attach PDF / Image
      </Button>
      {uploadError && <AlertBanner variant="error" title="Upload failed">{uploadError}</AlertBanner>}
    </div>
  )
}

const BookingCardActions: React.FC<{
  booking: DisplayBooking
  readOnly: boolean
  onEdit: (booking: Booking) => void
  onConfirm?: (bookingId: string) => Promise<void>
  onDelete: (bookingId: string) => Promise<void>
}> = ({ booking, readOnly, onEdit, onConfirm, onDelete }) => {
  const [confirming, setConfirming] = useState(false)
  const handleConfirm = async () => {
    if (!onConfirm) return
    setConfirming(true)
    try {
      await onConfirm(booking.id)
    } catch {
      // Surfacing via workspace actionError banner.
    } finally {
      setConfirming(false)
    }
  }
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {booking.status === 'draft' && onConfirm && (
        <Button variant="brand" size="xs" disabled={readOnly || confirming} loading={confirming} className="min-h-[44px] sm:min-h-[34px]" icon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => void handleConfirm()}>Confirm</Button>
      )}
      <Button variant="outline" size="xs" disabled={readOnly} className="min-h-[44px] sm:min-h-[34px]" icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => onEdit(booking as Booking)}>Edit</Button>
      <Button variant="danger" size="xs" disabled={readOnly} aria-label={`Delete booking ${booking.title}`} className="min-h-[44px] sm:min-h-[34px]" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => void onDelete(booking.id).catch(() => {})} />
    </div>
  )
}

const BookingCardHeader: React.FC<{
  booking: DisplayBooking
  readOnly: boolean
  companionMode: boolean
  onEdit: (booking: Booking) => void
  onConfirm?: (bookingId: string) => Promise<void>
  onDelete: (bookingId: string) => Promise<void>
}> = ({ booking, readOnly, companionMode, onEdit, onConfirm, onDelete }) => {
  const isFromIris = !companionMode && 'source_email_message_id' in booking && Boolean(booking.source_email_message_id)
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
      <div className="space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <h4 className="text-sm font-bold text-foreground">{booking.title}</h4>
          <StatusBadge label={booking.booking_type} variant="info" size="xs" showDot={false} />
          <StatusBadge label={booking.status} variant={BOOKING_STATUS_VARIANT[booking.status]} size="xs" />
          {isFromIris && <StatusBadge label="From Iris" variant="warning" size="xs" showDot={false} />}
          {Boolean(booking.confirmation_code) && (
            <span className="px-2 py-0.5 rounded-md bg-card border border-border font-mono text-[11px] font-semibold text-accent">{booking.confirmation_code}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          {Boolean(booking.provider) && <span>Provider: {booking.provider}</span>}
          {Boolean(booking.quoted_cost) && <span className="font-mono text-foreground">{booking.quoted_currency ?? 'NZD'} {booking.quoted_cost}</span>}
        </div>
      </div>
      {!companionMode && <BookingCardActions booking={booking} readOnly={readOnly} onEdit={onEdit} onConfirm={onConfirm} onDelete={onDelete} />}
    </div>
  )
}

const BookingCard: React.FC<{
  booking: DisplayBooking
  attachments: DisplayAttachment[]
  readOnly: boolean
  companionMode: boolean
  onEdit: (booking: Booking) => void
  onConfirm?: (bookingId: string) => Promise<void>
  onDelete: (bookingId: string) => Promise<void>
  onUploadAttachment: (file: File, bookingId: string) => Promise<void>
  onDeleteAttachment: (attachmentId: string) => Promise<void>
  onViewAttachment: (attachment: DisplayAttachment) => void
}> = ({ booking, attachments, readOnly, companionMode, onEdit, onConfirm, onDelete, onUploadAttachment, onDeleteAttachment, onViewAttachment }) => {
  const orderedSegments = [...booking.segments].sort((a, b) => a.segment_order - b.segment_order)
  return (
    <article data-testid={`booking-card-${booking.id}`} className="rounded-ui-control bg-background/60 border border-border/80 p-3.5 space-y-3">
      <BookingCardHeader booking={booking} readOnly={readOnly} companionMode={companionMode} onEdit={onEdit} onConfirm={onConfirm} onDelete={onDelete} />
      {orderedSegments.length > 0 && (
        <div className="space-y-1.5">
          {orderedSegments.map((seg) => <SegmentSummaryRow key={seg.id} segment={seg} />)}
        </div>
      )}
      {Boolean(booking.notes) && <p className="text-xs text-slate-300 leading-relaxed">{booking.notes}</p>}
      {(attachments.length > 0 || !companionMode) && (
        <div className="space-y-2 pt-1 border-t border-border/50">
          {attachments.map((att) => <AttachmentRow key={att.id} attachment={att} readOnly={readOnly} companionMode={companionMode} onView={onViewAttachment} onDelete={onDeleteAttachment} />)}
          {!companionMode && <BookingUploadControl bookingId={booking.id} bookingTitle={booking.title} readOnly={readOnly} onUpload={onUploadAttachment} />}
        </div>
      )}
    </article>
  )
}

const BookingsFilterToolbar: React.FC<{
  bookings: DisplayBooking[]
  typeFilter: 'all' | BookingType
  statusFilter: 'all' | BookingStatus
  onChangeType: (t: 'all' | BookingType) => void
  onChangeStatus: (s: 'all' | BookingStatus) => void
}> = ({ bookings, typeFilter, statusFilter, onChangeType, onChangeStatus }) => (
  <div className="space-y-2">
    <FilterChipBar
      variant="brand"
      size="xs"
      selectedId={typeFilter}
      onSelect={(id) => onChangeType(id as 'all' | BookingType)}
      options={BOOKING_TYPE_OPTIONS.map((opt) => ({
        id: opt.id,
        label: opt.label,
        count: opt.id === 'all' ? bookings.length : bookings.filter((b) => b.booking_type === opt.id).length,
      }))}
    />
    <FilterChipBar
      variant="slate"
      size="xs"
      selectedId={statusFilter}
      onSelect={(id) => onChangeStatus(id as 'all' | BookingStatus)}
      options={BOOKING_STATUS_OPTIONS}
    />
  </div>
)

export const BookingsHubSection: React.FC<BookingsHubSectionProps> = (props) => {
  const companionMode = Boolean(props.companionMode)
  const [typeFilter, setTypeFilter] = useState<'all' | BookingType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all')

  const filteredBookings = useMemo(
    () => props.bookings.filter((b) => (typeFilter === 'all' || b.booking_type === typeFilter) && (statusFilter === 'all' || b.status === statusFilter)),
    [props.bookings, statusFilter, typeFilter],
  )

  const attachmentsByBooking = useMemo(() => {
    const map = new Map<string, DisplayAttachment[]>()
    for (const att of props.attachments) {
      const key = att.booking_id ?? '__trip__'
      map.set(key, [...(map.get(key) ?? []), att])
    }
    return map
  }, [props.attachments])

  const unattachedFiles = attachmentsByBooking.get('__trip__') ?? []

  return (
    <GlassCard id="section-bookings" tone="glass" padding="md" className="space-y-4">
      <SectionHeader
        title="Bookings & Confirmations"
        subtitle={companionMode ? 'Shared travel reservations and departure timings' : 'Flights, ferries, lodging vouchers, PNR codes, and PDF attachments'}
        icon={<Ticket className="w-4 h-4" />}
        variant="brand"
        actions={
          !companionMode ? (
            <Button variant="brand" size="sm" disabled={props.readOnly} className="min-h-[44px]" icon={<Plus className="w-3.5 h-3.5" />} onClick={props.onOpenNewBooking}>
              Add Booking
            </Button>
          ) : undefined
        }
      />
      <BookingsFilterToolbar bookings={props.bookings} typeFilter={typeFilter} statusFilter={statusFilter} onChangeType={setTypeFilter} onChangeStatus={setStatusFilter} />
      {filteredBookings.length === 0 ? (
        <EmptyState
          title="No matching bookings"
          description={companionMode ? 'No shared bookings match the current filter.' : 'Add flights, rail passes, or lodging confirmations and attach PDF tickets for offline-ready viewing.'}
          action={!companionMode ? <Button variant="outline" size="sm" disabled={props.readOnly} className="min-h-[44px]" onClick={props.onOpenNewBooking}>Add First Booking</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filteredBookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              attachments={attachmentsByBooking.get(booking.id) ?? []}
              readOnly={Boolean(props.readOnly)}
              companionMode={companionMode}
              onEdit={props.onEditBooking}
              onConfirm={props.onConfirmBooking}
              onDelete={props.onDeleteBooking}
              onUploadAttachment={(file, id) => props.onUploadAttachment(file, id)}
              onDeleteAttachment={props.onDeleteAttachment}
              onViewAttachment={props.onViewAttachment}
            />
          ))}
        </div>
      )}
      {unattachedFiles.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Trip Documents</p>
          {unattachedFiles.map((att) => <AttachmentRow key={att.id} attachment={att} readOnly={Boolean(props.readOnly)} companionMode={companionMode} onView={props.onViewAttachment} onDelete={props.onDeleteAttachment} />)}
        </div>
      )}
      {props.attachmentsHiddenNote && props.attachments.length === 0 && (
        <p className="text-xs text-muted italic pt-1 border-t border-border/50">{props.attachmentsHiddenNote}</p>
      )}
    </GlassCard>
  )
}
