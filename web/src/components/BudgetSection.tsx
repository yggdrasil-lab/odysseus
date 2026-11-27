import React, { useState } from 'react'
import { ExternalLink, Pencil, RefreshCw, Wallet } from 'lucide-react'
import {
  AlertBanner,
  Button,
  GlassCard,
  LoadingState,
  SectionHeader,
  StatusBadge,
  TextInput,
} from '@yggdrasil-lab/ui'

import { OdysseusApiError } from '../api/client'
import type { TripBudgetSummary } from '../types'
import { formatNzd, formatSignedNzd, parseBudgetInput } from '../utils/budget'
import {
  BudgetCategoryBreakdown,
  BudgetPlannedBookingsList,
  BudgetTransactionsList,
} from './BudgetBreakdownLists'

export interface BudgetSectionProps {
  tripSlug: string
  configuredBudgetNzd: string | null
  budgetSummary: TripBudgetSummary | null
  budgetLoading: boolean
  budgetError: string | null
  isOffline: boolean
  readOnly: boolean
  onRefreshBudget: () => Promise<void>
  onUpdateBudget: (budgetNzd: string | null) => Promise<void>
}

const BudgetHeader: React.FC<{
  plutusTag: string
  midasUrl: string | null
  isOffline: boolean
  isLoading: boolean
  onRefresh: () => Promise<void>
}> = ({ plutusTag, midasUrl, isOffline, isLoading, onRefresh }) => (
  <SectionHeader
    title="Trip Budget & Plutus Sync"
    subtitle={`Tag: ${plutusTag} · Read-only NZD rollup`}
    icon={<Wallet className="w-4 h-4" />}
    variant="amber"
    actions={
      <div className="flex flex-wrap items-center gap-2">
        {Boolean(midasUrl) && (
          <a
            href={midasUrl as string}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-ui-control border border-border bg-transparent hover:bg-slate-800/60 text-slate-200 hover:text-white font-semibold text-xs px-3 py-1.5 min-h-[44px] sm:min-h-[38px] transition-colors"
          >
            <span>Open in Midas</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={isOffline || isLoading}
          loading={isLoading}
          className="min-h-[44px] sm:min-h-[38px]"
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={() => void onRefresh()}
        >
          Refresh
        </Button>
      </div>
    }
  />
)

const BudgetStatusBanners: React.FC<{
  isOffline: boolean
  configuredBudget: string | null
  budgetError: string | null
  budgetSummary: TripBudgetSummary | null
  onRefresh: () => Promise<void>
}> = ({ isOffline, configuredBudget, budgetError, budgetSummary, onRefresh }) => {
  if (isOffline) {
    return (
      <AlertBanner variant="warning" title="Offline Mode">
        Live Plutus actuals and FX rates require connectivity. Configured budget: {formatNzd(configuredBudget)}.
      </AlertBanner>
    )
  }
  if (budgetError) {
    return (
      <AlertBanner
        variant="error"
        title="Plutus unavailable"
        action={<Button size="xs" variant="outline" className="min-h-[44px] sm:min-h-[34px]" onClick={() => void onRefresh()}>Retry</Button>}
      >
        {budgetError}
      </AlertBanner>
    )
  }
  if (budgetSummary && !budgetSummary.plutus_available) {
    return (
      <AlertBanner
        variant="error"
        title="Plutus unavailable"
        action={<Button size="xs" variant="outline" className="min-h-[44px] sm:min-h-[34px]" onClick={() => void onRefresh()}>Retry</Button>}
      >
        {budgetSummary.plutus_error ?? 'Unable to reach Plutus.'}
      </AlertBanner>
    )
  }
  return null
}

function extractSaveError(err: unknown): string {
  if (err instanceof OdysseusApiError) return err.detail
  return err instanceof Error ? err.message : 'Unable to save trip budget.'
}

const BudgetInlineEditor: React.FC<{
  draft: string
  saving: boolean
  error: string | null
  onChangeDraft: (value: string) => void
  onSubmit: (event: React.FormEvent) => Promise<void>
  onCancel: () => void
}> = ({ draft, saving, error, onChangeDraft, onSubmit, onCancel }) => (
  <form onSubmit={(e) => void onSubmit(e)} className="space-y-2 pt-1">
    <TextInput
      aria-label="Trip Budget (NZD)"
      variant="amber"
      type="text"
      inputMode="decimal"
      value={draft}
      disabled={saving}
      placeholder="4500.00 (blank clears)"
      onChange={(e) => onChangeDraft(e.target.value)}
    />
    {Boolean(error) && <p className="text-xs text-rose-300">{error}</p>}
    <div className="flex items-center gap-2">
      <Button type="submit" variant="brand" size="xs" loading={saving} className="min-h-[44px] sm:min-h-[34px]">
        Save Budget
      </Button>
      <Button type="button" variant="ghost" size="xs" disabled={saving} className="min-h-[44px] sm:min-h-[34px]" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </form>
)

const ConfiguredBudgetCard: React.FC<{
  configuredBudget: string | null
  readOnly: boolean
  onUpdateBudget: (budgetNzd: string | null) => Promise<void>
}> = ({ configuredBudget, readOnly, onUpdateBudget }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(configuredBudget ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = parseBudgetInput(draft)
    if (!parsed.ok) { setError(parsed.error); return }
    setSaving(true)
    setError(null)
    try { await onUpdateBudget(parsed.value); setEditing(false) }
    catch (err: unknown) { setError(extractSaveError(err)) }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-ui-control bg-background/60 border border-border/80 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted">Configured Budget</span>
        {!editing && (
          <Button variant="outline" size="xs" disabled={readOnly} className="min-h-[44px] sm:min-h-[32px]" icon={<Pencil className="w-3 h-3" />} onClick={() => { setDraft(configuredBudget ?? ''); setError(null); setEditing(true) }}>
            {configuredBudget ? 'Edit Budget' : 'Set Budget'}
          </Button>
        )}
      </div>
      <p className="text-base font-mono font-bold text-foreground">{formatNzd(configuredBudget)}</p>
      {editing && (
        <BudgetInlineEditor draft={draft} saving={saving} error={error} onChangeDraft={setDraft} onSubmit={handleSubmit} onCancel={() => setEditing(false)} />
      )}
    </div>
  )
}

const MetricSummaryCard: React.FC<{
  testId: string
  label: string
  value: string
  subtitle?: string
  badge?: React.ReactNode
}> = ({ testId, label, value, subtitle, badge }) => (
  <div data-testid={testId} className="rounded-ui-control bg-background/60 border border-border/80 p-3 space-y-1">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-muted">{label}</span>
      {badge}
    </div>
    <p className="text-base font-mono font-bold text-foreground">{value}</p>
    {Boolean(subtitle) && <p className="text-[11px] font-mono text-muted">{subtitle}</p>}
  </div>
)

function resolveMetricDisplays(
  budgetSummary: TripBudgetSummary | null,
  isOffline: boolean,
  budgetError: string | null,
) {
  const canShowSummary = !isOffline && !budgetError && budgetSummary !== null
  const plutusLive = canShowSummary && budgetSummary.plutus_available
  const hasMissingFx = canShowSummary && budgetSummary.missing_fx_currencies.length > 0
  const plannedValue = !canShowSummary
    ? 'Unavailable'
    : budgetSummary.planned_nzd !== null
      ? formatNzd(budgetSummary.planned_nzd)
      : 'FX missing'
  const actualValue = plutusLive && budgetSummary.actual_settled_nzd !== null
    ? formatNzd(budgetSummary.actual_settled_nzd)
    : 'Unavailable'
  const remainingValue = !plutusLive
    ? 'Unavailable'
    : budgetSummary.remaining_budget_nzd !== null
      ? formatNzd(budgetSummary.remaining_budget_nzd)
      : 'No cap set'
  const varianceSubtitle = plutusLive ? `Variance: ${formatSignedNzd(budgetSummary.variance_nzd)}` : 'Variance: Unavailable'
  return { plutusLive, hasMissingFx, plannedValue, actualValue, remainingValue, varianceSubtitle }
}

const BudgetMetricsGrid: React.FC<{
  effectiveBudget: string | null
  readOnly: boolean
  isOffline: boolean
  budgetSummary: TripBudgetSummary | null
  budgetError: string | null
  onUpdateBudget: (budgetNzd: string | null) => Promise<void>
}> = ({ effectiveBudget, readOnly, isOffline, budgetSummary, budgetError, onUpdateBudget }) => {
  const metrics = resolveMetricDisplays(budgetSummary, isOffline, budgetError)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ConfiguredBudgetCard configuredBudget={effectiveBudget} readOnly={readOnly || isOffline} onUpdateBudget={onUpdateBudget} />
      <MetricSummaryCard
        testId="budget-planned-card"
        label="Planned Bookings (NZD)"
        value={metrics.plannedValue}
        badge={metrics.hasMissingFx ? <StatusBadge label="FX missing" variant="warning" size="xs" /> : undefined}
        subtitle={metrics.hasMissingFx ? `Missing FX: ${budgetSummary?.missing_fx_currencies.join(', ')}` : undefined}
      />
      <MetricSummaryCard
        testId="budget-actual-card"
        label="Actual Settled (Plutus)"
        value={metrics.actualValue}
        subtitle={metrics.plutusLive ? `${budgetSummary?.transactions.length ?? 0} settled txns` : undefined}
      />
      <MetricSummaryCard
        testId="budget-remaining-card"
        label="Remaining / Variance"
        value={metrics.remainingValue}
        subtitle={metrics.varianceSubtitle}
      />
    </div>
  )
}

export const BudgetSection: React.FC<BudgetSectionProps> = (props) => {
  const { tripSlug, configuredBudgetNzd, budgetSummary, budgetLoading, budgetError, isOffline, readOnly } = props
  const effectiveBudget = budgetSummary?.budget_nzd ?? configuredBudgetNzd
  const plutusTag = budgetSummary?.plutus_tag ?? `trip:${tripSlug}`
  const plutusLive = !isOffline && !budgetError && Boolean(budgetSummary?.plutus_available)

  return (
    <GlassCard id="section-budget" data-testid="budget-section" tone="glass" padding="md" className="space-y-4">
      <BudgetHeader plutusTag={plutusTag} midasUrl={budgetSummary?.midas_url ?? null} isOffline={isOffline} isLoading={budgetLoading} onRefresh={props.onRefreshBudget} />
      <BudgetStatusBanners isOffline={isOffline} configuredBudget={effectiveBudget} budgetError={budgetError} budgetSummary={budgetSummary} onRefresh={props.onRefreshBudget} />
      {budgetLoading && !budgetSummary && !isOffline && (
        <LoadingState label="Syncing Plutus FX & trip actuals..." variant="amber" />
      )}
      <BudgetMetricsGrid effectiveBudget={effectiveBudget} readOnly={readOnly} isOffline={isOffline} budgetSummary={budgetSummary} budgetError={budgetError} onUpdateBudget={props.onUpdateBudget} />
      {!isOffline && !budgetError && budgetSummary && (
        <>
          <BudgetPlannedBookingsList items={budgetSummary.planned_bookings} />
          {plutusLive && (
            <>
              <BudgetCategoryBreakdown categories={budgetSummary.category_breakdown} />
              <BudgetTransactionsList transactions={budgetSummary.transactions} plutusTag={plutusTag} />
            </>
          )}
        </>
      )}
    </GlassCard>
  )
}
