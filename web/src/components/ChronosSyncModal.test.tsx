import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OdysseusApiError } from '../api/client'
import type { ChronosPreview, ChronosSyncResponse, Trip } from '../types'
import { ChronosSyncModal } from './ChronosSyncModal'

function makeTrip(overrides?: Partial<Trip>): Trip {
  return {
    id: 'trip-1',
    title: 'Pacific Explorer',
    slug: 'pacific-explorer',
    status: 'booked',
    start_date: '2027-01-12',
    end_date: '2027-01-13',
    home_timezone: 'Pacific/Auckland',
    budget_nzd: '4500.00',
    immich_album_id: null,
    vault_note_path: null,
    chronos_sync_enabled: false,
    chronos_overlay_mode: 'suppress_all_grid_blocks',
    summary: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function makePreview(overrides?: Partial<ChronosPreview>): ChronosPreview {
  return {
    trip_id: 'trip-1',
    trip_slug: 'pacific-explorer',
    eligible: true,
    ineligible_reason: null,
    sync_enabled: false,
    overlay_mode: 'suppress_all_grid_blocks',
    confirmed_segment_count: 1,
    synced_item_count: 1,
    anchors: [
      {
        external_ref: 'odysseus:pacific-explorer:segment:seg-1',
        source_kind: 'booking_segment',
        source_id: 'seg-1',
        title: 'Pacific Air: AKL to HND',
        target_date: '2027-01-12',
        start_minute: 540,
        end_minute: 1200,
        nudge_mode: 'boundary',
        urgent_quiet_bypass: true,
        notes: 'Departs 2027-01-12 09:00 (Pacific/Auckland)',
      },
      {
        external_ref: 'odysseus:pacific-explorer:item:item-1',
        source_kind: 'itinerary_item',
        source_id: 'item-1',
        title: 'Harbor Ferry',
        target_date: '2027-01-13',
        start_minute: 570,
        end_minute: 630,
        nudge_mode: 'none',
        urgent_quiet_bypass: false,
        notes: 'Local: 2027-01-13 09:30 (Pacific/Auckland)',
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  window.scrollTo = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ChronosSyncModal', () => {
  it('renders anchor preview, switches overlay mode, and triggers Chronos sync', async () => {
    const syncResponse: ChronosSyncResponse = {
      trip_id: 'trip-1',
      trip_slug: 'pacific-explorer',
      sync_enabled: true,
      overlay_mode: 'keep_work_blocks',
      overlay_active: true,
      upserted_count: 2,
      deleted_count: 0,
      anchors: makePreview().anchors,
    }
    const onLoadPreview = vi
      .fn()
      .mockResolvedValueOnce(makePreview())
      .mockResolvedValueOnce(makePreview({ sync_enabled: true, overlay_mode: 'keep_work_blocks' }))
    const onSync = vi.fn().mockResolvedValue(syncResponse)

    render(
      <ChronosSyncModal
        isOpen={true}
        onClose={vi.fn()}
        trip={makeTrip()}
        isOffline={false}
        onLoadPreview={onLoadPreview}
        onSync={onSync}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Pacific Air: AKL to HND')).toBeInTheDocument()
    })
    expect(screen.getByText('Urgent bypass')).toBeInTheDocument()
    expect(screen.getByText('1 segments · 1 items')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Keep work blocks/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Sync to Chronos' }))

    await waitFor(() => {
      expect(onSync).toHaveBeenCalledWith({ enabled: true, overlay_mode: 'keep_work_blocks' })
    })
    expect(screen.getByText(/Synced 2 anchor\(s\)/i)).toBeInTheDocument()
  })

  it('disables sync when trip is ineligible and surfaces explicit error banner on failure', async () => {
    const onLoadPreview = vi.fn().mockResolvedValue(
      makePreview({
        eligible: false,
        ineligible_reason: "Chronos sync requires trip status 'booked' or 'active' (current: 'planning').",
        anchors: [],
        confirmed_segment_count: 0,
        synced_item_count: 0,
      }),
    )

    const { rerender } = render(
      <ChronosSyncModal
        isOpen={true}
        onClose={vi.fn()}
        trip={makeTrip({ status: 'planning' })}
        isOffline={false}
        onLoadPreview={onLoadPreview}
        onSync={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/Trip Not Eligible Yet/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Sync to Chronos' })).toBeDisabled()

    const failLoad = vi.fn().mockResolvedValue(makePreview())
    const failSync = vi.fn().mockRejectedValue(
      new OdysseusApiError({ status: 502, detail: 'Chronos upstream returned 503', path: '/trips/trip-1/chronos/sync' }),
    )
    rerender(
      <ChronosSyncModal
        isOpen={true}
        onClose={vi.fn()}
        trip={makeTrip({ status: 'booked' })}
        isOffline={false}
        onLoadPreview={failLoad}
        onSync={failSync}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sync to Chronos' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sync to Chronos' }))

    await waitFor(() => {
      expect(screen.getByText('Chronos upstream returned 503')).toBeInTheDocument()
    })
  })

  it('disables Sync and Disable buttons when offline', async () => {
    render(
      <ChronosSyncModal
        isOpen={true}
        onClose={vi.fn()}
        trip={makeTrip({ chronos_sync_enabled: true })}
        isOffline={true}
        onLoadPreview={vi.fn()}
        onSync={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Update Chronos Sync' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Disable Sync' })).toBeDisabled()
    expect(screen.getByText(/Reconnect to preview and sync Chronos travel mode/i)).toBeInTheDocument()
  })
})
