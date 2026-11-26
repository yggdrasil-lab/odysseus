import React from 'react'
import { Ticket, Wallet } from 'lucide-react'
import { GlassCard, SectionHeader, StatusBadge } from '@yggdrasil-lab/ui'

export const BookingsPlaceholderCard: React.FC = () => (
  <GlassCard id="section-bookings" tone="glass" padding="md" className="space-y-3">
    <SectionHeader
      title="Bookings & Confirmations"
      subtitle="Flights, ferries, rail passes, and lodging vouchers"
      icon={<Ticket className="w-4 h-4" />}
      variant="brand"
      actions={<StatusBadge label="Ticket 04" variant="info" size="xs" />}
    />
    <p className="text-xs text-muted leading-relaxed">
      Centralized booking segments, PNR codes, check-in windows, and offline document attachments arrive in Ticket 04.
    </p>
  </GlassCard>
)

interface BudgetPlaceholderCardProps {
  budgetNzd: string | null
}

export const BudgetPlaceholderCard: React.FC<BudgetPlaceholderCardProps> = ({ budgetNzd }) => (
  <GlassCard id="section-budget" tone="glass" padding="md" className="space-y-3">
    <SectionHeader
      title="Trip Budget & Plutus Sync"
      subtitle="Target NZD cap and multi-currency expense rollup"
      icon={<Wallet className="w-4 h-4" />}
      variant="amber"
      actions={<StatusBadge label="Ticket 07" variant="warning" size="xs" />}
    />
    <div className="flex items-center justify-between rounded-ui-control bg-background/60 border border-border/80 px-3 py-2.5 text-xs">
      <span className="text-muted">Configured Trip Budget</span>
      <span className="font-mono font-bold text-foreground">
        {budgetNzd ? `NZD ${budgetNzd}` : 'Not set'}
      </span>
    </div>
    <p className="text-xs text-muted leading-relaxed">
      Live Plutus multi-currency transaction tagging and burn-rate charts arrive in Ticket 07.
    </p>
  </GlassCard>
)
