import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('maplibre-gl', () => ({ default: { Map: vi.fn() } }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/mock-pdf.worker.mjs' }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 320, height: 240 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
      destroy: async () => {},
    }),
  }),
}))

import { App, parseShareTokenFromPath } from '../App'
import { OdysseusApiError, type OdysseusApiAdapter } from '../api/client'
import type { ShareToken, SharedTripView, Trip } from '../types'
import { ShareTokenModal } from './ShareTokenModal'

function makeTrip(): Trip {
  return {
    id: 'trip-1',
    title: 'Aegean Companion Voyage',
    slug: 'aegean-companion-voyage',
    status: 'booked',
    start_date: '2027-05-01',
    end_date: '2027-05-02',
    home_timezone: 'Pacific/Auckland',
    budget_nzd: '4500.00',
    immich_album_id: null,
    vault_note_path: null,
    chronos_sync_enabled: false,
    chronos_overlay_mode: 'suppress_all_grid_blocks',
    summary: 'Synthetic companion itinerary.',
    created_at: '',
    updated_at: '',
  }
}

function makeShareToken(overrides?: Partial<ShareToken>): ShareToken {
  return {
    id: 'tok-id-1',
    trip_id: 'trip-1',
    token: 'tok-demo',
    label: 'Family Link',
    include_pnrs: false,
    include_attachments: false,
    include_costs: false,
    include_checklists: false,
    include_private_notes: false,
    expires_at: null,
    revoked_at: null,
    created_at: '',
    updated_at: '',
    is_active: true,
    ...overrides,
  }
}

function makeSharedTripView(options?: { includeAttachments?: boolean }): SharedTripView {
  const trip = makeTrip()
  const includeAttachments = Boolean(options?.includeAttachments)
  return {
    visibility: {
      include_pnrs: false,
      include_attachments: includeAttachments,
      include_costs: false,
      include_checklists: false,
      include_private_notes: false,
    },
    trip: {
      id: trip.id,
      title: trip.title,
      slug: trip.slug,
      status: trip.status,
      start_date: trip.start_date,
      end_date: trip.end_date,
      home_timezone: trip.home_timezone,
      budget_nzd: null,
      chronos_sync_enabled: false,
      chronos_overlay_mode: 'suppress_all_grid_blocks',
      summary: trip.summary,
      created_at: '',
      updated_at: '',
    },
    legs: [
      {
        id: 'leg-1',
        trip_id: trip.id,
        name: 'Harbor City',
        primary_city: 'Harbor City',
        country_code: 'NZ',
        base_timezone: 'Pacific/Auckland',
        start_date: '2027-05-01',
        end_date: '2027-05-02',
        color: '#38bdf8',
        sort_order: 0,
        notes: null,
        created_at: '',
        updated_at: '',
      },
    ],
    days: [
      { id: 'day-1', trip_id: trip.id, date: '2027-05-01', title: 'Arrival', notes: null, created_at: '', updated_at: '' },
    ],
    itinerary_items: [
      {
        id: 'item-1',
        trip_id: trip.id,
        day_id: 'day-1',
        title: 'Harbor Walk',
        category: 'activity',
        status: 'confirmed',
        start_local: '2027-05-01T10:00:00',
        start_tz: 'Pacific/Auckland',
        end_local: null,
        end_tz: null,
        start_utc: null,
        end_utc: null,
        place_label: 'Pier 1',
        place_id: null,
        sync_to_chronos: false,
        sort_order: 0,
        notes: null,
        created_at: '',
        updated_at: '',
      },
    ],
    checklists: [],
    travel_notes: [],
    bookings: [
      {
        id: 'book-1',
        trip_id: trip.id,
        booking_type: 'flight',
        status: 'confirmed',
        title: 'Pacific Air AKL to HND',
        provider: 'Pacific Air',
        confirmation_code: null,
        quoted_cost: null,
        quoted_currency: null,
        source_reference: null,
        notes: 'Check-in 2h before departure',
        sort_order: 0,
        segments: [],
        created_at: '',
        updated_at: '',
      },
    ],
    attachments: includeAttachments
      ? [
          {
            id: 'att-share-1',
            trip_id: trip.id,
            booking_id: 'book-1',
            filename: 'companion-pass.png',
            mime_type: 'image/png',
            size_bytes: 2048,
            sha256: 'abc',
            content_url: '/api/share/tok-demo/attachments/att-share-1/content',
            created_at: '',
          },
        ]
      : [],
    places: [],
    route_estimates: [],
  }
}

function makeMockAdapter(overrides?: Partial<OdysseusApiAdapter>): OdysseusApiAdapter {
  const noop = vi.fn().mockRejectedValue(new Error('Should not be called'))
  return {
    listTrips: noop,
    createTrip: noop,
    getWorkspace: noop,
    createLeg: noop,
    createItineraryItem: noop,
    updateItineraryItem: noop,
    deleteItineraryItem: noop,
    createChecklist: noop,
    createChecklistItem: noop,
    updateChecklistItem: noop,
    deleteChecklistItem: noop,
    createNote: noop,
    deleteNote: noop,
    createBooking: noop,
    updateBooking: noop,
    deleteBooking: noop,
    uploadAttachment: noop,
    deleteAttachment: noop,
    attachmentContentUrl: () => '',
    createPlace: noop,
    updatePlace: noop,
    deletePlace: noop,
    searchPlaces: noop,
    resolvePlaceUrl: noop,
    computeDayRoutes: noop,
    updateRouteEstimate: noop,
    getOfflineBundle: noop,
    listMapPacks: noop,
    createMapPack: noop,
    deleteMapPack: noop,
    mapPackFileUrl: () => '',
    listShareTokens: vi.fn().mockResolvedValue([]),
    createShareToken: vi.fn().mockResolvedValue(makeShareToken()),
    updateShareToken: vi.fn().mockResolvedValue(makeShareToken({ include_pnrs: true })),
    rotateShareToken: vi.fn().mockResolvedValue(makeShareToken({ token: 'tok-rotated' })),
    revokeShareToken: vi.fn().mockResolvedValue(makeShareToken({ is_active: false, revoked_at: '2027-01-01T00:00:00Z' })),
    deleteShareToken: vi.fn().mockResolvedValue(undefined),
    getSharedTrip: vi.fn().mockResolvedValue(makeSharedTripView()),
    sharedAttachmentContentUrl: (tok, attId) => `/api/share/${tok}/attachments/${attId}/content`,
    ...overrides,
  }
}

beforeEach(() => {
  window.scrollTo = vi.fn()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('parseShareTokenFromPath', () => {
  it('extracts valid share tokens and rejects author or malformed paths', () => {
    expect(parseShareTokenFromPath('/share/tok-demo_123')).toBe('tok-demo_123')
    expect(parseShareTokenFromPath('/share/tok-demo/')).toBe('tok-demo')
    expect(parseShareTokenFromPath('/')).toBeNull()
    expect(parseShareTokenFromPath('/share/')).toBeNull()
    expect(parseShareTokenFromPath('/share/a/b')).toBeNull()
  })
})

describe('ShareTokenModal', () => {
  it('defaults all 5 visibility toggles OFF and invokes create, copy, toggle, rotate, revoke, delete', async () => {
    const tokenItem = makeShareToken()
    const onLoadTokens = vi.fn().mockResolvedValue(undefined)
    const onCreateToken = vi.fn().mockResolvedValue(tokenItem)
    const onUpdateToken = vi.fn().mockResolvedValue({ ...tokenItem, include_pnrs: true })
    const onRotateToken = vi.fn().mockResolvedValue({ ...tokenItem, token: 'tok-new' })
    const onRevokeToken = vi.fn().mockResolvedValue({ ...tokenItem, is_active: false, revoked_at: '2027-01-02T00:00:00Z' })
    const onDeleteToken = vi.fn().mockResolvedValue(undefined)

    render(
      <ShareTokenModal
        isOpen
        onClose={() => {}}
        trip={makeTrip()}
        tokens={[tokenItem]}
        loading={false}
        error={null}
        isOffline={false}
        onLoadTokens={onLoadTokens}
        onCreateToken={onCreateToken}
        onUpdateToken={onUpdateToken}
        onRotateToken={onRotateToken}
        onRevokeToken={onRevokeToken}
        onDeleteToken={onDeleteToken}
      />,
    )

    expect(onLoadTokens).toHaveBeenCalledTimes(1)
    const createToggleLabels = [
      'Include PNRs & codes',
      'Include PDFs & attachments',
      'Include quoted costs',
      'Include personal checklists',
      'Include private notes',
    ]
    for (const labelText of createToggleLabels) {
      const checkboxes = screen.getAllByLabelText(labelText) as HTMLInputElement[]
      expect(checkboxes[0].checked).toBe(false)
    }

    fireEvent.change(screen.getByLabelText('Link Label (optional)'), { target: { value: 'Buddy Link' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Share Link' }))
    await waitFor(() => {
      expect(onCreateToken).toHaveBeenCalledWith({
        label: 'Buddy Link',
        expires_at: null,
        include_pnrs: false,
        include_attachments: false,
        include_costs: false,
        include_checklists: false,
        include_private_notes: false,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/share/tok-demo'))
    expect(await screen.findByText('Copied!')).toBeInTheDocument()

    const tokenCard = screen.getByTestId('share-token-tok-id-1')
    const pnrToggle = tokenCard.querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(pnrToggle)
    await waitFor(() => expect(onUpdateToken).toHaveBeenCalledWith('tok-id-1', { include_pnrs: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    await waitFor(() => expect(onRotateToken).toHaveBeenCalledWith('tok-id-1'))

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(onRevokeToken).toHaveBeenCalledWith('tok-id-1'))

    fireEvent.click(screen.getByRole('button', { name: /Delete share link/ }))
    await waitFor(() => expect(onDeleteToken).toHaveBeenCalledWith('tok-id-1'))
  })
})

describe('App /share/:token Companion View', () => {
  it('renders read-only companion view without calling listTrips, hides redacted fields, and omits Budget tab', async () => {
    const listTrips = vi.fn()
    const getSharedTrip = vi.fn().mockResolvedValue(makeSharedTripView())
    const adapter = makeMockAdapter({ listTrips, getSharedTrip })

    render(<App adapter={adapter} initialPath="/share/tok-demo" />)

    expect(await screen.findAllByRole('heading', { name: 'Aegean Companion Voyage' })).not.toHaveLength(0)
    expect(getSharedTrip).toHaveBeenCalledWith('tok-demo', expect.any(AbortSignal))
    expect(listTrips).not.toHaveBeenCalled()

    expect(screen.getByText('Shared Read-Only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New Trip/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save Offline/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Share$/i })).not.toBeInTheDocument()
    expect(screen.getAllByText('Attachments hidden by trip owner').length).toBeGreaterThan(0)

    const bottomNav = screen.getByRole('navigation', { name: 'Main Mobile Navigation' })
    expect(bottomNav).toHaveTextContent('Itinerary')
    expect(bottomNav).toHaveTextContent('Map')
    expect(bottomNav).toHaveTextContent('Bookings')
    expect(bottomNav).toHaveTextContent('Lists')
    expect(bottomNav).not.toHaveTextContent('Budget')
  })

  it('opens inline attachment viewer using /api/share/.../content when include_attachments is true', async () => {
    const adapter = makeMockAdapter({
      getSharedTrip: vi.fn().mockResolvedValue(makeSharedTripView({ includeAttachments: true })),
    })
    render(<App adapter={adapter} initialPath="/share/tok-demo" />)

    await screen.findAllByRole('heading', { name: 'Aegean Companion Voyage' })
    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0])

    const modal = await screen.findByTestId('pdf-viewer-modal')
    expect(modal.querySelector('a[download="companion-pass.png"]')).toHaveAttribute(
      'href',
      '/api/share/tok-demo/attachments/att-share-1/content',
    )
  })

  it('displays explicit error banners for 410 revoked, 404 not found, and 429 rate limited links', async () => {
    for (const [status, detail, expectedHeading] of [
      [410, 'Link revoked', 'Share link expired or revoked'],
      [404, 'Not found', 'Link not found'],
      [429, 'Too many requests', 'Rate limit exceeded, please try again shortly'],
    ] as const) {
      const adapter = makeMockAdapter({
        getSharedTrip: vi.fn().mockRejectedValue(
          new OdysseusApiError({ status, detail, path: '/share/tok-bad' }),
        ),
      })
      render(<App adapter={adapter} initialPath="/share/tok-bad" />)
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(expectedHeading)
      cleanup()
    }
  })
})
