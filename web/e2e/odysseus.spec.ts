import { devices, expect, test, type Locator, type Page } from '@playwright/test'

function buildSyntheticPdfBuffer(): Buffer {
  const stream = 'BT /F1 18 Tf 40 200 Td (Pacific Air Boarding Pass - ODYS99) Tj ET'
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
    `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += obj
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'utf8')
}

function buildMinimalPmtilesBuffer(): Buffer {
  const buf = Buffer.alloc(130)
  Buffer.from('PMTiles\x03', 'ascii').copy(buf, 0)
  buf.writeBigUInt64LE(127n, 8)
  buf.writeBigUInt64LE(1n, 16)
  buf.writeBigUInt64LE(128n, 24)
  buf.writeBigUInt64LE(2n, 32)
  buf.writeBigUInt64LE(130n, 40)
  buf.writeBigUInt64LE(0n, 48)
  buf.writeBigUInt64LE(130n, 56)
  buf.writeBigUInt64LE(0n, 64)
  buf[96] = 1
  buf[97] = 1
  buf[98] = 1
  buf[99] = 1
  buf[100] = 0
  buf[101] = 12
  buf.writeInt32LE(1740000000, 102)
  buf.writeInt32LE(-370000000, 106)
  buf.writeInt32LE(1750000000, 110)
  buf.writeInt32LE(-360000000, 114)
  buf[118] = 10
  buf.writeInt32LE(1747600000, 119)
  buf.writeInt32LE(-368400000, 123)
  buf[127] = 0x00
  buf[128] = 0x7b
  buf[129] = 0x7d
  return buf
}

function buildSyntheticPngBuffer(): Buffer {
  // Valid 1x1 transparent PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
}

interface MockApiOptions {
  onApiRequest?: (path: string) => void
  seedInbound?: boolean
  photosMode?: 'empty' | 'available' | 'offline'
}

async function mockOdysseusApi(
  page: Page,
  onApiRequestOrOptions?: ((path: string) => void) | MockApiOptions,
) {
  const opts: MockApiOptions =
    typeof onApiRequestOrOptions === 'function'
      ? { onApiRequest: onApiRequestOrOptions }
      : (onApiRequestOrOptions ?? {})
  const onApiRequest = opts.onApiRequest
  const pdfBuffer = buildSyntheticPdfBuffer()
  const pmtilesBuffer = buildMinimalPmtilesBuffer()
  const pngBuffer = buildSyntheticPngBuffer()
  const photosMode = opts.photosMode ?? 'empty'

  const trip = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Pacific Explorer',
    slug: 'pacific-explorer',
    status: 'booked',
    start_date: '2027-01-12',
    end_date: '2027-01-13',
    home_timezone: 'Pacific/Auckland',
    budget_nzd: '4200.00',
    immich_album_id: null,
    vault_note_path: null,
    chronos_sync_enabled: false,
    chronos_overlay_mode: 'suppress_all_grid_blocks',
    summary: 'Cross-timezone coastal itinerary with bookings, places, and route estimates.',
    created_at: '2027-01-01T00:00:00Z',
    updated_at: '2027-01-01T00:00:00Z',
  }

  const legs = [
    {
      id: '22222222-2222-4222-8222-222222222201',
      trip_id: trip.id,
      name: 'Harbor City',
      primary_city: 'Harbor City',
      country_code: 'NZ',
      base_timezone: 'Pacific/Auckland',
      start_date: '2027-01-12',
      end_date: '2027-01-13',
      color: '#38bdf8',
      sort_order: 0,
      notes: null,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222202',
      trip_id: trip.id,
      name: 'Island Coast',
      primary_city: 'Island Coast',
      country_code: 'JP',
      base_timezone: 'Asia/Tokyo',
      start_date: '2027-01-12',
      end_date: '2027-01-13',
      color: '#f59e0b',
      sort_order: 1,
      notes: null,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
  ]

  const days = [
    {
      id: '33333333-3333-4333-8333-333333333301',
      trip_id: trip.id,
      date: '2027-01-12',
      title: 'Ferry & Harbor Walk',
      notes: null,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
    {
      id: '33333333-3333-4333-8333-333333333302',
      trip_id: trip.id,
      date: '2027-01-13',
      title: 'Coastal Lookout',
      notes: null,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
  ]

  const places = [
    {
      id: '88888888-8888-4888-8888-888888888801',
      trip_id: trip.id,
      name: 'Harbor Pier 2',
      category: 'transit',
      latitude: -36.8426,
      longitude: 174.7662,
      address: '2 Quay Street, Harbor City',
      notes: 'Board ferry gate B',
      external_map_url: null,
      google_place_id: null,
      osm_id: 'node/100',
      is_backlog: false,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
    {
      id: '88888888-8888-4888-8888-888888888802',
      trip_id: trip.id,
      name: 'Harbour View Hotel',
      category: 'lodging',
      latitude: -36.8442,
      longitude: 174.7615,
      address: '12 Quay Street, Harbor City',
      notes: 'Early bag drop available',
      external_map_url: null,
      google_place_id: null,
      osm_id: 'node/101',
      is_backlog: false,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
    {
      id: '88888888-8888-4888-8888-888888888803',
      trip_id: trip.id,
      name: 'Old Quay Night Market',
      category: 'food',
      latitude: -36.8465,
      longitude: 174.7691,
      address: '45 Old Quay',
      notes: 'Backlog supper idea',
      external_map_url: null,
      google_place_id: null,
      osm_id: 'node/102',
      is_backlog: true,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
  ]

  const items = [
    {
      id: '44444444-4444-4444-8444-444444444401',
      trip_id: trip.id,
      day_id: days[0].id,
      title: 'Morning Harbor Ferry',
      category: 'transit',
      status: 'confirmed',
      start_local: '2027-01-12T09:15:00',
      start_tz: 'Asia/Tokyo',
      end_local: '2027-01-12T10:45:00',
      end_tz: 'Asia/Tokyo',
      start_utc: '2027-01-12T00:15:00Z',
      end_utc: '2027-01-12T01:45:00Z',
      place_label: 'Harbor Pier 2',
      place_id: places[0].id,
      sync_to_chronos: false,
      sort_order: 0,
      notes: null,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
    {
      id: '44444444-4444-4444-8444-444444444402',
      trip_id: trip.id,
      day_id: null,
      title: 'Night Market Tasting',
      category: 'food',
      status: 'idea',
      start_local: null,
      start_tz: null,
      end_local: null,
      end_tz: null,
      start_utc: null,
      end_utc: null,
      place_label: 'Old Quay Lane',
      place_id: places[2].id,
      sync_to_chronos: false,
      sort_order: 1,
      notes: null,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
  ]

  const bookings = [
    {
      id: '99999999-9999-4999-8999-999999999901',
      trip_id: trip.id,
      booking_type: 'flight',
      status: 'confirmed',
      title: 'Pacific Air AKL to HND',
      provider: 'Pacific Air',
      confirmation_code: 'ODYS99',
      quoted_cost: '1480.00',
      quoted_currency: 'NZD',
      source_reference: null,
      source_email_message_id: null,
      notes: 'Overnight flight with 2x23kg checked luggage.',
      sort_order: 0,
      segments: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
          booking_id: '99999999-9999-4999-8999-999999999901',
          segment_order: 0,
          carrier: 'Pacific Air',
          flight_or_service_number: 'PA 104',
          origin_label: 'Harbor City',
          origin_code: 'AKL',
          destination_label: 'Island Coast',
          destination_code: 'HND',
          departure_local: '2027-01-12T22:15:00',
          departure_tz: 'Pacific/Auckland',
          arrival_local: '2027-01-13T05:30:00',
          arrival_tz: 'Asia/Tokyo',
          departure_utc: '2027-01-12T09:15:00Z',
          arrival_utc: '2027-01-12T20:30:00Z',
          seat_or_cabin: '14A',
          terminal_gate: 'Intl Gate 8',
          notes: null,
          day_offset: 1,
          projected_arrival_date: '2027-01-13',
          created_at: '2027-01-01T00:00:00Z',
          updated_at: '2027-01-01T00:00:00Z',
        },
      ],
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
    {
      id: '99999999-9999-4999-8999-999999999902',
      trip_id: trip.id,
      booking_type: 'lodging',
      status: 'confirmed',
      title: 'Harbour View Hotel Stay',
      provider: 'Harbour View Hotel',
      confirmation_code: 'HVH402',
      quoted_cost: '620.00',
      quoted_currency: 'NZD',
      source_reference: null,
      source_email_message_id: null,
      notes: 'Harbor view twin room, breakfast included.',
      sort_order: 1,
      segments: [],
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
    ...(opts.seedInbound
      ? [
          {
            id: '99999999-9999-4999-8999-999999999903',
            trip_id: trip.id,
            booking_type: 'transport',
            status: 'draft',
            title: 'Harbor Ferry Auto-Matched Draft',
            provider: 'Bluebridge Ferry',
            confirmation_code: 'DRFT88',
            quoted_cost: '185.00',
            quoted_currency: 'NZD',
            source_reference: 'iris-email-300',
            source_email_message_id: '<iris-draft@ferry.example>',
            raw_email_payload: {
              from_address: 'Bluebridge <bookings@bluebridge.example>',
              subject: 'Ferry Confirmation DRFT88',
              excerpt: 'Departing 12 Jan 2027 from Wellington.',
            },
            notes: 'From: bookings@bluebridge.example',
            sort_order: 2,
            segments: [],
            created_at: '2027-01-01T00:00:00Z',
            updated_at: '2027-01-01T00:00:00Z',
          },
        ]
      : []),
  ]

  const unassignedBookings: Array<Record<string, unknown>> = opts.seedInbound
    ? [
        {
          id: '77777777-1111-4111-8111-111111111101',
          trip_id: null,
          booking_type: 'lodging',
          status: 'draft',
          title: 'Harbour Lodge Voucher',
          provider: 'Harbour Lodge',
          confirmation_code: 'IR7742',
          quoted_cost: '420.50',
          quoted_currency: 'SGD',
          source_reference: 'iris-email-202',
          source_email_message_id: '<msg-202@hotel.example>',
          raw_email_payload: {
            from_address: 'Harbour Lodge <reservations@harbourlodge.example>',
            subject: 'Fwd: Harbour Lodge Voucher',
            excerpt: 'Check-in 2027-09-10 for Alex Tan. Total SGD 420.50.',
          },
          notes: 'Skipped oversized attachments (>15 MB): brochure-huge.pdf',
          sort_order: 0,
          segments: [],
          attachments: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb09',
              trip_id: null,
              booking_id: '77777777-1111-4111-8111-111111111101',
              filename: 'hotel-voucher.pdf',
              mime_type: 'application/pdf',
              size_bytes: pdfBuffer.length,
              sha256: 'unassignedpdfsha256',
              extracted_text: 'Harbour Lodge IR7742',
              created_at: '2027-01-01T00:00:00Z',
            },
          ],
          created_at: '2027-01-01T00:00:00Z',
          updated_at: '2027-01-01T00:00:00Z',
        },
        {
          id: '77777777-1111-4111-8111-111111111102',
          trip_id: null,
          booking_type: 'activity',
          status: 'draft',
          title: 'Observatory Entry Pass',
          provider: 'Skyline Tours',
          confirmation_code: 'SKY331',
          quoted_cost: '65.00',
          quoted_currency: 'NZD',
          source_reference: 'iris-email-203',
          source_email_message_id: '<msg-203@tours.example>',
          raw_email_payload: {
            from_address: 'Skyline Tours <tickets@skylinetours.example>',
            subject: 'Observatory Entry Pass',
            excerpt: 'Admission ticket for Alex Tan.',
          },
          notes: null,
          sort_order: 1,
          segments: [],
          attachments: [],
          created_at: '2027-01-01T00:00:00Z',
          updated_at: '2027-01-01T00:00:00Z',
        },
      ]
    : []

  const attachments = [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      trip_id: trip.id,
      booking_id: bookings[0].id,
      filename: 'boarding-pass.pdf',
      mime_type: 'application/pdf',
      size_bytes: pdfBuffer.length,
      sha256: 'syntheticsha256',
      extracted_text: 'Pacific Air Boarding Pass - ODYS99',
      created_at: '2027-01-01T00:00:00Z',
    },
  ]

  const routeEstimates = [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      trip_id: trip.id,
      day_id: days[0].id,
      from_place_id: places[0].id,
      to_place_id: places[1].id,
      travel_mode: 'walk',
      source: 'osrm',
      distance_meters: 680,
      duration_minutes: 9,
      geometry_geojson: {
        type: 'LineString',
        coordinates: [
          [174.7662, -36.8426],
          [174.7638, -36.8435],
          [174.7615, -36.8442],
        ],
      },
      manual_override: false,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
  ]

  const checklists = [
    {
      id: '55555555-5555-4555-8555-555555555501',
      trip_id: trip.id,
      title: 'Carry-on Essentials',
      list_type: 'packing',
      sort_order: 0,
      items: [
        {
          id: '66666666-6666-4666-8666-666666666601',
          checklist_id: '55555555-5555-4555-8555-555555555501',
          leg_id: legs[0].id,
          label: 'Passport & rail pass',
          is_completed: false,
          due_date: null,
          note: null,
          sort_order: 0,
          created_at: '2027-01-01T00:00:00Z',
          updated_at: '2027-01-01T00:00:00Z',
        },
      ],
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
  ]

  const notes = [
    {
      id: '77777777-7777-4777-8777-777777777701',
      trip_id: trip.id,
      leg_id: legs[1].id,
      day_id: null,
      title: 'Station Locker Memo',
      body: 'Alex Tan keeps spare pass inside zippered pouch.',
      is_private: true,
      sort_order: 0,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
  ]

  const mapPacks = [
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
      trip_id: trip.id,
      leg_id: legs[0].id,
      label: 'Harbor City Offline Map',
      status: 'ready',
      bbox_west: 174.0,
      bbox_south: -37.0,
      bbox_east: 175.0,
      bbox_north: -36.0,
      max_zoom: 12,
      filename: 'harbor-city.pmtiles',
      size_bytes: pmtilesBuffer.length,
      sha256: 'syntheticpmtilessha256',
      error_message: null,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
    },
  ]

  const shareTokens: Array<Record<string, unknown>> = [
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01',
      trip_id: trip.id,
      token: 'tok-companion-demo',
      label: 'Companion Family Link',
      include_pnrs: false,
      include_attachments: false,
      include_costs: false,
      include_checklists: false,
      include_private_notes: false,
      expires_at: null,
      revoked_at: null,
      created_at: '2027-01-01T00:00:00Z',
      updated_at: '2027-01-01T00:00:00Z',
      is_active: true,
    },
  ]

  await page.route('https://tiles.openfreemap.org/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0f1c2e' } }],
      }),
    })
  })

  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/api/, '')
    onApiRequest?.(path)

    if (path === '/share/tok-companion-demo' && req.method() === 'GET') {
      const {
        immich_album_id: _i,
        vault_note_path: _v,
        chronos_sync_enabled: _cs,
        chronos_overlay_mode: _co,
        ...sharedTripBase
      } = trip
      await route.fulfill({
        json: {
          visibility: {
            include_pnrs: false,
            include_attachments: false,
            include_costs: false,
            include_checklists: false,
            include_private_notes: false,
          },
          trip: { ...sharedTripBase, budget_nzd: null },
          legs,
          days,
          itinerary_items: items,
          checklists: [],
          travel_notes: [],
          bookings: bookings
            .filter((b) => b.status !== 'draft')
            .map(({ source_email_message_id: _s, ...b }) => ({
              ...b,
              confirmation_code: null,
              quoted_cost: null,
              quoted_currency: null,
              source_reference: null,
            })),
          attachments: [],
          places,
          route_estimates: routeEstimates,
        },
      })
      return
    }
    if (path === `/trips/${trip.id}/share-tokens` && req.method() === 'GET') {
      await route.fulfill({ json: shareTokens })
      return
    }
    if (path === `/trips/${trip.id}/share-tokens` && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      const created = {
        id: `eeeeeeee-eeee-4eee-8eee-${Date.now().toString().slice(-12)}`,
        trip_id: trip.id,
        token: `tok-${Date.now().toString().slice(-6)}`,
        label: (body.label as string | null) ?? null,
        include_pnrs: Boolean(body.include_pnrs),
        include_attachments: Boolean(body.include_attachments),
        include_costs: Boolean(body.include_costs),
        include_checklists: Boolean(body.include_checklists),
        include_private_notes: Boolean(body.include_private_notes),
        expires_at: (body.expires_at as string | null) ?? null,
        revoked_at: null,
        created_at: '2027-01-01T00:00:00Z',
        updated_at: '2027-01-01T00:00:00Z',
        is_active: true,
      }
      shareTokens.unshift(created)
      await route.fulfill({ status: 201, json: created })
      return
    }
    const shareMatch = path.match(/^\/trips\/[^/]+\/share-tokens\/([^/]+)(\/(rotate|revoke))?$/)
    if (shareMatch) {
      const targetId = shareMatch[1]
      const action = shareMatch[3]
      const target = shareTokens.find((t) => t.id === targetId)
      if (!target) {
        await route.fulfill({ status: 404, json: { detail: 'Share token not found' } })
        return
      }
      if (req.method() === 'PATCH') {
        Object.assign(target, req.postDataJSON() as Record<string, unknown>)
        await route.fulfill({ json: target })
        return
      }
      if (req.method() === 'POST' && action === 'rotate') {
        target.is_active = false
        target.revoked_at = '2027-01-02T00:00:00Z'
        const rotated = { ...target, id: `${targetId}-rot`, token: 'tok-rotated-demo', is_active: true, revoked_at: null }
        shareTokens.unshift(rotated)
        await route.fulfill({ json: rotated })
        return
      }
      if (req.method() === 'POST' && action === 'revoke') {
        target.is_active = false
        target.revoked_at = '2027-01-02T00:00:00Z'
        await route.fulfill({ json: target })
        return
      }
      if (req.method() === 'DELETE') {
        const idx = shareTokens.findIndex((t) => t.id === targetId)
        if (idx >= 0) shareTokens.splice(idx, 1)
        await route.fulfill({ status: 204, body: '' })
        return
      }
    }

    if (path === '/trips' && req.method() === 'GET') {
      await route.fulfill({ json: [trip] })
      return
    }
    if (path === `/trips/${trip.id}` && req.method() === 'PATCH') {
      const body = req.postDataJSON() as Record<string, unknown>
      if ('budget_nzd' in body) {
        trip.budget_nzd = body.budget_nzd === null ? null : String(body.budget_nzd)
      }
      if ('immich_album_id' in body) {
        trip.immich_album_id = body.immich_album_id === null ? null : String(body.immich_album_id)
      }
      if ('vault_note_path' in body) {
        trip.vault_note_path = body.vault_note_path === null ? null : String(body.vault_note_path)
      }
      await route.fulfill({ json: trip })
      return
    }
    if (path === `/trips/${trip.id}/photos` && req.method() === 'GET') {
      if (photosMode === 'offline') {
        await route.fulfill({
          json: {
            trip_id: trip.id,
            status: 'offline',
            source: trip.immich_album_id ? 'album' : 'date_range',
            message: 'Immich offline (Muspelheim asleep)',
            total_photos: 0,
            days: [],
            ungrouped_photos: [],
          },
        })
        return
      }
      if (photosMode === 'available') {
        await route.fulfill({
          json: {
            trip_id: trip.id,
            status: 'available',
            source: trip.immich_album_id ? 'album' : 'date_range',
            message: null,
            total_photos: 2,
            days: [
              {
                day_id: days[0].id,
                date: days[0].date,
                photos: [
                  {
                    asset_id: 'immich-asset-1',
                    original_filename: 'harbor-ferry.png',
                    captured_at: '2027-01-12T10:00:00Z',
                    local_date: '2027-01-12',
                    thumbnail_url: `/api/trips/${trip.id}/photos/immich-asset-1/thumbnail`,
                    web_url: 'https://photos.example.test/photos/immich-asset-1',
                    thumbhash: null,
                  },
                  {
                    asset_id: 'immich-asset-2',
                    original_filename: 'quay-lunch.png',
                    captured_at: '2027-01-12T13:15:00Z',
                    local_date: '2027-01-12',
                    thumbnail_url: `/api/trips/${trip.id}/photos/immich-asset-2/thumbnail`,
                    web_url: 'https://photos.example.test/photos/immich-asset-2',
                    thumbhash: null,
                  },
                ],
              },
            ],
            ungrouped_photos: [],
          },
        })
        return
      }
      await route.fulfill({
        json: {
          trip_id: trip.id,
          status: 'available',
          source: 'date_range',
          message: null,
          total_photos: 0,
          days: [],
          ungrouped_photos: [],
        },
      })
      return
    }
    if (/^\/trips\/[^/]+\/photos\/[^/]+\/thumbnail$/.test(path) && req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' },
        body: pngBuffer,
      })
      return
    }
    if (path === `/trips/${trip.id}/export/markdown` && req.method() === 'GET') {
      const vaultFrontmatter = trip.vault_note_path ? `vault_note_path: "${trip.vault_note_path}"\n` : ''
      const md = `---\ntype: trip-snapshot\ntrip_slug: ${trip.slug}\n${vaultFrontmatter}---\n# ${trip.title}\n\n## Day-by-Day Itinerary\n`
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${trip.slug}.md"`,
        },
        body: md,
      })
      return
    }
    if (/^\/trips\/[^/]+\/budget$/.test(path) && req.method() === 'GET') {
      await route.fulfill({
        json: {
          trip_id: trip.id,
          trip_slug: trip.slug,
          plutus_tag: `trip:${trip.slug}`,
          budget_nzd: trip.budget_nzd,
          planned_nzd: '2600.50',
          actual_settled_nzd: '2150.40',
          remaining_budget_nzd: '2049.60',
          variance_nzd: '-450.10',
          plutus_available: true,
          plutus_error: null,
          midas_url: `https://midas.example.test/?tag=trip:${trip.slug}`,
          missing_fx_currencies: [],
          fx_rates: {
            SGD: { rate: '1.2500', rate_date: '2027-01-10', source: 'plutus' },
            PHP: { rate: '0.0300', rate_date: '2027-01-10', source: 'plutus' },
          },
          planned_bookings: [
            {
              booking_id: bookings[0].id,
              title: 'Pacific Air AKL to HND',
              booking_type: 'flight',
              status: 'confirmed',
              quoted_cost: '1525.50',
              quoted_currency: 'NZD',
              fx_rate: '1.0',
              nzd_amount: '1525.50',
            },
            {
              booking_id: bookings[1].id,
              title: 'Harbour View Hotel Stay',
              booking_type: 'lodging',
              status: 'confirmed',
              quoted_cost: '500.00',
              quoted_currency: 'SGD',
              fx_rate: '1.2500',
              nzd_amount: '625.00',
            },
            {
              booking_id: '99999999-9999-4999-8999-999999999903',
              title: 'Island Express Ferry',
              booking_type: 'transport',
              status: 'pending',
              quoted_cost: '15000.00',
              quoted_currency: 'PHP',
              fx_rate: '0.0300',
              nzd_amount: '450.00',
            },
          ],
          category_breakdown: [
            { category: 'Transport', total_spend_nzd: '1525.40', transaction_count: 2, percentage: '70.9' },
            { category: 'Lodging', total_spend_nzd: '625.00', transaction_count: 1, percentage: '29.1' },
          ],
          transactions: [
            {
              id: 501,
              transaction_date: '2027-01-12',
              account_name: 'Wise Travel',
              amount: '500.00',
              currency: 'SGD',
              exchange_rate: '1.2500',
              nzd_amount: '625.00',
              merchant: 'Harbour View SG',
              category: 'Lodging',
              raw_description: 'HARBOUR VIEW SG',
              tags: [`trip:${trip.slug}`],
            },
          ],
        },
      })
      return
    }
    if (path === `/trips/${trip.id}/chronos/preview` && req.method() === 'GET') {
      await route.fulfill({
        json: {
          trip_id: trip.id,
          trip_slug: trip.slug,
          eligible: true,
          ineligible_reason: null,
          sync_enabled: trip.chronos_sync_enabled,
          overlay_mode: trip.chronos_overlay_mode,
          confirmed_segment_count: 1,
          synced_item_count: items.filter((i) => i.sync_to_chronos).length,
          anchors: [
            {
              external_ref: `odysseus:${trip.slug}:segment:${bookings[0].segments[0].id}`,
              source_kind: 'booking_segment',
              source_id: bookings[0].segments[0].id,
              title: 'Pacific Air AKL to HND: AKL to HND',
              target_date: '2027-01-13',
              start_minute: 480,
              end_minute: 1125,
              nudge_mode: 'boundary',
              urgent_quiet_bypass: true,
              notes: 'Departs 2027-01-13 08:00 (Pacific/Auckland) | Confirmation: ODYS99',
            },
          ],
        },
      })
      return
    }
    if (path === `/trips/${trip.id}/chronos/sync` && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      if (typeof body.enabled === 'boolean') trip.chronos_sync_enabled = body.enabled
      if (typeof body.overlay_mode === 'string') trip.chronos_overlay_mode = body.overlay_mode
      await route.fulfill({
        json: {
          trip_id: trip.id,
          trip_slug: trip.slug,
          sync_enabled: trip.chronos_sync_enabled,
          overlay_mode: trip.chronos_overlay_mode,
          overlay_active: trip.chronos_sync_enabled,
          upserted_count: trip.chronos_sync_enabled ? 1 : 0,
          deleted_count: 0,
          anchors: [],
        },
      })
      return
    }
    if (path === `/trips/${trip.id}/workspace` && req.method() === 'GET') {
      await route.fulfill({
        json: {
          trip,
          legs,
          days,
          itinerary_items: items,
          checklists,
          travel_notes: notes,
          bookings,
          attachments,
          places,
          route_estimates: routeEstimates,
          map_packs: mapPacks,
        },
      })
      return
    }
    if (path === `/trips/${trip.id}/mappacks` && req.method() === 'GET') {
      await route.fulfill({ json: mapPacks })
      return
    }
    if (path === `/trips/${trip.id}/mappacks` && req.method() === 'POST') {
      await route.fulfill({ status: 201, json: mapPacks[0] })
      return
    }
    if (path === `/trips/${trip.id}/mappacks/${mapPacks[0].id}/file` && req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          ETag: `"${mapPacks[0].sha256}"`,
          'Accept-Ranges': 'bytes',
        },
        body: pmtilesBuffer,
      })
      return
    }
    if (path === `/trips/${trip.id}/offline-bundle` && req.method() === 'GET') {
      await route.fulfill({
        json: {
          bundle_version: 1,
          generated_at: '2027-01-01T00:00:00Z',
          workspace_sha256: 'syntheticworkspacesha256',
          workspace: {
            trip,
            legs,
            days,
            itinerary_items: items,
            checklists,
            travel_notes: notes,
            bookings,
            attachments,
            places,
            route_estimates: routeEstimates,
            map_packs: mapPacks,
          },
          attachments: [
            {
              id: attachments[0].id,
              booking_id: attachments[0].booking_id,
              filename: attachments[0].filename,
              mime_type: attachments[0].mime_type,
              size_bytes: attachments[0].size_bytes,
              sha256: attachments[0].sha256,
              content_url: `/api/trips/${trip.id}/attachments/${attachments[0].id}/content`,
            },
          ],
          map_packs: [
            {
              id: mapPacks[0].id,
              leg_id: mapPacks[0].leg_id,
              label: mapPacks[0].label,
              filename: mapPacks[0].filename,
              size_bytes: mapPacks[0].size_bytes,
              sha256: mapPacks[0].sha256,
              max_zoom: mapPacks[0].max_zoom,
              bbox_west: mapPacks[0].bbox_west,
              bbox_south: mapPacks[0].bbox_south,
              bbox_east: mapPacks[0].bbox_east,
              bbox_north: mapPacks[0].bbox_north,
              file_url: `/api/trips/${trip.id}/mappacks/${mapPacks[0].id}/file`,
            },
          ],
        },
      })
      return
    }
    if (path === `/trips/${trip.id}/attachments/${attachments[0].id}/content` && req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="boarding-pass.pdf"',
          'Accept-Ranges': 'bytes',
        },
        body: pdfBuffer,
      })
      return
    }
    if (path === `/trips/${trip.id}/places/search` && req.method() === 'GET') {
      await route.fulfill({
        json: [
          {
            name: 'Skyline Ferry Terminal',
            latitude: -36.841,
            longitude: 174.765,
            address: '10 Ferry Wharf',
            osm_id: 'node/777',
            category_hint: 'transit',
          },
        ],
      })
      return
    }
    if (path === `/trips/${trip.id}/places/resolve-url` && req.method() === 'POST') {
      await route.fulfill({
        status: 422,
        json: { detail: 'Share URL has no embedded coordinates' },
      })
      return
    }
    if (path === `/trips/${trip.id}/places` && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      const created = {
        id: `88888888-8888-4888-8888-${Date.now().toString().slice(-12)}`,
        trip_id: trip.id,
        name: String(body.name ?? 'Custom Pin'),
        category: String(body.category ?? 'other'),
        latitude: Number(body.latitude ?? -36.84),
        longitude: Number(body.longitude ?? 174.76),
        address: (body.address as string | null) ?? null,
        notes: (body.notes as string | null) ?? null,
        external_map_url: (body.external_map_url as string | null) ?? null,
        google_place_id: (body.google_place_id as string | null) ?? null,
        osm_id: (body.osm_id as string | null) ?? null,
        is_backlog: Boolean(body.is_backlog),
        created_at: '2027-01-01T00:00:00Z',
        updated_at: '2027-01-01T00:00:00Z',
      }
      places.push(created)
      await route.fulfill({ status: 201, json: created })
      return
    }
    if (path === `/trips/${trip.id}/itinerary-items` && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      const created = {
        id: `44444444-4444-4444-8444-${Date.now().toString().slice(-12)}`,
        trip_id: trip.id,
        day_id: body.day_id ?? null,
        title: String(body.title ?? 'New Item'),
        category: String(body.category ?? 'activity'),
        status: String(body.status ?? 'planned'),
        start_local: body.start_local ?? null,
        start_tz: body.start_tz ?? null,
        end_local: null,
        end_tz: null,
        start_utc: null,
        end_utc: null,
        place_label: body.place_label ?? null,
        place_id: body.place_id ?? null,
        sync_to_chronos: false,
        sort_order: items.length,
        notes: null,
        created_at: '2027-01-01T00:00:00Z',
        updated_at: '2027-01-01T00:00:00Z',
      }
      items.push(created as (typeof items)[number])
      await route.fulfill({ status: 201, json: created })
      return
    }
    if (path === '/bookings/unassigned' && req.method() === 'GET') {
      await route.fulfill({ json: unassignedBookings })
      return
    }
    const unassignedContentMatch = path.match(/^\/bookings\/unassigned\/([^/]+)\/attachments\/([^/]+)\/content$/)
    if (unassignedContentMatch && req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="hotel-voucher.pdf"',
          'Accept-Ranges': 'bytes',
        },
        body: pdfBuffer,
      })
      return
    }
    const unassignedAssignMatch = path.match(/^\/bookings\/unassigned\/([^/]+)\/assign$/)
    if (unassignedAssignMatch && req.method() === 'POST') {
      const targetId = unassignedAssignMatch[1]
      const body = req.postDataJSON() as { trip_id: string; confirm?: boolean }
      const idx = unassignedBookings.findIndex((b) => b.id === targetId)
      if (idx === -1) {
        await route.fulfill({ status: 404, json: { detail: 'Booking not found' } })
        return
      }
      const [removed] = unassignedBookings.splice(idx, 1)
      const movedAttachments = (removed.attachments as Array<Record<string, unknown>>) ?? []
      const { attachments: _ignored, ...bookingFields } = removed
      const assigned = {
        ...bookingFields,
        trip_id: body.trip_id,
        status: body.confirm === false ? 'draft' : 'confirmed',
      }
      bookings.push(assigned as (typeof bookings)[number])
      for (const att of movedAttachments) {
        attachments.push({ ...(att as (typeof attachments)[number]), trip_id: body.trip_id })
      }
      await route.fulfill({ json: assigned })
      return
    }
    const unassignedDeleteMatch = path.match(/^\/bookings\/unassigned\/([^/]+)$/)
    if (unassignedDeleteMatch && req.method() === 'DELETE') {
      const targetId = unassignedDeleteMatch[1]
      const idx = unassignedBookings.findIndex((b) => b.id === targetId)
      if (idx >= 0) unassignedBookings.splice(idx, 1)
      await route.fulfill({ status: 204, body: '' })
      return
    }
    const confirmMatch = path.match(/^\/trips\/[^/]+\/bookings\/([^/]+)\/confirm$/)
    if (confirmMatch && req.method() === 'POST') {
      const target = bookings.find((b) => b.id === confirmMatch[1])
      if (!target) {
        await route.fulfill({ status: 404, json: { detail: 'Booking not found' } })
        return
      }
      target.status = 'confirmed'
      await route.fulfill({ json: target })
      return
    }
    await route.fulfill({ status: 200, json: {} })
  })
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  expect(overflow).toBe(false)
}

async function assertMinTouchHeight(locator: Locator, minPx = 44) {
  const box = await locator.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(minPx)
}

async function assertHeaderFitsViewport(page: Page) {
  const viewportWidth = page.viewportSize()?.width ?? 390
  const header = page.locator('header').first()
  const refreshBox = await header.getByTestId('refresh-button').boundingBox()
  expect(refreshBox).not.toBeNull()
  expect((refreshBox?.x ?? 0) + (refreshBox?.width ?? 0)).toBeLessThanOrEqual(viewportWidth)
  for (const name of ['Share trip', 'Save Offline', 'New Trip']) {
    const btn = header.getByRole('button', { name })
    const box = await btn.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewportWidth)
  }
}

const MOBILE_PLATFORMS = [
  {
    name: 'ios',
    captureLists: true,
    options: {
      viewport: devices['iPhone 14'].viewport,
      userAgent: devices['iPhone 14'].userAgent,
      deviceScaleFactor: devices['iPhone 14'].deviceScaleFactor,
      isMobile: devices['iPhone 14'].isMobile,
      hasTouch: devices['iPhone 14'].hasTouch,
    },
  },
  {
    name: 'android',
    captureLists: false,
    options: {
      viewport: devices['Pixel 7'].viewport,
      userAgent: devices['Pixel 7'].userAgent,
      deviceScaleFactor: devices['Pixel 7'].deviceScaleFactor,
      isMobile: devices['Pixel 7'].isMobile,
      hasTouch: devices['Pixel 7'].hasTouch,
    },
  },
]

test.describe('Desktop Visual Inspection - Wave 3 Bookings & MapLibre', () => {
  test('captures desktop 3-pane split, inline PDF canvas viewer, and triple-path place modal', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockOdysseusApi(page)
    await page.goto('/')

    const desktop = page.getByTestId('desktop-workspace')
    await expect(desktop).toBeVisible()
    await expect(desktop.getByRole('heading', { name: 'Pacific Explorer' })).toBeVisible()
    await expect(desktop.getByTestId('map-preview-panel')).toBeVisible()
    await expect(desktop.getByTestId('day-card-2027-01-13')).toContainText('Arrival: Pacific Air AKL to HND')
    await expect(desktop.getByText('ODYS99').first()).toBeVisible()
    await expect(desktop.getByText('680 m · 9 min · walk')).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.waitForTimeout(350)
    await page.screenshot({ path: 'screenshots/desktop/01-variant-a-split.png' })

    await desktop.getByRole('button', { name: 'View' }).first().click()
    const pdfModal = page.getByTestId('pdf-viewer-modal')
    await expect(pdfModal).toBeVisible()
    await expect(pdfModal.getByText('Page 1 / 1')).toBeVisible()
    await page.waitForTimeout(350)
    await page.screenshot({ path: 'screenshots/desktop/02-pdf-viewer.png' })

    await page.getByRole('button', { name: 'Close dialog' }).click()
    await expect(pdfModal).not.toBeVisible()

    await desktop.getByRole('button', { name: 'Add Place' }).click()
    await expect(page.getByRole('heading', { name: 'Add Trip Place' })).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'screenshots/desktop/03-place-modal.png' })
    await page.getByRole('button', { name: 'Close dialog' }).click()

    const header = page.locator('header').first()
    await header.getByRole('button', { name: 'Share trip' }).click()
    const shareModal = page.getByTestId('share-token-modal')
    await expect(shareModal).toBeVisible()
    await expect(shareModal.getByText('Companion Family Link')).toBeVisible()
    await expect(shareModal.getByLabel('Include PNRs & codes').first()).not.toBeChecked()
    await page.waitForTimeout(250)
    await page.screenshot({ path: 'screenshots/desktop/06-share-modal.png' })
    await page.getByRole('button', { name: 'Close dialog' }).click()

    await desktop.getByTestId('chronos-status-pill').click()
    const chronosModal = page.getByTestId('chronos-sync-modal')
    await expect(chronosModal).toBeVisible()
    await expect(chronosModal.getByText('Pacific Air AKL to HND: AKL to HND')).toBeVisible()
    await chronosModal.getByRole('button', { name: 'Sync to Chronos' }).click()
    await expect(chronosModal.getByText('Chronos Sync Complete')).toBeVisible()
    await page.waitForTimeout(250)
    await page.screenshot({ path: 'screenshots/desktop/09-chronos-sync-modal.png' })
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await expect(desktop.getByTestId('chronos-status-pill')).toContainText('Chronos: Active')

    await header.getByRole('button', { name: 'Save Offline' }).click()
    const syncModal = page.getByTestId('offline-sync-modal')
    await expect(syncModal).toBeVisible()
    const mappackCheckbox = syncModal.getByLabel('Include per-Leg .pmtiles MapPacks')
    await expect(mappackCheckbox).toBeChecked()
    await syncModal.getByRole('button', { name: 'Save Trip Offline' }).click()
    await expect(syncModal.getByText('Saved Offline')).toBeVisible()
    await expect(syncModal.getByText('2 files (1 docs, 1 maps)')).toBeVisible()
    await page.waitForTimeout(250)
    await page.screenshot({ path: 'screenshots/desktop/04-offline-sync-modal.png' })
    await page.getByRole('button', { name: 'Close dialog' }).click()

    const budgetSection = desktop.getByTestId('budget-section')
    await budgetSection.scrollIntoViewIfNeeded()
    await expect(budgetSection.getByTestId('budget-planned-card')).toContainText('NZD 2600.50')
    await expect(budgetSection.getByTestId('budget-actual-card')).toContainText('NZD 2150.40')
    await expect(budgetSection.getByRole('link', { name: /Open in Midas/i })).toHaveAttribute(
      'href',
      'https://midas.example.test/?tag=trip:pacific-explorer',
    )
    await expect(budgetSection).toContainText('SGD 500.00')
    await expect(budgetSection).toContainText('PHP 15000.00')
    await assertNoHorizontalOverflow(page)
    await page.waitForTimeout(250)
    await page.screenshot({ path: 'screenshots/desktop/08-budget.png' })

    await page.context().setOffline(true)
    await expect(page.getByText('Offline Read-Only')).toBeVisible()
    await expect(desktop.getByRole('button', { name: 'Add Activity' })).toBeDisabled()
    await expect(desktop.getByRole('button', { name: 'Add Booking' })).toBeDisabled()
    await expect(desktop.getByRole('button', { name: 'Add Place' })).toBeDisabled()
    await expect(desktop.getByText('Offline PMTiles')).toBeVisible()
    await expect(desktop.getByTestId('day-card-2027-01-13')).toContainText('Arrival: Pacific Air AKL to HND')

    await desktop.getByRole('button', { name: 'View' }).first().click()
    await expect(pdfModal).toBeVisible()
    await expect(pdfModal.getByText('Page 1 / 1')).toBeVisible()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await page.waitForTimeout(250)
    await page.screenshot({ path: 'screenshots/desktop/05-offline-readonly-split.png' })
  })

  test('captures unauthenticated /share/tok-companion-demo desktop companion split without /api/trips', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const apiPaths: string[] = []
    await mockOdysseusApi(page, (p) => apiPaths.push(p))
    await page.goto('/share/tok-companion-demo')

    const desktop = page.getByTestId('desktop-shared-workspace')
    await expect(desktop).toBeVisible()
    await expect(page.getByText('Shared Read-Only')).toBeVisible()
    await expect(desktop.getByRole('heading', { name: 'Pacific Explorer' })).toBeVisible()
    await expect(desktop.getByRole('heading', { name: 'Pacific Air AKL to HND' })).toBeVisible()
    await expect(desktop.getByText('ODYS99')).toHaveCount(0)
    await expect(desktop.getByText('Station Locker Memo')).toHaveCount(0)
    const header = page.locator('header').first()
    await expect(header.getByRole('button', { name: 'New Trip' })).toHaveCount(0)
    await expect(header.getByRole('button', { name: 'Share trip' })).toHaveCount(0)
    expect(apiPaths.some((p) => p.startsWith('/trips'))).toBe(false)
    await assertNoHorizontalOverflow(page)
    await page.waitForTimeout(350)
    await page.screenshot({ path: 'screenshots/desktop/07-share-companion.png' })
  })
})

for (const platform of MOBILE_PLATFORMS) {
  test.describe(`Visual Inspection - ${platform.name.toUpperCase()}`, () => {
    test.use({ ...platform.options })

    test(`captures mobile tabs, inline PDF viewer, and invariants on ${platform.name}`, async ({ page }) => {
      await mockOdysseusApi(page)
      await page.goto('/')

      const bottomNav = page.getByRole('navigation', { name: 'Main Mobile Navigation' })
      const mobile = page.getByTestId('mobile-workspace')
      await expect(bottomNav).toBeVisible()
      await expect(mobile).toBeVisible()
      await expect(mobile.getByTestId('day-card-2027-01-13')).toContainText('Arrival: Pacific Air AKL to HND')
      await assertNoHorizontalOverflow(page)
      await assertHeaderFitsViewport(page)
      await assertMinTouchHeight(mobile.getByRole('button', { name: 'Add Activity' }))
      await page.screenshot({ path: `screenshots/${platform.name}/01-itinerary.png`, fullPage: true })

      await mobile.getByTestId('chronos-status-pill').click()
      const chronosModal = page.getByTestId('chronos-sync-modal')
      await expect(chronosModal).toBeVisible()
      await expect(chronosModal.getByText('Pacific Air AKL to HND: AKL to HND')).toBeVisible()
      await assertMinTouchHeight(chronosModal.getByRole('button', { name: 'Sync to Chronos' }))
      await assertNoHorizontalOverflow(page)
      await page.waitForTimeout(250)
      await page.screenshot({ path: `screenshots/${platform.name}/09-chronos-sync-modal.png` })
      await page.getByRole('button', { name: 'Close dialog' }).click()

      await bottomNav.getByRole('button', { name: 'Map' }).click()
      await expect(mobile.getByTestId('map-preview-panel')).toBeVisible()
      await expect(mobile.getByText('680 m · 9 min · walk')).toBeVisible()
      await assertNoHorizontalOverflow(page)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `screenshots/${platform.name}/02-map.png` })

      await bottomNav.getByRole('button', { name: 'Bookings' }).click()
      await expect(mobile.getByText('Pacific Air AKL to HND')).toBeVisible()
      await assertNoHorizontalOverflow(page)
      await assertMinTouchHeight(mobile.getByRole('button', { name: 'Add Booking' }))
      await page.screenshot({ path: `screenshots/${platform.name}/03-bookings.png` })

      await mobile.getByRole('button', { name: 'View' }).first().click()
      const pdfModal = page.getByTestId('pdf-viewer-modal')
      await expect(pdfModal).toBeVisible()
      await expect(pdfModal.getByText('Page 1 / 1')).toBeVisible()
      await assertMinTouchHeight(pdfModal.getByRole('link', { name: 'Download' }))
      await page.waitForTimeout(300)
      await page.screenshot({ path: `screenshots/${platform.name}/04-pdf-viewer.png` })
      await page.getByRole('button', { name: 'Close dialog' }).click()

      if (platform.captureLists) {
        await bottomNav.getByRole('button', { name: 'Lists' }).click()
        await expect(mobile.getByText('Carry-on Essentials')).toBeVisible()
        await assertNoHorizontalOverflow(page)
        await page.screenshot({ path: `screenshots/${platform.name}/05-lists.png`, fullPage: true })
      }

      await bottomNav.getByRole('button', { name: 'Budget' }).click()
      const mobileBudget = mobile.getByTestId('budget-section')
      await expect(mobileBudget).toBeVisible()
      await expect(mobileBudget.getByTestId('budget-planned-card')).toContainText('NZD 2600.50')
      await expect(mobileBudget.getByTestId('budget-actual-card')).toContainText('NZD 2150.40')
      await expect(mobileBudget.getByRole('link', { name: /Open in Midas/i })).toHaveAttribute(
        'href',
        'https://midas.example.test/?tag=trip:pacific-explorer',
      )
      await assertMinTouchHeight(mobileBudget.getByRole('link', { name: /Open in Midas/i }))
      await assertMinTouchHeight(mobileBudget.getByRole('button', { name: 'Refresh' }))
      await assertMinTouchHeight(mobileBudget.getByRole('button', { name: 'Edit Budget' }))
      await assertNoHorizontalOverflow(page)
      await page.waitForTimeout(250)
      await page.screenshot({ path: `screenshots/${platform.name}/08-budget.png`, fullPage: true })

      await page.locator('header').first().getByRole('button', { name: 'Save Offline' }).click()
      const syncModal = page.getByTestId('offline-sync-modal')
      await expect(syncModal).toBeVisible()
      await syncModal.getByRole('button', { name: 'Save Trip Offline' }).click()
      await expect(syncModal.getByText('Saved Offline')).toBeVisible()
      await page.getByRole('button', { name: 'Close dialog' }).click()

      await page.context().setOffline(true)
      await bottomNav.getByRole('button', { name: 'Itinerary' }).click()
      await expect(page.getByText('Offline Read-Only')).toBeVisible()
      await expect(mobile.getByRole('button', { name: 'Add Activity' })).toBeDisabled()
      await assertNoHorizontalOverflow(page)
      await page.screenshot({ path: `screenshots/${platform.name}/06-offline-readonly.png` })

      await bottomNav.getByRole('button', { name: 'Map' }).click()
      await expect(mobile.getByText('Offline PMTiles')).toBeVisible()
      await assertNoHorizontalOverflow(page)
    })

    test(`captures /share/tok-companion-demo mobile companion view on ${platform.name}`, async ({ page }) => {
      const apiPaths: string[] = []
      await mockOdysseusApi(page, (p) => apiPaths.push(p))
      await page.goto('/share/tok-companion-demo')

      const bottomNav = page.getByRole('navigation', { name: 'Main Mobile Navigation' })
      const mobile = page.getByTestId('mobile-shared-workspace')
      await expect(bottomNav).toBeVisible()
      await expect(mobile).toBeVisible()
      await expect(bottomNav.getByRole('button', { name: 'Budget' })).toHaveCount(0)
      await assertMinTouchHeight(bottomNav.getByRole('button', { name: 'Itinerary' }))
      await assertNoHorizontalOverflow(page)
      expect(apiPaths.some((p) => p.startsWith('/trips'))).toBe(false)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `screenshots/${platform.name}/07-share-companion.png` })
    })
  })
}

test.describe('Ticket 10 - Inbound Email Bookings & Draft Review', () => {
  test('reviews unassigned Iris inbox, views PDF, assigns & confirms, and confirms trip draft on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockOdysseusApi(page, { seedInbound: true })
    await page.goto('/')

    const desktop = page.getByTestId('desktop-workspace')
    const inbox = desktop.getByTestId('inbound-bookings-inbox')
    await expect(inbox).toBeVisible()
    await expect(inbox).toContainText('Inbound Bookings Inbox (2)')
    await expect(inbox).toContainText('Harbour Lodge Voucher')
    await expect(inbox).toContainText('IR7742')

    await inbox.getByRole('button', { name: 'View' }).first().click()
    const pdfModal = page.getByTestId('pdf-viewer-modal')
    await expect(pdfModal).toBeVisible()
    await expect(pdfModal.getByText('Page 1 / 1')).toBeVisible()
    await page.getByRole('button', { name: 'Close dialog' }).click()

    await assertNoHorizontalOverflow(page)
    await page.waitForTimeout(250)
    await page.screenshot({ path: 'screenshots/desktop/10-inbound-inbox.png' })

    const firstCard = inbox.getByTestId('inbound-booking-card-77777777-1111-4111-8111-111111111101')
    await firstCard.getByRole('button', { name: 'Assign & Confirm' }).click()
    await expect(inbox).toContainText('Inbound Bookings Inbox (1)')
    await expect(desktop.getByTestId('booking-card-77777777-1111-4111-8111-111111111101')).toBeVisible()

    const secondCard = inbox.getByTestId('inbound-booking-card-77777777-1111-4111-8111-111111111102')
    await secondCard.getByRole('button', { name: 'Dismiss' }).click()
    await expect(inbox).toHaveCount(0)

    const draftCard = desktop.getByTestId('booking-card-99999999-9999-4999-8999-999999999903')
    await expect(draftCard).toContainText('From Iris')
    await expect(draftCard).toContainText('DRFT88')
    await draftCard.getByRole('button', { name: 'Confirm' }).click()
    await expect(draftCard.getByRole('button', { name: 'Confirm' })).toHaveCount(0)
    await expect(draftCard).toContainText('confirmed')
  })
})

for (const platform of MOBILE_PLATFORMS) {
  test.describe(`Ticket 10 Mobile - ${platform.name.toUpperCase()}`, () => {
    test.use({ ...platform.options })

    test(`reviews inbound inbox and confirms draft on ${platform.name}`, async ({ page }) => {
      await mockOdysseusApi(page, { seedInbound: true })
      await page.goto('/')

      const bottomNav = page.getByRole('navigation', { name: 'Main Mobile Navigation' })
      const mobile = page.getByTestId('mobile-workspace')
      await bottomNav.getByRole('button', { name: 'Bookings' }).click()

      const inbox = mobile.getByTestId('inbound-bookings-inbox')
      await expect(inbox).toBeVisible()
      await assertMinTouchHeight(inbox.getByRole('button', { name: 'Assign & Confirm' }).first())
      await assertMinTouchHeight(inbox.getByRole('button', { name: 'Dismiss' }).first())
      await assertNoHorizontalOverflow(page)
      await page.waitForTimeout(250)
      await page.screenshot({ path: `screenshots/${platform.name}/10-inbound-inbox.png`, fullPage: true })

      await inbox
        .getByTestId('inbound-booking-card-77777777-1111-4111-8111-111111111101')
        .getByRole('button', { name: 'Assign & Confirm' })
        .click()
      await expect(mobile.getByTestId('booking-card-77777777-1111-4111-8111-111111111101')).toBeVisible()

      const draftCard = mobile.getByTestId('booking-card-99999999-9999-4999-8999-999999999903')
      await assertMinTouchHeight(draftCard.getByRole('button', { name: 'Confirm' }))
      await draftCard.getByRole('button', { name: 'Confirm' }).click()
      await expect(draftCard.getByRole('button', { name: 'Confirm' })).toHaveCount(0)
      await assertNoHorizontalOverflow(page)
    })
  })
}

test.describe('Ticket 11 - Immich Photo Strip & Markdown Export', () => {
  test('renders per-Day Immich photo strip, saves Trip Links, exports Markdown, and renders offline banner on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockOdysseusApi(page, { photosMode: 'available' })
    await page.goto('/')

    const desktop = page.getByTestId('desktop-workspace')
    const strip = desktop.getByTestId('day-photo-strip').first()
    await expect(strip).toBeVisible()
    await expect(strip.locator('img')).toHaveCount(2)
    await expect(strip.locator('a').first()).toHaveAttribute('href', 'https://photos.example.test/photos/immich-asset-1')

    await desktop.getByRole('button', { name: 'Trip Links' }).click()
    const modal = page.getByTestId('trip-settings-modal')
    await expect(modal).toBeVisible()
    await modal.getByLabel('Immich Album ID').fill('album-pacific-2027')
    await modal.getByLabel('Obsidian Vault Note Path').fill('second-brain/Areas/40-Leisure/Pacific Explorer.md')
    await modal.getByRole('button', { name: 'Save Links' }).click()
    await expect(modal).toHaveCount(0)
    await expect(desktop.getByTestId('vault-note-path-pill')).toContainText('second-brain/Areas/40-Leisure/Pacific Explorer.md')

    const downloadPromise = page.waitForEvent('download')
    await desktop.getByRole('button', { name: 'Download .md' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('pacific-explorer.md')

    await assertNoHorizontalOverflow(page)
    await page.waitForTimeout(250)
    await page.screenshot({ path: 'screenshots/desktop/11-immich-photos-export.png' })

    // Verify degraded Immich offline banner
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockOdysseusApi(page, { photosMode: 'offline' })
    await page.goto('/')
    await expect(desktop.getByTestId('immich-offline-banner')).toContainText('Immich offline (Muspelheim asleep)')
  })
})

for (const platform of MOBILE_PLATFORMS) {
  test.describe(`Ticket 11 Mobile - ${platform.name.toUpperCase()}`, () => {
    test.use({ ...platform.options })

    test(`renders Immich photo strip, Trip Links modal, and offline banner on ${platform.name}`, async ({ page }) => {
      await mockOdysseusApi(page, { photosMode: 'available' })
      await page.goto('/')

      const mobile = page.getByTestId('mobile-workspace')
      const strip = mobile.getByTestId('day-photo-strip').first()
      await expect(strip).toBeVisible()
      await expect(strip.locator('img')).toHaveCount(2)

      await assertMinTouchHeight(mobile.getByRole('button', { name: 'Copy Markdown' }))
      await assertMinTouchHeight(mobile.getByRole('button', { name: 'Download .md' }))
      await assertMinTouchHeight(mobile.getByRole('button', { name: 'Trip Links' }))

      await mobile.getByRole('button', { name: 'Trip Links' }).click()
      const modal = page.getByTestId('trip-settings-modal')
      await expect(modal).toBeVisible()
      await assertMinTouchHeight(modal.getByRole('button', { name: 'Save Links' }))
      await modal.getByRole('button', { name: 'Cancel' }).click()

      await assertNoHorizontalOverflow(page)
      await page.waitForTimeout(250)
      await page.screenshot({ path: `screenshots/${platform.name}/11-immich-photos-export.png` })

      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await mockOdysseusApi(page, { photosMode: 'offline' })
      await page.goto('/')
      await expect(mobile.getByTestId('immich-offline-banner')).toContainText('Immich offline (Muspelheim asleep)')
      await assertMinTouchHeight(mobile.getByTestId('immich-offline-banner').getByRole('button', { name: 'Retry' }))
    })
  })
}
