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

  it('normalizes trip titles into valid lowercase slugs', () => {
    expect(createTripSlug('  Pacific Explorer 2027!  ')).toBe('pacific-explorer-2027')
  })
})
