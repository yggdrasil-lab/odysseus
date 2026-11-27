import { describe, expect, it, vi } from 'vitest'

vi.mock('maplibre-gl', () => ({ default: { addProtocol: vi.fn() } }))

import { PMTiles } from 'pmtiles'

import { SessionExpiredError } from '../api/client'
import { shouldShowIosInstallBanner } from '../components/IosInstallBanner'
import type { OfflineBundle, TripWorkspace } from '../types'
import { BlobSource } from './pmtilesProtocol'
import { InMemoryOfflineStorageAdapter } from './storage'
import { classifySwRequest, isValidCacheableResponse } from './swPolicy'
import { OfflineQuotaError, saveTripOffline } from './sync'

function buildMinimalPmtilesBytes(): ArrayBuffer {
  const ab = new ArrayBuffer(130)
  const buf = new Uint8Array(ab)
  const view = new DataView(ab)
  const magic = [0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 0x03]
  magic.forEach((b, idx) => {
    buf[idx] = b
  })
  view.setBigUint64(8, 127n, true)
  view.setBigUint64(16, 1n, true)
  view.setBigUint64(24, 128n, true)
  view.setBigUint64(32, 2n, true)
  view.setBigUint64(40, 130n, true)
  view.setBigUint64(48, 0n, true)
  view.setBigUint64(56, 130n, true)
  view.setBigUint64(64, 0n, true)
  buf[96] = 1
  buf[97] = 1
  buf[98] = 1
  buf[99] = 1
  buf[100] = 0
  buf[101] = 12
  view.setInt32(102, 1740000000, true)
  view.setInt32(106, -370000000, true)
  view.setInt32(110, 1750000000, true)
  view.setInt32(114, -360000000, true)
  buf[118] = 10
  view.setInt32(119, 1747600000, true)
  view.setInt32(123, -368400000, true)
  buf[127] = 0x00
  buf[128] = 0x7b
  buf[129] = 0x7d
  return ab
}

function makeWorkspaceFixture(): TripWorkspace {
  return {
    trip: {
      id: 'trip-1',
      title: 'Aegean Trial',
      slug: 'aegean-trial',
      status: 'booked',
      start_date: '2027-05-01',
      end_date: '2027-05-02',
      home_timezone: 'Pacific/Auckland',
      budget_nzd: '3000.00',
      immich_album_id: null,
      vault_note_path: null,
      chronos_sync_enabled: false,
      chronos_overlay_mode: 'suppress_all_grid_blocks',
      summary: null,
      created_at: '',
      updated_at: '',
    },
    legs: [],
    days: [],
    itinerary_items: [],
    checklists: [],
    travel_notes: [],
    bookings: [],
    attachments: [],
    places: [],
    route_estimates: [],
    map_packs: [],
  }
}

function makeBundle(options?: { attSha?: string; packId?: string | null }): OfflineBundle {
  const attSha = options?.attSha ?? 'sha-att-1'
  const packId = options?.packId === undefined ? 'pack-1' : options.packId
  return {
    bundle_version: 1,
    generated_at: '2027-01-01T00:00:00Z',
    workspace_sha256: 'ws-sha-1',
    workspace: makeWorkspaceFixture(),
    attachments: [
      {
        id: 'att-1',
        booking_id: null,
        filename: 'ticket.pdf',
        mime_type: 'application/pdf',
        size_bytes: 12,
        sha256: attSha,
        content_url: '/api/trips/trip-1/attachments/att-1/content',
      },
    ],
    map_packs: packId
      ? [
          {
            id: packId,
            leg_id: 'leg-1',
            label: 'Harbor Pack',
            filename: 'harbor.pmtiles',
            size_bytes: 130,
            sha256: 'sha-pack-1',
            max_zoom: 12,
            bbox_west: 174.0,
            bbox_south: -37.0,
            bbox_east: 175.0,
            bbox_north: -36.0,
            file_url: `/api/trips/trip-1/mappacks/${packId}/file`,
          },
        ]
      : [],
  }
}

describe('swPolicy request and cache validation', () => {
  it('classifies navigation shell, static assets, and API/cross-origin bypasses', () => {
    const origin = 'https://odysseus.example.com'
    expect(classifySwRequest('https://odysseus.example.com/', 'GET', 'navigate', origin)).toBe('shell-html')
    expect(classifySwRequest('https://odysseus.example.com/share/tok123', 'GET', 'navigate', origin)).toBe('bypass')
    expect(classifySwRequest('https://odysseus.example.com/share', 'GET', 'navigate', origin)).toBe('bypass')
    expect(classifySwRequest('https://odysseus.example.com/assets/pdf.worker.min-abc.mjs', 'GET', 'same-origin', origin)).toBe('static-asset')
    expect(classifySwRequest('https://odysseus.example.com/api/trips', 'GET', 'cors', origin)).toBe('bypass')
    expect(classifySwRequest('https://odysseus.example.com/sw.js', 'GET', 'same-origin', origin)).toBe('bypass')
    expect(classifySwRequest('https://tiles.openfreemap.org/styles/liberty', 'GET', 'cors', origin)).toBe('bypass')
    expect(classifySwRequest('https://odysseus.example.com/', 'POST', 'same-origin', origin)).toBe('bypass')
  })

  it('rejects 302, opaqueredirect, redirected, and HTML responses on non-HTML assets', () => {
    expect(isValidCacheableResponse(new Response('ok', { status: 200, headers: { 'content-type': 'application/javascript' } }), false)).toBe(true)
    expect(isValidCacheableResponse(new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }), false)).toBe(false)
    expect(isValidCacheableResponse(new Response('<html>app</html>', { status: 200, headers: { 'content-type': 'text/html' } }), true)).toBe(true)
    expect(isValidCacheableResponse({ status: 302, type: 'basic', redirected: false, ok: false, url: '', headers: new Headers() } as Response, true)).toBe(false)
    expect(isValidCacheableResponse({ status: 0, type: 'opaqueredirect', redirected: false, ok: false, url: '', headers: new Headers() } as Response, true)).toBe(false)
    expect(isValidCacheableResponse({ status: 200, type: 'basic', redirected: true, ok: true, url: 'https://auth/outpost.goauthentik.io/start', headers: new Headers({ 'content-type': 'text/html' }) } as Response, true)).toBe(false)
  })
})

describe('saveTripOffline sync engine and BlobSource', () => {
  it('syncs bundle, skips unchanged sha256 blobs on re-sync, and prunes removed mappacks', async () => {
    const storage = new InMemoryOfflineStorageAdapter()
    let includePack = true
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/offline-bundle')) {
        return new Response(JSON.stringify(makeBundle({ packId: includePack ? 'pack-1' : null })), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/attachments/')) {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        })
      }
      return new Response(buildMinimalPmtilesBytes(), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      })
    })

    const first = await saveTripOffline({
      tripId: 'trip-1',
      includeMapPacks: true,
      storage,
      fetchImpl: fetchMock,
    })
    expect(first.attachmentCount).toBe(1)
    expect(first.mapPackCount).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const second = await saveTripOffline({
      tripId: 'trip-1',
      includeMapPacks: true,
      storage,
      fetchImpl: fetchMock,
    })
    expect(second.attachmentCount).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)

    includePack = false
    const third = await saveTripOffline({
      tripId: 'trip-1',
      includeMapPacks: true,
      storage,
      fetchImpl: fetchMock,
    })
    expect(third.mapPackCount).toBe(0)
    expect(await storage.listMapPackIdsForTrip('trip-1')).toEqual([])
  })

  it('rejects 302 or text/html login redirect as SessionExpiredError', async () => {
    const storage = new InMemoryOfflineStorageAdapter()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html><body>Sign in</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )

    await expect(
      saveTripOffline({ tripId: 'trip-1', includeMapPacks: false, storage, fetchImpl: fetchMock }),
    ).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('surfaces QuotaExceededError as OfflineQuotaError', async () => {
    const storage = new InMemoryOfflineStorageAdapter()
    vi.spyOn(storage, 'putAttachmentBlob').mockRejectedValue(
      new DOMException('Storage full', 'QuotaExceededError'),
    )
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/offline-bundle')) {
        return new Response(JSON.stringify(makeBundle({ packId: null })), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })
    })

    await expect(
      saveTripOffline({ tripId: 'trip-1', includeMapPacks: false, storage, fetchImpl: fetchMock }),
    ).rejects.toBeInstanceOf(OfflineQuotaError)
  })

  it('reads synthetic PMTiles v3 header via BlobSource', async () => {
    const blob = new Blob([buildMinimalPmtilesBytes()], { type: 'application/octet-stream' })
    const pmtiles = new PMTiles(new BlobSource(blob, 'test-pack'))
    const header = await pmtiles.getHeader()
    expect(header.maxZoom).toBe(12)
    expect(header.minLon).toBeCloseTo(174, 3)
  })
})

describe('shouldShowIosInstallBanner', () => {
  it('shows only on non-standalone, non-dismissed iOS Safari', () => {
    const iosUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
    const androidUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36'
    expect(shouldShowIosInstallBanner(iosUa, false, false)).toBe(true)
    expect(shouldShowIosInstallBanner(iosUa, true, false)).toBe(false)
    expect(shouldShowIosInstallBanner(iosUa, false, true)).toBe(false)
    expect(shouldShowIosInstallBanner(androidUa, false, false)).toBe(false)
  })
})
