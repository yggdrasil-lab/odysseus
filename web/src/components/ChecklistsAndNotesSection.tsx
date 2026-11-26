import React, { useState } from 'react'
import { Check, CheckSquare, FileText, Lock, Plus, Trash2 } from 'lucide-react'
import {
  Button,
  EmptyState,
  GlassCard,
  SectionHeader,
  StatusBadge,
  TextInput,
} from '@yggdrasil-lab/ui'

import type { Checklist, ChecklistItem, Leg, TravelNote } from '../types'

interface ChecklistsAndNotesSectionProps {
  checklists: Checklist[]
  notes: TravelNote[]
  legs: Leg[]
  onOpenNewChecklist: () => void
  onAddChecklistItem: (checklistId: string, label: string) => Promise<void>
  onToggleChecklistItem: (checklistId: string, item: ChecklistItem) => Promise<void>
  onDeleteChecklistItem: (checklistId: string, itemId: string) => Promise<void>
  onOpenNewNote: () => void
  onDeleteNote: (noteId: string) => Promise<void>
}

interface ChecklistCardProps {
  checklist: Checklist
  legsById: Map<string, Leg>
  onAddItem: (checklistId: string, label: string) => Promise<void>
  onToggleItem: (checklistId: string, item: ChecklistItem) => Promise<void>
  onDeleteItem: (checklistId: string, itemId: string) => Promise<void>
}

const ChecklistCard: React.FC<ChecklistCardProps> = ({
  checklist,
  legsById,
  onAddItem,
  onToggleItem,
  onDeleteItem,
}) => {
  const [draftLabel, setDraftLabel] = useState('')
  const completedCount = checklist.items.filter((item) => item.is_completed).length

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = draftLabel.trim()
    if (!trimmed) return
    await onAddItem(checklist.id, trimmed)
    setDraftLabel('')
  }

  return (
    <div
      data-testid={`checklist-${checklist.id}`}
      className="rounded-ui-control bg-background/60 border border-border/80 p-3.5 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="text-sm font-bold text-foreground truncate">{checklist.title}</h4>
          <StatusBadge label={checklist.list_type} variant="info" size="xs" showDot={false} />
        </div>
        <span className="text-xs font-mono text-muted">
          {completedCount}/{checklist.items.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {checklist.items.map((item) => {
          const linkedLeg = item.leg_id ? legsById.get(item.leg_id) : undefined
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-card/70 border border-border/60 px-2.5 py-1.5"
            >
              <button
                type="button"
                onClick={() => void onToggleItem(checklist.id, item)}
                className="flex items-center gap-2.5 text-left flex-1 min-h-[44px] min-w-0"
                aria-label={`Toggle ${item.label}`}
              >
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    item.is_completed
                      ? 'bg-accent border-accent text-accent-fg'
                      : 'border-border bg-background'
                  }`}
                >
                  {item.is_completed && <Check className="w-3.5 h-3.5" />}
                </span>
                <span
                  className={`text-xs truncate ${
                    item.is_completed ? 'line-through text-muted' : 'text-foreground'
                  }`}
                >
                  {item.label}
                </span>
                {linkedLeg && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background border border-border text-muted shrink-0">
                    {linkedLeg.name}
                  </span>
                )}
              </button>
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Remove ${item.label}`}
                className="min-h-[44px]"
                icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                onClick={() => void onDeleteItem(checklist.id, item.id)}
              />
            </div>
          )
        })}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex items-center gap-2">
        <TextInput
          variant="brand"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          placeholder={`Add item to ${checklist.title}...`}
          aria-label={`New item for ${checklist.title}`}
        />
        <Button type="submit" variant="brand" size="sm" className="min-h-[44px] shrink-0">
          Add
        </Button>
      </form>
    </div>
  )
}

export const ChecklistsAndNotesSection: React.FC<ChecklistsAndNotesSectionProps> = ({
  checklists,
  notes,
  legs,
  onOpenNewChecklist,
  onAddChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  onOpenNewNote,
  onDeleteNote,
}) => {
  const legsById = new Map(legs.map((leg) => [leg.id, leg]))

  return (
    <div className="space-y-4">
      <GlassCard id="section-checklists" tone="glass" padding="md" className="space-y-4">
        <SectionHeader
          title="Checklists"
          subtitle="Packing, prep, shopping, and custom trip lists"
          icon={<CheckSquare className="w-4 h-4" />}
          variant="emerald"
          actions={
            <Button
              variant="brand"
              size="sm"
              className="min-h-[44px]"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={onOpenNewChecklist}
            >
              New Checklist
            </Button>
          }
        />

        {checklists.length === 0 ? (
          <EmptyState
            title="No checklists yet"
            description="Create packing, prep, or shopping lists tied to your trip."
          />
        ) : (
          <div className="space-y-3">
            {checklists.map((checklist) => (
              <ChecklistCard
                key={checklist.id}
                checklist={checklist}
                legsById={legsById}
                onAddItem={onAddChecklistItem}
                onToggleItem={onToggleChecklistItem}
                onDeleteItem={onDeleteChecklistItem}
              />
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard id="section-notes" tone="glass" padding="md" className="space-y-4">
        <SectionHeader
          title="Travel Notes"
          subtitle="Shared context and private traveler memos"
          icon={<FileText className="w-4 h-4" />}
          variant="purple"
          actions={
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={onOpenNewNote}
            >
              Add Note
            </Button>
          }
        />

        {notes.length === 0 ? (
          <EmptyState
            title="No travel notes yet"
            description="Capture visa reminders, locker codes, or arrival instructions."
          />
        ) : (
          <div className="space-y-2.5">
            {notes.map((note) => {
              const linkedLeg = note.leg_id ? legsById.get(note.leg_id) : undefined
              return (
                <article
                  key={note.id}
                  data-testid={`travel-note-${note.id}`}
                  className="rounded-ui-control bg-background/60 border border-border/80 p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-foreground">{note.title}</h4>
                      {note.is_private && (
                        <StatusBadge
                          label="Private"
                          variant="warning"
                          size="xs"
                          icon={<Lock className="w-3 h-3" />}
                        />
                      )}
                      {linkedLeg && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-border text-muted">
                          {linkedLeg.name}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={`Delete note ${note.title}`}
                      className="min-h-[44px] sm:min-h-[34px]"
                      icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
                      onClick={() => void onDeleteNote(note.id)}
                    />
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {note.body}
                  </p>
                </article>
              )
            })}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
