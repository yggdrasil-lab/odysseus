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

  it('normalizes trip titles into valid lowercase slugs', () => {
    expect(createTripSlug('  Pacific Explorer 2027!  ')).toBe('pacific-explorer-2027')
  })
})
