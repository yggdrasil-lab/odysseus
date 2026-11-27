import React from 'react'
import { Receipt, Tag } from 'lucide-react'
import { EmptyState, ProgressBar, StatusBadge } from '@yggdrasil-lab/ui'

import type { BudgetCategoryActual, PlannedBookingCost, SettledTransaction } from '../types'
import { clampCategoryPct, formatNzd } from '../utils/budget'

const PlannedBookingRow: React.FC<{ item: PlannedBookingCost }> = ({ item }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/60 border border-border/70 px-3 py-2 text-xs">
    <div className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-foreground">{item.title}</span>
        <StatusBadge label={item.booking_type} variant="info" size="xs" showDot={false} />
        <StatusBadge label={item.status} variant={item.status === 'confirmed' ? 'success' : 'idle'} size="xs" showDot={false} />
      </div>
      <p className="text-[11px] font-mono text-muted">
        Quote: {item.quoted_currency} {item.quoted_cost}
        {Boolean(item.fx_rate) && item.quoted_currency !== 'NZD' ? ` @ ${item.fx_rate}` : ''}
      </p>
    </div>
    <div className="shrink-0">
      {item.nzd_amount !== null ? (
        <span className="font-mono font-bold text-foreground">-&gt; {formatNzd(item.nzd_amount)}</span>
      ) : (
        <StatusBadge label="FX unavailable" variant="warning" size="xs" />
      )}
    </div>
  </div>
)

export const BudgetPlannedBookingsList: React.FC<{ items: PlannedBookingCost[] }> = ({ items }) => (
  <div className="space-y-2 pt-2 border-t border-border/60">
    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Planned Bookings Breakdown</p>
    {items.length === 0 ? (
      <p className="text-xs text-muted">No active quoted bookings for this trip yet.</p>
    ) : (
      <div className="space-y-1.5">
        {items.map((item) => (
          <PlannedBookingRow key={item.booking_id} item={item} />
        ))}
      </div>
    )}
  </div>
)

const CategoryBreakdownRow: React.FC<{ item: BudgetCategoryActual }> = ({ item }) => (
  <div className="rounded-lg bg-background/60 border border-border/70 px-3 py-2 space-y-1.5 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <Tag className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="font-semibold text-foreground truncate">{item.category}</span>
        <span className="text-[11px] font-mono text-muted shrink-0">
          {item.transaction_count} {item.transaction_count === 1 ? 'txn' : 'txns'} ({item.percentage}%)
        </span>
      </div>
      <span className="font-mono font-bold text-foreground shrink-0">{formatNzd(item.total_spend_nzd)}</span>
    </div>
    <ProgressBar value={clampCategoryPct(item.percentage)} tone="brand" size="sm" label={`${item.category} share`} />
  </div>
)

export const BudgetCategoryBreakdown: React.FC<{ categories: BudgetCategoryActual[] }> = ({ categories }) => (
  <div className="space-y-2 pt-2 border-t border-border/60">
    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Plutus Category Spend</p>
    {categories.length === 0 ? (
      <p className="text-xs text-muted">No settled category spend recorded for this trip tag.</p>
    ) : (
      <div className="space-y-1.5">
        {categories.map((cat) => (
          <CategoryBreakdownRow key={cat.category} item={cat} />
        ))}
      </div>
    )}
  </div>
)

const SettledTransactionRow: React.FC<{ tx: SettledTransaction }> = ({ tx }) => {
  const title = tx.merchant?.trim() || tx.raw_description?.trim() || 'Settled transaction'
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/60 border border-border/70 px-3 py-2 text-xs">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="font-semibold text-foreground truncate">{title}</span>
          {Boolean(tx.category) && <StatusBadge label={tx.category as string} variant="info" size="xs" showDot={false} />}
        </div>
        <p className="text-[11px] font-mono text-muted">
          {tx.transaction_date} · {tx.account_name} · {tx.currency} {tx.amount}
        </p>
      </div>
      <div className="shrink-0">
        {tx.nzd_amount !== null ? (
          <span className="font-mono font-bold text-foreground">{formatNzd(tx.nzd_amount)}</span>
        ) : (
          <StatusBadge label="FX unavailable" variant="warning" size="xs" />
        )}
      </div>
    </div>
  )
}

export const BudgetTransactionsList: React.FC<{ transactions: SettledTransaction[]; plutusTag: string }> = ({
  transactions,
  plutusTag,
}) => (
  <div className="space-y-2 pt-2 border-t border-border/60">
    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Settled Plutus Transactions</p>
    {transactions.length === 0 ? (
      <EmptyState
        title="No tagged Plutus transactions"
        description={`Tag settled transactions with ${plutusTag} in Midas to include them in this trip rollup.`}
      />
    ) : (
      <div className="space-y-1.5">
        {transactions.map((tx) => (
          <SettledTransactionRow key={String(tx.id)} tx={tx} />
        ))}
      </div>
    )}
  </div>
)
