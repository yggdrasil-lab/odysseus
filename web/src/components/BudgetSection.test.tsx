import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OdysseusApiError } from '../api/client'
import { useTripBudget } from '../hooks/useTripBudget'
import type { TripBudgetSummary } from '../types'
import { BudgetSection } from './BudgetSection'

function makeBudgetSummary(overrides?: Partial<TripBudgetSummary>): TripBudgetSummary {
  return {
    trip_id: 'trip-1',
    trip_slug: 'japan-autumn',
    plutus_tag: 'trip:japan-autumn',
    budget_nzd: '5000.00',
    planned_nzd: '2555.00',
    actual_settled_nzd: '2150.40',
    remaining_budget_nzd: '2849.60',
    variance_nzd: '-404.60',
    plutus_available: true,
    plutus_error: null,
    midas_url: 'https://midas.example.test/?tag=trip:japan-autumn',
    missing_fx_currencies: [],
    fx_rates: {
      SGD: { rate: '1.2500', rate_date: '2027-01-10', source: 'plutus' },
      PHP: { rate: '0.0300', rate_date: '2027-01-10', source: 'plutus' },
    },
    planned_bookings: [
      {
        booking_id: 'book-1',
        title: 'Pacific Air AKL to HND',
        booking_type: 'flight',
        status: 'confirmed',
        quoted_cost: '1480.00',
        quoted_currency: 'NZD',
        fx_rate: '1.0',
        nzd_amount: '1480.00',
      },
      {
        booking_id: 'book-2',
        title: 'Marina Bay Transit Hotel',
        booking_type: 'lodging',
        status: 'confirmed',
        quoted_cost: '500.00',
        quoted_currency: 'SGD',
        fx_rate: '1.2500',
        nzd_amount: '625.00',
      },
      {
        booking_id: 'book-3',
        title: 'Manila Bay Ferry',
        booking_type: 'transport',
        status: 'pending',
        quoted_cost: '15000.00',
        quoted_currency: 'PHP',
        fx_rate: '0.0300',
        nzd_amount: '450.00',
      },
    ],
    category_breakdown: [
      { category: 'Transport', total_spend_nzd: '1500.00', transaction_count: 2, percentage: '69.8' },
      { category: 'Dining', total_spend_nzd: '650.40', transaction_count: 3, percentage: '30.2' },
    ],
    transactions: [
      {
        id: 101,
        transaction_date: '2027-01-12',
        account_name: 'Wise Travel',
        amount: '300.00',
        currency: 'SGD',
        exchange_rate: '1.2500',
        nzd_amount: '375.00',
        merchant: 'Changi Rail',
        category: 'Transport',
        raw_description: 'CHANGI RAIL SG',
        tags: ['trip:japan-autumn'],
      },
    ],
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BudgetSection', () => {
  it('renders multi-currency planned bookings, Plutus actuals, categories, transactions, and Midas deep link', () => {
    render(
      <BudgetSection
        tripSlug="japan-autumn"
        configuredBudgetNzd="5000.00"
        budgetSummary={makeBudgetSummary()}
        budgetLoading={false}
        budgetError={null}
        isOffline={false}
        readOnly={false}
        onRefreshBudget={vi.fn().mockResolvedValue(undefined)}
        onUpdateBudget={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByText('Trip Budget & Plutus Sync')).toBeInTheDocument()
    expect(screen.getByText(/Tag: trip:japan-autumn/)).toBeInTheDocument()
    const midasLink = screen.getByRole('link', { name: /Open in Midas/i })
    expect(midasLink).toHaveAttribute('href', 'https://midas.example.test/?tag=trip:japan-autumn')

    expect(screen.getByTestId('budget-planned-card')).toHaveTextContent('NZD 2555.00')
    expect(screen.getByTestId('budget-actual-card')).toHaveTextContent('NZD 2150.40')
    expect(screen.getByTestId('budget-remaining-card')).toHaveTextContent('NZD 2849.60')

    expect(screen.getByText('Marina Bay Transit Hotel')).toBeInTheDocument()
    expect(screen.getByText(/SGD 500.00/)).toBeInTheDocument()
    expect(screen.getByText(/-> NZD 625.00/)).toBeInTheDocument()
    expect(screen.getByText('Manila Bay Ferry')).toBeInTheDocument()
    expect(screen.getByText(/PHP 15000.00/)).toBeInTheDocument()
    expect(screen.getByText(/-> NZD 450.00/)).toBeInTheDocument()

    expect(screen.getByText('Dining')).toBeInTheDocument()
    expect(screen.getByText('Changi Rail')).toBeInTheDocument()
  })

  it('renders Plutus unavailable banner and Unavailable (never $0.00) when plutus_available is false', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const unavailable = makeBudgetSummary({
      planned_nzd: null,
      actual_settled_nzd: null,
      remaining_budget_nzd: null,
      variance_nzd: null,
      plutus_available: false,
      plutus_error: 'Plutus upstream returned 503',
      missing_fx_currencies: ['SGD', 'PHP'],
      planned_bookings: [
        {
          booking_id: 'book-1',
          title: 'Pacific Air AKL to HND',
          booking_type: 'flight',
          status: 'confirmed',
          quoted_cost: '1480.00',
          quoted_currency: 'NZD',
          fx_rate: '1.0',
          nzd_amount: '1480.00',
        },
        {
          booking_id: 'book-2',
          title: 'Marina Bay Transit Hotel',
          booking_type: 'lodging',
          status: 'confirmed',
          quoted_cost: '500.00',
          quoted_currency: 'SGD',
          fx_rate: null,
          nzd_amount: null,
        },
      ],
      category_breakdown: [],
      transactions: [],
    })

    render(
      <BudgetSection
        tripSlug="japan-autumn"
        configuredBudgetNzd="5000.00"
        budgetSummary={unavailable}
        budgetLoading={false}
        budgetError={null}
        isOffline={false}
        readOnly={false}
        onRefreshBudget={onRefresh}
        onUpdateBudget={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Plutus unavailable')
    expect(alert).toHaveTextContent('Plutus upstream returned 503')
    expect(screen.getByTestId('budget-actual-card')).toHaveTextContent('Unavailable')
    expect(screen.getByTestId('budget-actual-card')).not.toHaveTextContent('$0.00')
    expect(screen.getByTestId('budget-remaining-card')).toHaveTextContent('Unavailable')
    expect(screen.getByText('FX unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('renders Plutus unavailable banner and Unavailable when getTripBudget rejects', async () => {
    const getTripBudget = vi.fn().mockRejectedValue(
      new OdysseusApiError({ status: 502, detail: 'Gateway timeout reaching Plutus', path: '/trips/trip-1/budget' }),
    )
    const { result } = renderHook(() => useTripBudget({ getTripBudget }, 'trip-1', false, 1))

    await waitFor(() => {
      expect(result.current.budgetError).toBe('Gateway timeout reaching Plutus')
    })

    render(
      <BudgetSection
        tripSlug="japan-autumn"
        configuredBudgetNzd="5000.00"
        budgetSummary={result.current.budgetSummary}
        budgetLoading={result.current.isLoading}
        budgetError={result.current.budgetError}
        isOffline={false}
        readOnly={false}
        onRefreshBudget={result.current.refreshBudget}
        onUpdateBudget={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Plutus unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent('Gateway timeout reaching Plutus')
    expect(screen.getByTestId('budget-actual-card')).toHaveTextContent('Unavailable')
    expect(screen.getByTestId('budget-actual-card')).not.toHaveTextContent('$0.00')
  })

  it('renders Offline Mode banner and disables Edit Budget and Refresh when offline/readOnly', () => {
    render(
      <BudgetSection
        tripSlug="japan-autumn"
        configuredBudgetNzd="5000.00"
        budgetSummary={null}
        budgetLoading={false}
        budgetError={null}
        isOffline
        readOnly
        onRefreshBudget={vi.fn().mockResolvedValue(undefined)}
        onUpdateBudget={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Offline Mode')
    expect(alert).toHaveTextContent('NZD 5000.00')
    expect(screen.getByRole('button', { name: 'Edit Budget' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(screen.getByTestId('budget-actual-card')).toHaveTextContent('Unavailable')
  })

  it('supports inline editing and saving budget_nzd', async () => {
    const onUpdateBudget = vi.fn().mockResolvedValue(undefined)
    render(
      <BudgetSection
        tripSlug="japan-autumn"
        configuredBudgetNzd="5000.00"
        budgetSummary={makeBudgetSummary()}
        budgetLoading={false}
        budgetError={null}
        isOffline={false}
        readOnly={false}
        onRefreshBudget={vi.fn().mockResolvedValue(undefined)}
        onUpdateBudget={onUpdateBudget}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Budget' }))
    const input = screen.getByLabelText('Trip Budget (NZD)')
    fireEvent.change(input, { target: { value: '6200.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Budget' }))

    await waitFor(() => {
      expect(onUpdateBudget).toHaveBeenCalledWith('6200.50')
    })
  })
})
