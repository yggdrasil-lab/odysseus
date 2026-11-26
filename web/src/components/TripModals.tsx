import React, { useEffect, useState } from 'react'
import { Button, FormField, Modal, SelectInput, TextArea, TextInput } from '@yggdrasil-lab/ui'

import { createTripSlug } from '../api/client'
import type {
  ChecklistCreatePayload,
  ChecklistType,
  Day,
  ItemCategory,
  ItemStatus,
  ItineraryItemCreatePayload,
  Leg,
  LegCreatePayload,
  TravelNoteCreatePayload,
  TripCreatePayload,
  TripStatus,
} from '../types'

const ModalActions: React.FC<{
  onClose: () => void
  submitLabel: string
  submitting: boolean
}> = ({ onClose, submitLabel, submitting }) => (
  <div className="flex justify-end gap-2 pt-2">
    <Button variant="ghost" onClick={onClose} className="min-h-[44px]">
      Cancel
    </Button>
    <Button type="submit" variant="brand" loading={submitting} className="min-h-[44px]">
      {submitLabel}
    </Button>
  </div>
)

const TripDateRangeFields: React.FC<{
  startDate: string
  endDate: string
  onChangeStart: (v: string) => void
  onChangeEnd: (v: string) => void
}> = ({ startDate, endDate, onChangeStart, onChangeEnd }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <FormField label="Start Date" htmlFor="trip-start-date">
      <TextInput id="trip-start-date" type="date" variant="brand" value={startDate} onChange={(e) => onChangeStart(e.target.value)} />
    </FormField>
    <FormField label="End Date" htmlFor="trip-end-date">
      <TextInput id="trip-end-date" type="date" variant="brand" value={endDate} onChange={(e) => onChangeEnd(e.target.value)} />
    </FormField>
  </div>
)

export const CreateTripModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: TripCreatePayload) => Promise<void>
}> = ({ isOpen, onClose, onSubmit }) => {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [status, setStatus] = useState<TripStatus>('planning')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [homeTimezone, setHomeTimezone] = useState('Pacific/Auckland')
  const [summary, setSummary] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        slug: slug.trim() || createTripSlug(title),
        status,
        start_date: startDate || null,
        end_date: endDate || null,
        home_timezone: homeTimezone.trim() || 'Pacific/Auckland',
        summary: summary.trim() || null,
      })
      setTitle(''); setSlug(''); setStartDate(''); setEndDate(''); setSummary('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Trip">
      <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
        <FormField label="Trip Title" htmlFor="trip-title" required>
          <TextInput id="trip-title" variant="brand" required value={title} onChange={(e) => { setTitle(e.target.value); setSlug(createTripSlug(e.target.value)) }} placeholder="Pacific Explorer" />
        </FormField>
        <FormField label="Slug" htmlFor="trip-slug" required>
          <TextInput id="trip-slug" variant="brand" required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="pacific-explorer" />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Status" htmlFor="trip-status">
            <SelectInput id="trip-status" variant="brand" value={status} onChange={(e) => setStatus(e.target.value as TripStatus)} options={[{ value: 'planning', label: 'Planning (flexible dates)' }, { value: 'booked', label: 'Booked' }, { value: 'active', label: 'Active' }]} />
          </FormField>
          <FormField label="Home Timezone" htmlFor="trip-home-tz">
            <TextInput id="trip-home-tz" variant="brand" value={homeTimezone} onChange={(e) => setHomeTimezone(e.target.value)} />
          </FormField>
        </div>
        <TripDateRangeFields startDate={startDate} endDate={endDate} onChangeStart={setStartDate} onChangeEnd={setEndDate} />
        <FormField label="Summary" htmlFor="trip-summary">
          <TextArea id="trip-summary" variant="brand" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Coastal itinerary overview" />
        </FormField>
        <ModalActions onClose={onClose} submitLabel="Create Trip" submitting={submitting} />
      </form>
    </Modal>
  )
}

export const CreateLegModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: LegCreatePayload) => Promise<void>
}> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('')
  const [primaryCity, setPrimaryCity] = useState('')
  const [baseTimezone, setBaseTimezone] = useState('Pacific/Auckland')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [color, setColor] = useState('#38bdf8')
  const [submitting, setSubmitting] = useState(false)

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !primaryCity.trim() || !startDate || !endDate) return
    setSubmitting(true)
    try {
      await onSubmit({ name: name.trim(), primary_city: primaryCity.trim(), base_timezone: baseTimezone.trim(), start_date: startDate, end_date: endDate, color })
      setName(''); setPrimaryCity('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Destination Leg">
      <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
        <FormField label="Leg Name" htmlFor="leg-name" required>
          <TextInput id="leg-name" variant="brand" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Harbor City" />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Primary City" htmlFor="leg-city" required>
            <TextInput id="leg-city" variant="brand" required value={primaryCity} onChange={(e) => setPrimaryCity(e.target.value)} placeholder="Harbor City" />
          </FormField>
          <FormField label="Base IANA Timezone" htmlFor="leg-tz" required>
            <TextInput id="leg-tz" variant="brand" required value={baseTimezone} onChange={(e) => setBaseTimezone(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Start Date" htmlFor="leg-start" required>
            <TextInput id="leg-start" type="date" variant="brand" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="End Date" htmlFor="leg-end" required>
            <TextInput id="leg-end" type="date" variant="brand" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Chapter Color" htmlFor="leg-color">
          <SelectInput id="leg-color" variant="brand" value={color} onChange={(e) => setColor(e.target.value)} options={[{ value: '#38bdf8', label: 'Compass Teal (#38bdf8)' }, { value: '#f59e0b', label: 'Amber Beacon (#f59e0b)' }, { value: '#34d399', label: 'Coast Emerald (#34d399)' }, { value: '#a78bfa', label: 'Twilight Violet (#a78bfa)' }]} />
        </FormField>
        <ModalActions onClose={onClose} submitLabel="Add Leg" submitting={submitting} />
      </form>
    </Modal>
  )
}

const ItemScheduleFields: React.FC<{
  category: ItemCategory
  itemStatus: ItemStatus
  startLocal: string
  startTz: string
  onChangeCategory: (v: ItemCategory) => void
  onChangeStatus: (v: ItemStatus) => void
  onChangeStartLocal: (v: string) => void
  onChangeStartTz: (v: string) => void
}> = (p) => (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FormField label="Category" htmlFor="item-category">
        <SelectInput id="item-category" variant="brand" value={p.category} onChange={(e) => p.onChangeCategory(e.target.value as ItemCategory)} options={[{ value: 'activity', label: 'Activity' }, { value: 'food', label: 'Food' }, { value: 'transit', label: 'Transit' }, { value: 'lodging', label: 'Lodging' }, { value: 'flight', label: 'Flight' }, { value: 'other', label: 'Other' }]} />
      </FormField>
      <FormField label="Status" htmlFor="item-status">
        <SelectInput id="item-status" variant="brand" value={p.itemStatus} onChange={(e) => p.onChangeStatus(e.target.value as ItemStatus)} options={[{ value: 'idea', label: 'Idea' }, { value: 'planned', label: 'Planned' }, { value: 'confirmed', label: 'Confirmed' }]} />
      </FormField>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FormField label="Local Start (Wall-Clock)" htmlFor="item-start-local">
        <TextInput id="item-start-local" type="datetime-local" variant="brand" value={p.startLocal} onChange={(e) => p.onChangeStartLocal(e.target.value)} />
      </FormField>
      <FormField label="Event IANA Timezone" htmlFor="item-start-tz">
        <TextInput id="item-start-tz" variant="brand" value={p.startTz} onChange={(e) => p.onChangeStartTz(e.target.value)} />
      </FormField>
    </div>
  </>
)

export const CreateItemModal: React.FC<{
  isOpen: boolean
  days: Day[]
  defaultDayId: string | null
  defaultTimezone: string
  onClose: () => void
  onSubmit: (payload: ItineraryItemCreatePayload) => Promise<void>
}> = ({ isOpen, days, defaultDayId, defaultTimezone, onClose, onSubmit }) => {
  const [title, setTitle] = useState('')
  const [dayId, setDayId] = useState<string>(defaultDayId ?? '')
  const [category, setCategory] = useState<ItemCategory>('activity')
  const [itemStatus, setItemStatus] = useState<ItemStatus>('planned')
  const [startLocal, setStartLocal] = useState('')
  const [startTz, setStartTz] = useState(defaultTimezone)
  const [placeLabel, setPlaceLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { setDayId(defaultDayId ?? '') }, [defaultDayId, isOpen])
  useEffect(() => { setStartTz(defaultTimezone) }, [defaultTimezone])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const normalized = startLocal.trim()
      await onSubmit({
        day_id: dayId || null,
        title: title.trim(),
        category,
        status: itemStatus,
        start_local: normalized ? (normalized.length === 16 ? `${normalized}:00` : normalized) : null,
        start_tz: normalized ? startTz.trim() || defaultTimezone : null,
        place_label: placeLabel.trim() || null,
      })
      setTitle(''); setStartLocal(''); setPlaceLabel('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Itinerary Item">
      <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
        <FormField label="Activity Title" htmlFor="item-title" required>
          <TextInput id="item-title" variant="brand" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Morning Harbor Ferry" />
        </FormField>
        <FormField label="Schedule Day" htmlFor="item-day">
          <SelectInput id="item-day" variant="brand" value={dayId} onChange={(e) => setDayId(e.target.value)} options={[{ value: '', label: 'Unscheduled (Idea Backlog)' }, ...days.map((d) => ({ value: d.id, label: d.date }))]} />
        </FormField>
        <ItemScheduleFields category={category} itemStatus={itemStatus} startLocal={startLocal} startTz={startTz} onChangeCategory={setCategory} onChangeStatus={setItemStatus} onChangeStartLocal={setStartLocal} onChangeStartTz={setStartTz} />
        <FormField label="Place Label" htmlFor="item-place">
          <TextInput id="item-place" variant="brand" value={placeLabel} onChange={(e) => setPlaceLabel(e.target.value)} placeholder="Harbor Pier 2" />
        </FormField>
        <ModalActions onClose={onClose} submitLabel="Save Item" submitting={submitting} />
      </form>
    </Modal>
  )
}

export const CreateChecklistModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: ChecklistCreatePayload) => Promise<void>
}> = ({ isOpen, onClose, onSubmit }) => {
  const [title, setTitle] = useState('')
  const [listType, setListType] = useState<ChecklistType>('packing')
  const [submitting, setSubmitting] = useState(false)

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({ title: title.trim(), list_type: listType })
      setTitle('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Checklist">
      <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
        <FormField label="Checklist Title" htmlFor="checklist-title" required>
          <TextInput id="checklist-title" variant="brand" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Carry-on Essentials" />
        </FormField>
        <FormField label="List Type" htmlFor="checklist-type">
          <SelectInput id="checklist-type" variant="brand" value={listType} onChange={(e) => setListType(e.target.value as ChecklistType)} options={[{ value: 'packing', label: 'Packing' }, { value: 'prep', label: 'Prep' }, { value: 'shopping', label: 'Shopping' }, { value: 'custom', label: 'Custom' }]} />
        </FormField>
        <ModalActions onClose={onClose} submitLabel="Create Checklist" submitting={submitting} />
      </form>
    </Modal>
  )
}

export const CreateNoteModal: React.FC<{
  isOpen: boolean
  legs: Leg[]
  onClose: () => void
  onSubmit: (payload: TravelNoteCreatePayload) => Promise<void>
}> = ({ isOpen, legs, onClose, onSubmit }) => {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [legId, setLegId] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({ title: title.trim(), body: body.trim(), leg_id: legId || null, is_private: isPrivate })
      setTitle(''); setBody(''); setLegId(''); setIsPrivate(false)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Travel Note">
      <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
        <FormField label="Note Title" htmlFor="note-title" required>
          <TextInput id="note-title" variant="brand" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Station Locker Instructions" />
        </FormField>
        <FormField label="Link to Leg (optional)" htmlFor="note-leg">
          <SelectInput id="note-leg" variant="brand" value={legId} onChange={(e) => setLegId(e.target.value)} options={[{ value: '', label: 'Whole Trip' }, ...legs.map((leg) => ({ value: leg.id, label: leg.name }))]} />
        </FormField>
        <FormField label="Content" htmlFor="note-body" required>
          <TextArea id="note-body" variant="brand" required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write arrival notes, luggage steps, or local reminders..." />
        </FormField>
        <label className="flex items-center gap-2.5 min-h-[44px] text-xs text-foreground cursor-pointer">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="w-4 h-4 accent-sky-400" />
          <span>Private note (hidden from public share links)</span>
        </label>
        <ModalActions onClose={onClose} submitLabel="Save Note" submitting={submitting} />
      </form>
    </Modal>
  )
}
