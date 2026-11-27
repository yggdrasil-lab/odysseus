"""Pure domain logic for trip budget rollups, FX conversion, and Midas deep links."""

from collections.abc import Mapping, Sequence
from decimal import Decimal, ROUND_HALF_UP
import uuid

from pydantic import BaseModel, ConfigDict

from app.adapters.plutus import PlutusFxRate, PlutusTransaction
from app.models.bookings import Booking

MONEY_QUANT = Decimal("0.01")


class PlannedBookingCostItem(BaseModel):
    """Normalized booking cost conversion item in the pure budget domain."""

    model_config = ConfigDict(frozen=True)

    booking_id: uuid.UUID
    title: str
    booking_type: str
    status: str
    quoted_cost: Decimal
    quoted_currency: str
    fx_rate: Decimal | None = None
    nzd_amount: Decimal | None = None


class PlannedBookingsRollup(BaseModel):
    """Aggregate planned booking costs in NZD with explicit missing-FX tracking."""

    model_config = ConfigDict(frozen=True)

    planned_nzd: Decimal | None
    missing_fx_currencies: list[str]
    items: list[PlannedBookingCostItem]


def quantize_nzd(value: Decimal) -> Decimal:
    """Round a monetary Decimal value to 2 decimal places using ROUND_HALF_UP."""
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def normalize_currency(currency: str | None) -> str:
    """Normalize optional booking currency code, defaulting blank values to NZD."""
    cleaned = (currency or "NZD").strip().upper()
    return cleaned or "NZD"


def _convert_booking_cost(
    booking: Booking,
    normalized_rates: Mapping[str, PlutusFxRate],
) -> PlannedBookingCostItem:
    assert booking.quoted_cost is not None
    currency = normalize_currency(booking.quoted_currency)
    quoted_cost = Decimal(booking.quoted_cost)
    if currency == "NZD":
        rate_value: Decimal | None = Decimal("1.0")
        nzd_amount: Decimal | None = quantize_nzd(quoted_cost)
    elif (fx_entry := normalized_rates.get(currency)) is not None:
        rate_value = fx_entry.rate
        nzd_amount = quantize_nzd(quoted_cost * rate_value)
    else:
        rate_value = None
        nzd_amount = None

    return PlannedBookingCostItem(
        booking_id=booking.id,
        title=booking.title,
        booking_type=booking.booking_type,
        status=booking.status,
        quoted_cost=quantize_nzd(quoted_cost),
        quoted_currency=currency,
        fx_rate=rate_value,
        nzd_amount=nzd_amount,
    )


def compute_planned_bookings_rollup(
    bookings: Sequence[Booking],
    fx_rates: Mapping[str, PlutusFxRate],
) -> PlannedBookingsRollup:
    """Convert non-cancelled quoted bookings to NZD without silent fallbacks."""
    normalized_rates = {code.strip().upper(): rate for code, rate in fx_rates.items()}
    items: list[PlannedBookingCostItem] = []
    missing_currencies: set[str] = set()
    running_total = Decimal("0.00")

    for booking in bookings:
        if booking.status == "cancelled" or booking.quoted_cost is None:
            continue
        item = _convert_booking_cost(booking, normalized_rates)
        items.append(item)
        if item.nzd_amount is None:
            missing_currencies.add(item.quoted_currency)
        else:
            running_total += item.nzd_amount

    planned_nzd = None if missing_currencies else quantize_nzd(running_total)
    return PlannedBookingsRollup(
        planned_nzd=planned_nzd,
        missing_fx_currencies=sorted(missing_currencies),
        items=items,
    )


def compute_transaction_nzd(tx: PlutusTransaction) -> Decimal | None:
    """Compute positive NZD spend for a Plutus transaction, or None if FX is unavailable."""
    currency = tx.currency.strip().upper()
    if currency == "NZD":
        return quantize_nzd(abs(tx.amount))
    if tx.exchange_rate is not None:
        return quantize_nzd(abs(tx.amount) * tx.exchange_rate)
    return None


def build_midas_deep_link(domain_name: str, trip_slug: str) -> str | None:
    """Build Midas filtered transaction deep link for the trip tag when domain is configured."""
    cleaned_domain = domain_name.strip()
    if not cleaned_domain:
        return None
    return f"https://midas.{cleaned_domain}/?tag=trip:{trip_slug}"
