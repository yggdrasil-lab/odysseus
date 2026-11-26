import { devices, expect, test, type Locator, type Page } from '@playwright/test'

async function mockOdysseusApi(page: Page) {
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
    summary: 'Cross-timezone coastal itinerary with overlapping leg chapters.',
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
      sync_to_chronos: false,
      sort_order: 1,
      notes: null,
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
        },
      })
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
    captureBookings: true,
    modalIndex: '05-modal.png',
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
    captureBookings: false,
    modalIndex: '04-modal.png',
    options: {
      viewport: devices['Pixel 7'].viewport,
      userAgent: devices['Pixel 7'].userAgent,
      deviceScaleFactor: devices['Pixel 7'].deviceScaleFactor,
      isMobile: devices['Pixel 7'].isMobile,
      hasTouch: devices['Pixel 7'].hasTouch,
    },
  },
]

test.describe('Desktop Visual Inspection - Variant A Split', () => {
  test('captures desktop 3-pane split and open modal', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockOdysseusApi(page)
    await page.goto('/')

    const desktop = page.getByTestId('desktop-workspace')
    await expect(desktop).toBeVisible()
    await expect(desktop.getByRole('heading', { name: 'Pacific Explorer' })).toBeVisible()
    await expect(desktop.getByLabel('Trip Section Navigation')).toBeVisible()
    await expect(desktop.getByTestId('map-preview-panel')).toBeVisible()
    await expect(desktop.getByTestId('day-card-2027-01-12')).toContainText('Harbor City')
    await expect(desktop.getByTestId('day-card-2027-01-12')).toContainText('Island Coast')
    await expect(desktop.getByText(/09:15 - 10:45/).first()).toBeVisible()
    await expect(desktop.getByText('Station Locker Memo')).toBeVisible()
    await expect(desktop.getByText('Private', { exact: true })).toBeVisible()
    await assertNoHorizontalOverflow(page)

    await page.screenshot({ path: 'screenshots/desktop/01-variant-a-split.png' })

    await desktop.getByTestId('map-scope-leg').click()
    await expect(desktop.getByLabel('Scope map to leg')).toBeVisible()

    await desktop.getByRole('button', { name: 'Add Activity' }).click()
    await expect(page.getByRole('heading', { name: 'Add Itinerary Item' })).toBeVisible()
    await page.waitForTimeout(350)
    await assertMinTouchHeight(page.getByLabel(/Activity Title/))
    await page.screenshot({ path: 'screenshots/desktop/02-modal.png' })

    await page.getByLabel(/Activity Title/).fill('Sunset Pier Walk')
    await page.getByRole('button', { name: 'Save Item' }).click()
    await expect(desktop.getByText('Sunset Pier Walk').first()).toBeVisible()
  })
})

for (const platform of MOBILE_PLATFORMS) {
  test.describe(`Visual Inspection - ${platform.name.toUpperCase()}`, () => {
    test.use({ ...platform.options })

    test(`captures mobile tabs, modal, and invariants on ${platform.name}`, async ({ page }) => {
      await mockOdysseusApi(page)
      await page.goto('/')

      const bottomNav = page.getByRole('navigation', { name: 'Main Mobile Navigation' })
      const mobile = page.getByTestId('mobile-workspace')
      await expect(bottomNav).toBeVisible()
      await expect(mobile).toBeVisible()
      await expect(mobile.getByRole('heading', { name: 'Pacific Explorer' })).toBeVisible()
      await assertNoHorizontalOverflow(page)
      await assertMinTouchHeight(mobile.getByRole('button', { name: 'Add Activity' }))
      await page.screenshot({
        path: `screenshots/${platform.name}/01-itinerary.png`,
        fullPage: true,
      })

      await bottomNav.getByRole('button', { name: 'Map' }).click()
      await expect(mobile.getByTestId('map-preview-panel')).toBeVisible()
      await assertNoHorizontalOverflow(page)
      await page.screenshot({ path: `screenshots/${platform.name}/02-map.png` })

      await bottomNav.getByRole('button', { name: 'Lists' }).click()
      await expect(mobile.getByText('Carry-on Essentials')).toBeVisible()
      await expect(mobile.getByText('Station Locker Memo')).toBeVisible()
      await assertNoHorizontalOverflow(page)
      await page.screenshot({
        path: `screenshots/${platform.name}/03-lists.png`,
        fullPage: true,
      })

      if (platform.captureBookings) {
        await bottomNav.getByRole('button', { name: 'Bookings' }).click()
        await expect(mobile.getByText('Bookings & Confirmations')).toBeVisible()
        await assertNoHorizontalOverflow(page)
        await page.screenshot({ path: `screenshots/${platform.name}/04-bookings.png` })
      }

      await bottomNav.getByRole('button', { name: 'Itinerary' }).click()
      await mobile.getByRole('button', { name: 'Add Activity' }).click()
      await expect(page.getByRole('heading', { name: 'Add Itinerary Item' })).toBeVisible()
      await page.waitForTimeout(350)
      await assertMinTouchHeight(page.getByLabel(/Activity Title/))
      await assertMinTouchHeight(page.getByRole('button', { name: 'Save Item' }))
      await page.screenshot({ path: `screenshots/${platform.name}/${platform.modalIndex}` })
    })
  })
}
