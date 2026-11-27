export function formatNzd(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') {
    return 'Not set'
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return `NZD ${value}`
  }
  return `NZD ${parsed.toFixed(2)}`
}

export function formatSignedNzd(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === '') {
    return 'Unavailable'
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return `NZD ${value}`
  }
  if (parsed > 0) {
    return `+NZD ${parsed.toFixed(2)} over planned`
  }
  if (parsed < 0) {
    return `-NZD ${Math.abs(parsed).toFixed(2)} under planned`
  }
  return 'NZD 0.00 on target'
}

export function parseBudgetInput(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { ok: true, value: null }
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false, error: 'Enter a valid non-negative NZD amount (up to 2 decimal places).' }
  }
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { ok: false, error: 'Trip budget must be zero or positive.' }
  }
  return { ok: true, value: numeric.toFixed(2) }
}

export function clampCategoryPct(rawPct: string): number {
  const parsed = Number(rawPct)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(100, Math.max(0, parsed))
}
