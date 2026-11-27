"""Application service assembling read-only trip budgets with Plutus FX and actuals."""

from collections.abc import Mapping
from decimal import Decimal
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.plutus import (
    PlutusClientAdapter,
    PlutusFxRate,
    PlutusTagSummary,
    PlutusTransaction,
)
from app.domain.budget import (
    PlannedBookingsRollup,
    build_midas_deep_link,
    compute_planned_bookings_rollup,
    compute_transaction_nzd,
    normalize_currency,
    quantize_nzd,
)
from app.domain.errors import DomainUpstreamError
from app.models import Booking, Trip
from app.schemas.budget import (
    BudgetCategoryActualRead,
    BudgetFxRateRead,
    PlannedBookingCostRead,
    SettledTransactionRead,
    TripBudgetSummaryRead,
)
from app.services.ownership import require_trip


def _map_planned_bookings(rollup: PlannedBookingsRollup) -> list[PlannedBookingCostRead]:
    return [PlannedBookingCostRead.model_validate(item.model_dump()) for item in rollup.items]


def _map_fx_rates(fx_rates: Mapping[str, PlutusFxRate]) -> dict[str, BudgetFxRateRead]:
    return {
        code: BudgetFxRateRead(rate=entry.rate, rate_date=entry.rate_date, source=entry.source)
        for code, entry in fx_rates.items()
    }


def _map_categories(tag_summary: PlutusTagSummary | None) -> list[BudgetCategoryActualRead]:
    if tag_summary is None:
        return []
    return [
        BudgetCategoryActualRead(
            category=entry.category,
            total_spend_nzd=quantize_nzd(entry.total_spend),
            transaction_count=entry.transaction_count,
            percentage=entry.percentage,
        )
        for entry in tag_summary.categories
    ]


def _map_transactions(raw_transactions: list[PlutusTransaction]) -> list[SettledTransactionRead]:
    return [
        SettledTransactionRead(
            id=tx.id,
            transaction_date=tx.transaction_date,
            account_name=tx.account_name,
            amount=quantize_nzd(tx.amount),
            currency=tx.currency.strip().upper(),
            exchange_rate=tx.exchange_rate,
            nzd_amount=compute_transaction_nzd(tx),
            merchant=tx.merchant,
            category=tx.category,
            raw_description=tx.raw_description,
            tags=list(tx.tags),
        )
        for tx in raw_transactions
    ]


def _build_unavailable_summary(
    trip: Trip,
    plutus_tag: str,
    midas_url: str | None,
    rollup: PlannedBookingsRollup,
    error_message: str,
) -> TripBudgetSummaryRead:
    return TripBudgetSummaryRead(
        trip_id=trip.id,
        trip_slug=trip.slug,
        plutus_tag=plutus_tag,
        budget_nzd=trip.budget_nzd,
        planned_nzd=rollup.planned_nzd,
        actual_settled_nzd=None,
        remaining_budget_nzd=None,
        variance_nzd=None,
        plutus_available=False,
        plutus_error=error_message,
        midas_url=midas_url,
        missing_fx_currencies=list(rollup.missing_fx_currencies),
        fx_rates={},
        planned_bookings=_map_planned_bookings(rollup),
        category_breakdown=[],
        transactions=[],
    )


def _build_available_summary(
    trip: Trip,
    plutus_tag: str,
    midas_url: str | None,
    rollup: PlannedBookingsRollup,
    fx_rates: Mapping[str, PlutusFxRate],
    tag_summary: PlutusTagSummary | None,
    raw_transactions: list[PlutusTransaction],
) -> TripBudgetSummaryRead:
    actual = quantize_nzd(tag_summary.total_spend) if tag_summary is not None else Decimal("0.00")
    remaining = quantize_nzd(trip.budget_nzd - actual) if trip.budget_nzd is not None else None
    variance = quantize_nzd(actual - rollup.planned_nzd) if rollup.planned_nzd is not None else None
    return TripBudgetSummaryRead(
        trip_id=trip.id,
        trip_slug=trip.slug,
        plutus_tag=plutus_tag,
        budget_nzd=trip.budget_nzd,
        planned_nzd=rollup.planned_nzd,
        actual_settled_nzd=actual,
        remaining_budget_nzd=remaining,
        variance_nzd=variance,
        plutus_available=True,
        plutus_error=None,
        midas_url=midas_url,
        missing_fx_currencies=list(rollup.missing_fx_currencies),
        fx_rates=_map_fx_rates(fx_rates),
        planned_bookings=_map_planned_bookings(rollup),
        category_breakdown=_map_categories(tag_summary),
        transactions=_map_transactions(raw_transactions),
    )


def get_trip_budget_summary(
    db: Session,
    trip_id: uuid.UUID,
    plutus: PlutusClientAdapter,
    domain_name: str,
) -> TripBudgetSummaryRead:
    """Compute trip budget summary from local bookings and read-only Plutus API data."""
    trip = require_trip(db, trip_id)
    bookings = list(
        db.scalars(
            select(Booking)
            .where(Booking.trip_id == trip_id)
            .order_by(Booking.sort_order, Booking.created_at)
        )
    )
    plutus_tag = f"trip:{trip.slug}"
    midas_url = build_midas_deep_link(domain_name, trip.slug)
    currencies = sorted(
        {
            normalize_currency(b.quoted_currency)
            for b in bookings
            if b.status != "cancelled" and b.quoted_cost is not None
        }
    )

    try:
        fx_rates = plutus.get_fx_rates("NZD", currencies) if currencies else {}
        tag_summary = plutus.get_tag_summary(plutus_tag)
        raw_transactions = plutus.get_trip_transactions(plutus_tag)
    except DomainUpstreamError as exc:
        rollup = compute_planned_bookings_rollup(bookings, {})
        return _build_unavailable_summary(trip, plutus_tag, midas_url, rollup, str(exc))

    rollup = compute_planned_bookings_rollup(bookings, fx_rates)
    return _build_available_summary(
        trip, plutus_tag, midas_url, rollup, fx_rates, tag_summary, raw_transactions
    )
