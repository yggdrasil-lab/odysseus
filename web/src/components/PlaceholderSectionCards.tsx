import React from 'react'
import { Wallet } from 'lucide-react'
import { GlassCard, SectionHeader, StatusBadge } from '@yggdrasil-lab/ui'

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
      actions={<StatusBadge label="Ticket 08" variant="warning" size="xs" />}
    />
    <div className="flex items-center justify-between rounded-ui-control bg-background/60 border border-border/80 px-3 py-2.5 text-xs">
      <span className="text-muted">Configured Trip Budget</span>
      <span className="font-mono font-bold text-foreground">
        {budgetNzd ? `NZD ${budgetNzd}` : 'Not set'}
      </span>
    </div>
    <p className="text-xs text-muted leading-relaxed">
      Live Plutus multi-currency transaction tagging and burn-rate charts arrive in Ticket 08.
    </p>
  </GlassCard>
)
