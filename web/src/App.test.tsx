import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App bootstrap shell', () => {
  it('displays API health payload when /api/health succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', service: 'odysseus-api' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Odysseus' })).toBeInTheDocument()
    expect(
      await screen.findByText('API connected: odysseus-api (ok)'),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.any(Object))
  })

  it('displays explicit error alert when /api/health fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'API health check failed (503)',
    )
  })
})
