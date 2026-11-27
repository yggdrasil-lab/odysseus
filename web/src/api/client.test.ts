import { describe, expect, it, vi } from 'vitest'

import {
  ApiRoutingError,
  OdysseusApiError,
  OdysseusHttpAdapter,
  SessionExpiredError,
  createTripSlug,
} from './client'

describe('OdysseusHttpAdapter fail-loud boundary', () => {
  it('throws SessionExpiredError on 401 or Authentik redirect', async () => {
    const adapter = new OdysseusHttpAdapter({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response('Unauthorized', { status: 401 }),
      ),
    })

    await expect(adapter.listTrips()).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('throws ApiRoutingError when API route returns unexpected HTML', async () => {
    const adapter = new OdysseusHttpAdapter({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response('<html><body>SPA fallback</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      ),
    })

    await expect(adapter.listTrips()).rejects.toBeInstanceOf(ApiRoutingError)
  })

  it('throws OdysseusApiError with parsed detail on 422', async () => {
    const adapter = new OdysseusHttpAdapter({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Invalid IANA timezone: Mars/Phobos' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    })

    let caught: unknown
    try {
      await adapter.listTrips()
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(OdysseusApiError)
    expect(caught).toMatchObject({
      name: 'OdysseusApiError',
      status: 422,
      detail: 'Invalid IANA timezone: Mars/Phobos',
    })
  })

  it('uploads attachment with FormData without forcing application/json header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'att-1',
          trip_id: 'trip-1',
          booking_id: 'book-1',
          filename: 'ticket.pdf',
          mime_type: 'application/pdf',
          size_bytes: 128,
          sha256: 'abc',
          extracted_text: null,
          created_at: '2027-01-01T00:00:00Z',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    const adapter = new OdysseusHttpAdapter({ fetchImpl: fetchMock })
    const file = new File(['%PDF-1.4'], 'ticket.pdf', { type: 'application/pdf' })

    const uploaded = await adapter.uploadAttachment('trip-1', file, 'book-1')
    expect(uploaded.id).toBe('att-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    expect(adapter.attachmentContentUrl('trip-1', 'att-1')).toBe(
      '/api/trips/trip-1/attachments/att-1/content',
    )
  })

  it('throws OdysseusApiError on 413 oversized attachment and 422 URL resolve', async () => {
    const adapter413 = new OdysseusHttpAdapter({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'File exceeds 15 MB limit' }), {
          status: 413,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    })
    const file = new File(['abc'], 'huge.pdf', { type: 'application/pdf' })
    await expect(adapter413.uploadAttachment('trip-1', file)).rejects.toMatchObject({
      status: 413,
      detail: 'File exceeds 15 MB limit',
    })

    const adapter422 = new OdysseusHttpAdapter({
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'No coordinates in share URL' }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    })
    await expect(adapter422.resolvePlaceUrl('trip-1', 'https://maps.app.goo.gl/abc')).rejects.toMatchObject({
      status: 422,
      detail: 'No coordinates in share URL',
    })
  })

  it('surfaces 404, 410, and 429 on getSharedTrip via OdysseusApiError without SessionExpiredError', async () => {
    for (const [status, detail] of [
      [404, 'Share link not found'],
      [410, 'Share link expired or revoked'],
      [429, 'Rate limit exceeded'],
    ] as const) {
      const adapter = new OdysseusHttpAdapter({
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ detail }), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      })
      await expect(adapter.getSharedTrip('tok-bad')).rejects.toMatchObject({
        name: 'OdysseusApiError',
        status,
        detail,
      })
    }
  })

  it('fetches trip budget summary and patches trip budget_nzd', async () => {
    const budgetPayload = {
      trip_id: 'trip-1',
      trip_slug: 'japan-autumn',
      plutus_tag: 'trip:japan-autumn',
      budget_nzd: '5000.00',
      planned_nzd: '2400.00',
      actual_settled_nzd: '1850.25',
      remaining_budget_nzd: '3149.75',
      variance_nzd: '-549.75',
      plutus_available: true,
      plutus_error: null,
      midas_url: 'https://midas.example.test/?tag=trip:japan-autumn',
      missing_fx_currencies: [],
      fx_rates: { SGD: { rate: '1.2500', rate_date: '2027-01-10', source: 'plutus' } },
      planned_bookings: [],
      category_breakdown: [],
      transactions: [],
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(budgetPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'trip-1',
            title: 'Japan Autumn',
            slug: 'japan-autumn',
            status: 'booked',
            start_date: null,
            end_date: null,
            home_timezone: 'Pacific/Auckland',
            budget_nzd: '5500.00',
            immich_album_id: null,
            vault_note_path: null,
            chronos_sync_enabled: false,
            chronos_overlay_mode: 'suppress_all_grid_blocks',
            summary: null,
            created_at: '',
            updated_at: '',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const adapter = new OdysseusHttpAdapter({ fetchImpl: fetchMock })
    const summary = await adapter.getTripBudget('trip-1')
    expect(summary.plutus_tag).toBe('trip:japan-autumn')
    expect(summary.actual_settled_nzd).toBe('1850.25')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/trips/trip-1/budget')

    const updated = await adapter.updateTrip('trip-1', { budget_nzd: '5500.00' })
    expect(updated.budget_nzd).toBe('5500.00')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/trips/trip-1')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH')
  })

  it('fetches Chronos preview and posts Chronos sync payload', async () => {
    const previewPayload = {
      trip_id: 'trip-1',
      trip_slug: 'japan-autumn',
      eligible: true,
      ineligible_reason: null,
      sync_enabled: false,
      overlay_mode: 'suppress_all_grid_blocks',
      confirmed_segment_count: 1,
      synced_item_count: 1,
      anchors: [],
    }
    const syncPayload = {
      trip_id: 'trip-1',
      trip_slug: 'japan-autumn',
      sync_enabled: true,
      overlay_mode: 'keep_work_blocks',
      overlay_active: true,
      upserted_count: 2,
      deleted_count: 1,
      anchors: [],
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(previewPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(syncPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

    const adapter = new OdysseusHttpAdapter({ fetchImpl: fetchMock })
    const preview = await adapter.getChronosPreview('trip-1')
    expect(preview.eligible).toBe(true)
    expect(preview.confirmed_segment_count).toBe(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/trips/trip-1/chronos/preview')

    const syncRes = await adapter.syncTripToChronos('trip-1', {
      enabled: true,
      overlay_mode: 'keep_work_blocks',
    })
    expect(syncRes.sync_enabled).toBe(true)
    expect(syncRes.upserted_count).toBe(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/trips/trip-1/chronos/sync')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST')
  })

  it('lists, assigns, dismisses unassigned bookings, confirms trip bookings, and builds unassigned URL', async () => {
    const sampleUnassigned = [
      {
        id: 'ub-1',
        trip_id: null,
        booking_type: 'lodging',
        status: 'draft',
        title: 'Harbour Lodge Voucher',
        provider: 'Harbour Lodge',
        confirmation_code: 'HTL552',
        quoted_cost: '420.50',
        quoted_currency: 'SGD',
        source_reference: 'iris-1',
        source_email_message_id: '<msg-1@hotel.example>',
        raw_email_payload: { from_address: 'Harbour Lodge <bookings@harbourlodge.example>' },
        notes: null,
        sort_order: 0,
        segments: [],
        attachments: [],
        created_at: '',
        updated_at: '',
      },
    ]
    const assignedBooking = { ...sampleUnassigned[0], trip_id: 'trip-1', status: 'confirmed' }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sampleUnassigned), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(assignedBooking), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...assignedBooking, id: 'book-2' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const adapter = new OdysseusHttpAdapter({ fetchImpl: fetchMock })
    const listed = await adapter.listUnassignedBookings()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe('ub-1')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/bookings/unassigned')

    const assigned = await adapter.assignUnassignedBooking('ub-1', { trip_id: 'trip-1', confirm: true })
    expect(assigned.status).toBe('confirmed')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/bookings/unassigned/ub-1/assign')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST')

    const confirmed = await adapter.confirmBooking('trip-1', 'book-2')
    expect(confirmed.status).toBe('confirmed')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/trips/trip-1/bookings/book-2/confirm')
    expect(fetchMock.mock.calls[2][1]?.method).toBe('POST')

    await adapter.deleteUnassignedBooking('ub-1')
    expect(fetchMock.mock.calls[3][0]).toBe('/api/bookings/unassigned/ub-1')
    expect(fetchMock.mock.calls[3][1]?.method).toBe('DELETE')

    expect(adapter.unassignedAttachmentContentUrl('ub-1', 'att-9')).toBe(
      '/api/bookings/unassigned/ub-1/attachments/att-9/content',
    )
  })

  it('normalizes trip titles into valid lowercase slugs', () => {
    expect(createTripSlug('  Pacific Explorer 2027!  ')).toBe('pacific-explorer-2027')
  })

  it('fetches Immich trip photos and exports Markdown with HTML routing guard', async () => {
    const photosPayload = {
      trip_id: 'trip-1',
      status: 'available',
      source: 'album',
      message: null,
      total_photos: 1,
      days: [
        {
          day_id: 'day-1',
          date: '2027-01-12',
          photos: [
            {
              asset_id: 'asset-1',
              original_filename: 'harbor.jpg',
              captured_at: '2027-01-12T10:00:00Z',
              local_date: '2027-01-12',
              thumbnail_url: '/api/trips/trip-1/photos/asset-1/thumbnail',
              web_url: 'https://photos.home.example/photos/asset-1',
              thumbhash: null,
            },
          ],
        },
      ],
      ungrouped_photos: [],
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(photosPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('---\ntype: trip-snapshot\n---\n# Pacific Explorer\n', {
          status: 200,
          headers: { 'content-type': 'text/markdown; charset=utf-8' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('<html><body>SPA fallback</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      )

    const adapter = new OdysseusHttpAdapter({ fetchImpl: fetchMock })
    const photos = await adapter.getTripPhotos('trip-1')
    expect(photos.total_photos).toBe(1)
    expect(photos.days[0].photos[0].asset_id).toBe('asset-1')

    const md = await adapter.exportTripMarkdown('trip-1')
    expect(md).toContain('type: trip-snapshot')

    await expect(adapter.exportTripMarkdown('trip-1')).rejects.toBeInstanceOf(ApiRoutingError)
  })
})
