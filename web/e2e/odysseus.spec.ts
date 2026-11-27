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

async function mockOdysseusApi(page: Page) {
  const pdfBuffer = buildSyntheticPdfBuffer()
  const pmtilesBuffer = buildMinimalPmtilesBuffer()

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
  ]

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

    if (path === '/trips' && req.method() === 'GET') {
      await route.fulfill({ json: [trip] })
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

    await page.getByRole('button', { name: 'Save Offline' }).click()
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
      await assertMinTouchHeight(mobile.getByRole('button', { name: 'Add Activity' }))
      await page.screenshot({ path: `screenshots/${platform.name}/01-itinerary.png`, fullPage: true })

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

      await page.getByRole('button', { name: 'Offline' }).click()
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
  })
}
