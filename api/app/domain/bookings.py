"""Pure domain logic for travel bookings and cross-timezone flight/transit segments."""

from datetime import date, datetime

from app.domain.errors import DomainValidationError
from app.domain.timezones import compute_item_utc_bounds

BOOKING_TYPES = frozenset({"flight", "lodging", "transport", "activity", "insurance"})
BOOKING_STATUSES = frozenset({"draft", "pending", "confirmed", "cancelled"})


def validate_booking_type(booking_type: str) -> str:
    """Validate booking_type against supported categories."""
    if booking_type not in BOOKING_TYPES:
        raise DomainValidationError(f"Unsupported booking_type: {booking_type}")
    return booking_type


def validate_booking_status(status: str) -> str:
    """Validate booking status against supported lifecycle values."""
    if status not in BOOKING_STATUSES:
        raise DomainValidationError(f"Unsupported booking status: {status}")
    return status


def compute_segment_utc_bounds(
    departure_local: datetime,
    departure_tz: str,
    arrival_local: datetime,
    arrival_tz: str,
) -> tuple[datetime, datetime]:
    """Compute and validate UTC departure/arrival timestamps for a booking segment."""
    departure_utc, arrival_utc = compute_item_utc_bounds(
        departure_local,
        departure_tz,
        arrival_local,
        arrival_tz,
    )
    if departure_utc is None or arrival_utc is None:
        raise DomainValidationError("Segment departure and arrival timestamps are required.")
    return departure_utc, arrival_utc


def compute_day_offset(departure_local: datetime, arrival_local: datetime) -> int:
    """Return local calendar day delta (negative for dateline gain, positive for overnight)."""
    return (arrival_local.date() - departure_local.date()).days


def compute_projected_arrival_date(
    departure_local: datetime,
    arrival_local: datetime,
) -> date | None:
    """Return arrival local date when arrival falls on a later local day than departure."""
    if arrival_local.date() > departure_local.date():
        return arrival_local.date()
    return None
