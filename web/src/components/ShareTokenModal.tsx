import React, { useEffect, useState } from 'react'
import { Check, Copy, Link2, RefreshCw, ShieldOff, Trash2 } from 'lucide-react'
import {
  AlertBanner,
  Button,
  EmptyState,
  FormField,
  LoadingState,
  Modal,
  StatusBadge,
  TextInput,
  type StatusBadgeVariant,
} from '@yggdrasil-lab/ui'

import type {
  ShareToken,
  ShareTokenCreatePayload,
  ShareTokenUpdatePayload,
  ShareVisibility,
  Trip,
} from '../types'

export interface ShareTokenModalProps {
  isOpen: boolean
  onClose: () => void
  trip: Trip
  tokens: ShareToken[]
  loading: boolean
  error: string | null
  isOffline: boolean
  onLoadTokens: () => Promise<void>
  onCreateToken: (payload: ShareTokenCreatePayload) => Promise<ShareToken>
  onUpdateToken: (tokenId: string, payload: ShareTokenUpdatePayload) => Promise<ShareToken>
  onRotateToken: (tokenId: string) => Promise<ShareToken>
  onRevokeToken: (tokenId: string) => Promise<ShareToken>
  onDeleteToken: (tokenId: string) => Promise<void>
}

const DEFAULT_VISIBILITY: ShareVisibility = {
  include_pnrs: false,
  include_attachments: false,
  include_costs: false,
  include_checklists: false,
  include_private_notes: false,
}

const SHARE_TOGGLE_OPTIONS: Array<{ key: keyof ShareVisibility; label: string }> = [
  { key: 'include_pnrs', label: 'Include PNRs & codes' },
  { key: 'include_attachments', label: 'Include PDFs & attachments' },
  { key: 'include_costs', label: 'Include quoted costs' },
  { key: 'include_checklists', label: 'Include personal checklists' },
  { key: 'include_private_notes', label: 'Include private notes' },
]

function getTokenStatus(item: ShareToken): { label: 'Active' | 'Revoked' | 'Expired'; variant: StatusBadgeVariant } {
  if (item.revoked_at) return { label: 'Revoked', variant: 'error' }
  if (!item.is_active || (item.expires_at && new Date(item.expires_at).getTime() <= Date.now())) {
    return { label: 'Expired', variant: 'warning' }
  }
  return { label: 'Active', variant: 'success' }
}

function buildShareUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  return `${origin}/share/${token}`
}

const ShareVisibilityCheckboxes: React.FC<{
  visibility: ShareVisibility
  disabled: boolean
  idPrefix: string
  onToggle: (key: keyof ShareVisibility, checked: boolean) => void
}> = ({ visibility, disabled, idPrefix, onToggle }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
    {SHARE_TOGGLE_OPTIONS.map((opt) => (
      <label
        key={opt.key}
        htmlFor={`${idPrefix}-${opt.key}`}
        className="flex items-center gap-2 rounded-lg bg-background/60 border border-border/70 px-2.5 py-2 min-h-[44px] sm:min-h-[36px] text-xs text-foreground cursor-pointer"
      >
        <input
          id={`${idPrefix}-${opt.key}`}
          type="checkbox"
          checked={visibility[opt.key]}
          disabled={disabled}
          onChange={(e) => onToggle(opt.key, e.target.checked)}
          className="w-4 h-4 accent-sky-400 shrink-0"
        />
        <span>{opt.label}</span>
      </label>
    ))}
  </div>
)

const CreateShareTokenForm: React.FC<{
  isOffline: boolean
  onCreate: (payload: ShareTokenCreatePayload) => Promise<ShareToken>
}> = ({ isOffline, onCreate }) => {
  const [label, setLabel] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [visibility, setVisibility] = useState<ShareVisibility>(DEFAULT_VISIBILITY)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isOffline) return
    setSubmitting(true)
    try {
      await onCreate({
        label: label.trim() || null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        ...visibility,
      })
      setLabel('')
      setExpiresAt('')
      setVisibility(DEFAULT_VISIBILITY)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="rounded-ui-control bg-background/70 border border-border/80 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">Create Read-Only Share Link</span>
        <span className="text-[11px] text-muted">Safe-by-default (sensitive fields off)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Link Label (optional)" htmlFor="share-label-input">
          <TextInput
            id="share-label-input"
            variant="brand"
            className="text-base sm:text-xs"
            disabled={isOffline || submitting}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Companion Family Link"
          />
        </FormField>
        <FormField label="Expires At (optional)" htmlFor="share-expires-input">
          <TextInput
            id="share-expires-input"
            type="datetime-local"
            variant="brand"
            className="text-base sm:text-xs"
            disabled={isOffline || submitting}
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </FormField>
      </div>
      <ShareVisibilityCheckboxes
        visibility={visibility}
        disabled={isOffline || submitting}
        idPrefix="create-share"
        onToggle={(key, checked) => setVisibility((prev) => ({ ...prev, [key]: checked }))}
      />
      <div className="flex justify-end">
        <Button type="submit" variant="brand" size="sm" loading={submitting} disabled={isOffline} className="min-h-[44px]" icon={<Link2 className="w-3.5 h-3.5" />}>
          Create Share Link
        </Button>
      </div>
    </form>
  )
}

const ShareTokenCard: React.FC<{
  item: ShareToken
  isOffline: boolean
  onUpdate: (tokenId: string, payload: ShareTokenUpdatePayload) => Promise<ShareToken>
  onRotate: (tokenId: string) => Promise<ShareToken>
  onRevoke: (tokenId: string) => Promise<ShareToken>
  onDelete: (tokenId: string) => Promise<void>
}> = ({ item, isOffline, onUpdate, onRotate, onRevoke, onDelete }) => {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const status = getTokenStatus(item)
  const shareUrl = buildShareUrl(item.token)
  const mutatingDisabled = isOffline || busy || !item.is_active

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const runAction = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  return (
    <article data-testid={`share-token-${item.id}`} className="rounded-ui-control bg-background/65 border border-border/80 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h4 className="text-xs font-bold text-foreground truncate">{item.label || 'Untitled share link'}</h4>
          <StatusBadge label={status.label} variant={status.variant} size="xs" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="xs" className="min-h-[44px] sm:min-h-[34px]" icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} onClick={() => void handleCopy()}>
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button variant="outline" size="xs" disabled={mutatingDisabled} className="min-h-[44px] sm:min-h-[34px]" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => void runAction(() => onRotate(item.id))}>
            Rotate
          </Button>
          <Button variant="ghost" size="xs" disabled={isOffline || busy || Boolean(item.revoked_at)} className="min-h-[44px] sm:min-h-[34px]" icon={<ShieldOff className="w-3.5 h-3.5 text-amber-400" />} onClick={() => void runAction(() => onRevoke(item.id))}>
            Revoke
          </Button>
          <Button variant="danger" size="xs" disabled={isOffline || busy} aria-label={`Delete share link ${item.label || item.token}`} className="min-h-[44px] sm:min-h-[34px]" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => void runAction(() => onDelete(item.id))}>
            Delete
          </Button>
        </div>
      </div>
      <p className="font-mono text-[11px] text-accent break-all bg-card/70 border border-border/60 rounded-lg px-2.5 py-1.5">
        {shareUrl}
      </p>
      <ShareVisibilityCheckboxes
        visibility={item}
        disabled={mutatingDisabled}
        idPrefix={`token-${item.id}`}
        onToggle={(key, checked) => void runAction(() => onUpdate(item.id, { [key]: checked }))}
      />
    </article>
  )
}

export const ShareTokenModal: React.FC<ShareTokenModalProps> = (props) => {
  const { isOpen, onLoadTokens } = props

  useEffect(() => {
    if (isOpen) {
      void onLoadTokens()
    }
  }, [isOpen, onLoadTokens])

  return (
    <Modal isOpen={props.isOpen} onClose={props.onClose} title="Share Trip (Read-Only)" subtitle={props.trip.title} className="max-w-2xl">
      <div data-testid="share-token-modal" className="space-y-4">
        {props.error && <AlertBanner variant="error" title="Share Link Error">{props.error}</AlertBanner>}
        <CreateShareTokenForm isOffline={props.isOffline} onCreate={props.onCreateToken} />
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            Active & Past Share Links ({props.tokens.length})
          </p>
          {props.loading && <LoadingState label="Loading share links..." variant="brand" />}
          {!props.loading && props.tokens.length === 0 && (
            <EmptyState title="No share links yet" description="Create a read-only link above to share this itinerary with travel companions." />
          )}
          {props.tokens.map((item) => (
            <ShareTokenCard
              key={item.id}
              item={item}
              isOffline={props.isOffline}
              onUpdate={props.onUpdateToken}
              onRotate={props.onRotateToken}
              onRevoke={props.onRevokeToken}
              onDelete={props.onDeleteToken}
            />
          ))}
        </div>
      </div>
    </Modal>
  )
}
