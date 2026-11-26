"""Domain exceptions and pure validation utilities for Odysseus."""

from app.domain.errors import DomainConflictError, DomainError, DomainNotFoundError, DomainValidationError
from app.domain.timezones import (
    compute_item_utc_bounds,
    iter_date_range,
    validate_date_range,
    validate_iana_timezone,
    validate_slug,
    validate_trip_dates,
)

__all__ = [
    "DomainConflictError",
    "DomainError",
    "DomainNotFoundError",
    "DomainValidationError",
    "compute_item_utc_bounds",
    "iter_date_range",
    "validate_date_range",
    "validate_iana_timezone",
    "validate_slug",
    "validate_trip_dates",
]
