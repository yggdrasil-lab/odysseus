import React, { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  AlertBanner,
  Button,
  FormField,
  Modal,
  SelectInput,
  TextArea,
  TextInput,
} from '@yggdrasil-lab/ui'

import { OdysseusApiError } from '../api/client'
import type {
  Booking,
  BookingCreatePayload,
  BookingSegmentCreatePayload,
  BookingStatus,
  BookingType,
  BookingUpdatePayload,
} from '../types'

interface SegmentDraft {
  carrier: string
  flightOrServiceNumber: string
  originLabel: string
  originCode: string
  destinationLabel: string
  destinationCode: string
  departureLocal: string
  departureTz: string
  arrivalLocal: string
  arrivalTz: string
  seatOrCabin: string
  terminalGate: string
}

interface BookingFormState {
  title: string
  bookingType: BookingType
  status: BookingStatus
  provider: string
  confirmationCode: string
  quotedCost: string
  quotedCurrency: string
  notes: string
  segments: SegmentDraft[]
}

function createEmptySegment(defaultTz: string): SegmentDraft {
  return {
    carrier: '',
    flightOrServiceNumber: '',
    originLabel: '',
    originCode: '',
    destinationLabel: '',
    destinationCode: '',
    departureLocal: '',
    departureTz: defaultTz,
    arrivalLocal: '',
    arrivalTz: defaultTz,
    seatOrCabin: '',
    terminalGate: '',
  }
}

function toDatetimeLocalValue(iso: string): string {
  return iso.length >= 16 ? iso.slice(0, 16) : iso
}

function toApiDatetime(localVal: string): string {
  const trimmed = localVal.trim()
  return trimmed.length === 16 ? `${trimmed}:00` : trimmed
}

function hydrateFormState(booking: Booking | null, defaultTz: string): BookingFormState {
  if (!booking) {
    return {
      title: '',
      bookingType: 'flight',
      status: 'confirmed',
      provider: '',
      confirmationCode: '',
      quotedCost: '',
      quotedCurrency: 'NZD',
      notes: '',
      segments: [],
    }
  }
  const segments = [...booking.segments]
    .sort((a, b) => a.segment_order - b.segment_order)
    .map((seg) => ({
      carrier: seg.carrier ?? '',
      flightOrServiceNumber: seg.flight_or_service_number ?? '',
      originLabel: seg.origin_label,
      originCode: seg.origin_code ?? '',
      destinationLabel: seg.destination_label,
      destinationCode: seg.destination_code ?? '',
      departureLocal: toDatetimeLocalValue(seg.departure_local),
      departureTz: seg.departure_tz || defaultTz,
      arrivalLocal: toDatetimeLocalValue(seg.arrival_local),
      arrivalTz: seg.arrival_tz || defaultTz,
      seatOrCabin: seg.seat_or_cabin ?? '',
      terminalGate: seg.terminal_gate ?? '',
    }))
  return {
    title: booking.title,
    bookingType: booking.booking_type,
    status: booking.status,
    provider: booking.provider ?? '',
    confirmationCode: booking.confirmation_code ?? '',
    quotedCost: booking.quoted_cost ?? '',
    quotedCurrency: booking.quoted_currency ?? 'NZD',
    notes: booking.notes ?? '',
    segments,
  }
}

function toSegmentPayload(draft: SegmentDraft, idx: number): BookingSegmentCreatePayload {
  return {
    segment_order: idx,
    carrier: draft.carrier.trim() || null,
    flight_or_service_number: draft.flightOrServiceNumber.trim() || null,
    origin_label: draft.originLabel.trim(),
    origin_code: draft.originCode.trim() || null,
    destination_label: draft.destinationLabel.trim(),
    destination_code: draft.destinationCode.trim() || null,
    departure_local: toApiDatetime(draft.departureLocal),
    departure_tz: draft.departureTz.trim(),
    arrival_local: toApiDatetime(draft.arrivalLocal),
    arrival_tz: draft.arrivalTz.trim(),
    seat_or_cabin: draft.seatOrCabin.trim() || null,
    terminal_gate: draft.terminalGate.trim() || null,
  }
}

const SegmentDraftCard: React.FC<{
  index: number
  segment: SegmentDraft
  onChange: (index: number, patch: Partial<SegmentDraft>) => void
  onRemove: (index: number) => void
}> = ({ index, segment, onChange, onRemove }) => (
  <div className="rounded-ui-control bg-background/60 border border-border/80 p-3 space-y-2.5">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-accent">Segment {index + 1}</span>
      <Button
        variant="ghost"
        size="xs"
        className="min-h-[44px] sm:min-h-[32px]"
        icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
        onClick={() => onRemove(index)}
      >
        Remove
      </Button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      <FormField label="Carrier" htmlFor={`seg-carrier-${index}`}>
        <TextInput id={`seg-carrier-${index}`} variant="brand" value={segment.carrier} onChange={(e) => onChange(index, { carrier: e.target.value })} placeholder="Pacific Air" />
      </FormField>
      <FormField label="Flight / Service No." htmlFor={`seg-num-${index}`}>
        <TextInput id={`seg-num-${index}`} variant="brand" value={segment.flightOrServiceNumber} onChange={(e) => onChange(index, { flightOrServiceNumber: e.target.value })} placeholder="PA 104" />
      </FormField>
      <FormField label="Origin Label" htmlFor={`seg-orig-${index}`} required>
        <TextInput id={`seg-orig-${index}`} variant="brand" required value={segment.originLabel} onChange={(e) => onChange(index, { originLabel: e.target.value })} placeholder="Harbor City" />
      </FormField>
      <FormField label="Origin Code" htmlFor={`seg-orig-code-${index}`}>
        <TextInput id={`seg-orig-code-${index}`} variant="brand" value={segment.originCode} onChange={(e) => onChange(index, { originCode: e.target.value })} placeholder="AKL" />
      </FormField>
      <FormField label="Destination Label" htmlFor={`seg-dest-${index}`} required>
        <TextInput id={`seg-dest-${index}`} variant="brand" required value={segment.destinationLabel} onChange={(e) => onChange(index, { destinationLabel: e.target.value })} placeholder="Island Coast" />
      </FormField>
      <FormField label="Destination Code" htmlFor={`seg-dest-code-${index}`}>
        <TextInput id={`seg-dest-code-${index}`} variant="brand" value={segment.destinationCode} onChange={(e) => onChange(index, { destinationCode: e.target.value })} placeholder="HND" />
      </FormField>
      <FormField label="Departure Local" htmlFor={`seg-dep-local-${index}`} required>
        <TextInput id={`seg-dep-local-${index}`} type="datetime-local" variant="brand" required value={segment.departureLocal} onChange={(e) => onChange(index, { departureLocal: e.target.value })} />
      </FormField>
      <FormField label="Departure Timezone" htmlFor={`seg-dep-tz-${index}`} required>
        <TextInput id={`seg-dep-tz-${index}`} variant="brand" required value={segment.departureTz} onChange={(e) => onChange(index, { departureTz: e.target.value })} />
      </FormField>
      <FormField label="Arrival Local" htmlFor={`seg-arr-local-${index}`} required>
        <TextInput id={`seg-arr-local-${index}`} type="datetime-local" variant="brand" required value={segment.arrivalLocal} onChange={(e) => onChange(index, { arrivalLocal: e.target.value })} />
      </FormField>
      <FormField label="Arrival Timezone" htmlFor={`seg-arr-tz-${index}`} required>
        <TextInput id={`seg-arr-tz-${index}`} variant="brand" required value={segment.arrivalTz} onChange={(e) => onChange(index, { arrivalTz: e.target.value })} />
      </FormField>
      <FormField label="Seat / Cabin" htmlFor={`seg-seat-${index}`}>
        <TextInput id={`seg-seat-${index}`} variant="brand" value={segment.seatOrCabin} onChange={(e) => onChange(index, { seatOrCabin: e.target.value })} placeholder="14A" />
      </FormField>
      <FormField label="Terminal / Gate" htmlFor={`seg-gate-${index}`}>
        <TextInput id={`seg-gate-${index}`} variant="brand" value={segment.terminalGate} onChange={(e) => onChange(index, { terminalGate: e.target.value })} placeholder="T1 Gate 8" />
      </FormField>
    </div>
  </div>
)

const BookingCoreFields: React.FC<{
  form: BookingFormState
  onPatch: (patch: Partial<BookingFormState>) => void
}> = ({ form, onPatch }) => (
  <>
    <FormField label="Booking Title" htmlFor="booking-title" required>
      <TextInput id="booking-title" variant="brand" required value={form.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder="Overnight Flight AKL to HND" />
    </FormField>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FormField label="Booking Type" htmlFor="booking-type">
        <SelectInput
          id="booking-type"
          variant="brand"
          value={form.bookingType}
          onChange={(e) => onPatch({ bookingType: e.target.value as BookingType })}
          options={[
            { value: 'flight', label: 'Flight' },
            { value: 'lodging', label: 'Lodging' },
            { value: 'transport', label: 'Transport / Rail / Ferry' },
            { value: 'activity', label: 'Activity / Ticket' },
            { value: 'insurance', label: 'Insurance' },
          ]}
        />
      </FormField>
      <FormField label="Status" htmlFor="booking-status">
        <SelectInput
          id="booking-status"
          variant="brand"
          value={form.status}
          onChange={(e) => onPatch({ status: e.target.value as BookingStatus })}
          options={[
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'pending', label: 'Pending' },
            { value: 'draft', label: 'Draft' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
      </FormField>
      <FormField label="Provider" htmlFor="booking-provider">
        <TextInput id="booking-provider" variant="brand" value={form.provider} onChange={(e) => onPatch({ provider: e.target.value })} placeholder="Pacific Air" />
      </FormField>
      <FormField label="Confirmation / PNR" htmlFor="booking-pnr">
        <TextInput id="booking-pnr" variant="brand" value={form.confirmationCode} onChange={(e) => onPatch({ confirmationCode: e.target.value })} placeholder="ODYS99" />
      </FormField>
      <FormField label="Quoted Cost" htmlFor="booking-cost">
        <TextInput id="booking-cost" type="number" step="0.01" min="0" variant="brand" value={form.quotedCost} onChange={(e) => onPatch({ quotedCost: e.target.value })} placeholder="1250.00" />
      </FormField>
      <FormField label="Currency" htmlFor="booking-currency">
        <TextInput id="booking-currency" variant="brand" value={form.quotedCurrency} onChange={(e) => onPatch({ quotedCurrency: e.target.value.toUpperCase() })} placeholder="NZD" />
      </FormField>
    </div>
    <FormField label="Notes" htmlFor="booking-notes">
      <TextArea id="booking-notes" variant="brand" value={form.notes} onChange={(e) => onPatch({ notes: e.target.value })} placeholder="Baggage allowance, check-in window, or voucher notes" />
    </FormField>
  </>
)

export interface BookingModalProps {
  isOpen: boolean
  editingBooking: Booking | null
  defaultTimezone: string
  onClose: () => void
  onCreate: (payload: BookingCreatePayload) => Promise<void>
  onUpdate: (bookingId: string, payload: BookingUpdatePayload) => Promise<void>
}

function toBookingPayload(form: BookingFormState): BookingCreatePayload {
  return {
    title: form.title.trim(),
    booking_type: form.bookingType,
    status: form.status,
    provider: form.provider.trim() || null,
    confirmation_code: form.confirmationCode.trim() || null,
    quoted_cost: form.quotedCost.trim() || null,
    quoted_currency: form.quotedCost.trim() ? form.quotedCurrency.trim() || 'NZD' : null,
    notes: form.notes.trim() || null,
    segments: form.segments.map(toSegmentPayload),
  }
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  editingBooking,
  defaultTimezone,
  onClose,
  onCreate,
  onUpdate,
}) => {
  const [form, setForm] = useState<BookingFormState>(() => hydrateFormState(null, defaultTimezone))
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setErrorMessage(null)
    setForm(hydrateFormState(editingBooking, defaultTimezone))
  }, [defaultTimezone, editingBooking, isOpen])

  const patchForm = (patch: Partial<BookingFormState>) => setForm((prev) => ({ ...prev, ...patch }))
  const updateSegment = (index: number, patch: Partial<SegmentDraft>) =>
    setForm((prev) => ({ ...prev, segments: prev.segments.map((seg, i) => (i === index ? { ...seg, ...patch } : seg)) }))

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) return
    setSubmitting(true); setErrorMessage(null)
    const payload = toBookingPayload(form)
    try {
      if (editingBooking) await onUpdate(editingBooking.id, payload)
      else await onCreate(payload)
      onClose()
    } catch (err: unknown) {
      setErrorMessage(err instanceof OdysseusApiError ? err.detail : 'Unable to save booking.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingBooking ? 'Edit Booking' : 'Add Booking'} className="max-w-2xl">
      <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
        {errorMessage && <AlertBanner variant="error" title="Booking save failed">{errorMessage}</AlertBanner>}
        <BookingCoreFields form={form} onPatch={patchForm} />
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Ordered Segments ({form.segments.length})</span>
            <Button variant="outline" size="xs" className="min-h-[44px] sm:min-h-[34px]" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => patchForm({ segments: [...form.segments, createEmptySegment(defaultTimezone)] })}>
              Add Segment
            </Button>
          </div>
          {form.segments.map((seg, idx) => (
            <SegmentDraftCard key={idx} index={idx} segment={seg} onChange={updateSegment} onRemove={(i) => patchForm({ segments: form.segments.filter((_, idx2) => idx2 !== i) })} />
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="min-h-[44px]">Cancel</Button>
          <Button type="submit" variant="brand" loading={submitting} className="min-h-[44px]">
            {editingBooking ? 'Save Booking' : 'Create Booking'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
