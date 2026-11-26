import React from 'react'
import {
  CalendarDays,
  CheckSquare,
  Compass,
  FileText,
  Inbox,
  MapPin,
  Ticket,
  Wallet,
} from 'lucide-react'
import { GlassCard } from '@yggdrasil-lab/ui'

import type { Leg } from '../types'

interface LeftJumpRailProps {
  legs: Leg[]
  bookingCount: number
  placeCount: number
  backlogCount: number
  checklistCount: number
  noteCount: number
  onJumpToLeg?: (legId: string) => void
}

interface RailLink {
  href: string
  label: string
  icon: React.ReactNode
  badge?: string | number
}

export const LeftJumpRail: React.FC<LeftJumpRailProps> = ({
  legs,
  bookingCount,
  placeCount,
  backlogCount,
  checklistCount,
  noteCount,
  onJumpToLeg,
}) => {
  const sections: RailLink[] = [
    { href: '#section-overview', label: 'Overview & Legs', icon: <Compass className="w-3.5 h-3.5" /> },
    { href: '#section-timeline', label: 'Timeline', icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { href: '#section-bookings', label: 'Bookings', icon: <Ticket className="w-3.5 h-3.5" />, badge: bookingCount },
    { href: '#section-places', label: 'Map & Places', icon: <MapPin className="w-3.5 h-3.5" />, badge: placeCount },
    { href: '#section-backlog', label: 'Backlog', icon: <Inbox className="w-3.5 h-3.5" />, badge: backlogCount },
    { href: '#section-checklists', label: 'Checklists', icon: <CheckSquare className="w-3.5 h-3.5" />, badge: checklistCount },
    { href: '#section-notes', label: 'Travel Notes', icon: <FileText className="w-3.5 h-3.5" />, badge: noteCount },
    { href: '#section-budget', label: 'Budget', icon: <Wallet className="w-3.5 h-3.5" />, badge: 'T08' },
  ]

  return (
    <aside
      aria-label="Trip Section Navigation"
      className="hidden lg:flex lg:flex-col gap-3 lg:sticky lg:top-20 lg:self-start"
    >
      <GlassCard padding="sm" tone="glass" className="space-y-1">
        <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
          Trip Outline
        </p>
        <nav className="space-y-0.5">
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-ui-control text-xs font-medium text-muted hover:text-foreground hover:bg-card-muted/70 transition-colors min-h-[38px]"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-accent shrink-0">{section.icon}</span>
                <span className="truncate">{section.label}</span>
              </span>
              {section.badge !== undefined && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-background/80 border border-border text-muted">
                  {section.badge}
                </span>
              )}
            </a>
          ))}
        </nav>
      </GlassCard>

      {legs.length > 0 && (
        <GlassCard padding="sm" tone="glass" className="space-y-1.5">
          <p className="px-2.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-muted">
            Leg Chapters
          </p>
          <div className="space-y-1">
            {legs.map((leg) => (
              <a
                key={leg.id}
                href={`#leg-${leg.id}`}
                onClick={() => onJumpToLeg?.(leg.id)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-ui-control text-xs text-foreground hover:bg-card-muted/70 transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                  style={{ backgroundColor: leg.color }}
                />
                <span className="truncate font-medium">{leg.name}</span>
              </a>
            ))}
          </div>
        </GlassCard>
      )}
    </aside>
  )
}
