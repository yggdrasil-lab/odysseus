"""Pure timezone, slug, and date-span validation functions for Odysseus."""

from datetime import date, datetime, timedelta, timezone
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.domain.errors import DomainValidationError

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
NON_PLANNING_STATUSES = frozenset({"booked", "active", "completed", "archived"})
ALL_TRIP_STATUSES = frozenset({"planning", *NON_PLANNING_STATUSES})


def validate_iana_timezone(tz_name: str) -> ZoneInfo:
    """Validate and return a ZoneInfo instance for an IANA timezone identifier."""
    cleaned = tz_name.strip()
    if not cleaned:
        raise DomainValidationError("Timezone identifier must not be empty.")
    try:
        return ZoneInfo(cleaned)
    except (ZoneInfoNotFoundError, ValueError, KeyError) as exc:
        raise DomainValidationError(f"Invalid IANA timezone: {tz_name}") from exc


def validate_slug(slug: str) -> str:
    """Validate lowercase kebab-case slug format."""
    if not SLUG_PATTERN.fullmatch(slug):
        raise DomainValidationError(
            "Slug must be lowercase alphanumeric segments separated by single hyphens."
        )
    return slug


def validate_date_range(start_date: date, end_date: date, entity_label: str) -> None:
    """Ensure end_date is on or after start_date."""
    if end_date < start_date:
        raise DomainValidationError(f"{entity_label} end_date must be on or after start_date.")


def validate_trip_dates(
    status: str,
    start_date: date | None,
    end_date: date | None,
) -> None:
    """Enforce nullable date rules for planning vs non-planning trip statuses."""
    if status not in ALL_TRIP_STATUSES:
        raise DomainValidationError(f"Unsupported trip status: {status}")
    if status in NON_PLANNING_STATUSES:
        if start_date is None or end_date is None:
            raise DomainValidationError(
                f"Trip status '{status}' requires both start_date and end_date."
            )
    if start_date is not None and end_date is not None:
        validate_date_range(start_date, end_date, "Trip")


def _localize_naive(local_dt: datetime, tz_name: str, field_label: str) -> datetime:
    if local_dt.tzinfo is not None:
        raise DomainValidationError(
            f"{field_label} must be a naive wall-clock timestamp without timezone offset."
        )
    zone = validate_iana_timezone(tz_name)
    return local_dt.replace(tzinfo=zone).astimezone(timezone.utc)


def compute_item_utc_bounds(
    start_local: datetime | None,
    start_tz: str | None,
    end_local: datetime | None,
    end_tz: str | None,
) -> tuple[datetime | None, datetime | None]:
    """Recompute UTC bounds from naive local wall-clock timestamps and IANA timezones."""
    if start_tz is not None:
        validate_iana_timezone(start_tz)
    if end_tz is not None:
        validate_iana_timezone(end_tz)

    start_utc: datetime | None = None
    if start_local is not None:
        if not start_tz:
            raise DomainValidationError("start_tz is required when start_local is provided.")
        start_utc = _localize_naive(start_local, start_tz, "start_local")

    end_utc: datetime | None = None
    if end_local is not None:
        if not end_tz:
            raise DomainValidationError("end_tz is required when end_local is provided.")
        end_utc = _localize_naive(end_local, end_tz, "end_local")

    if start_utc is not None and end_utc is not None and end_utc < start_utc:
        raise DomainValidationError("end_utc must be on or after start_utc.")

    return start_utc, end_utc


def iter_date_range(start_date: date, end_date: date) -> list[date]:
    """Return inclusive calendar dates from start_date through end_date."""
    validate_date_range(start_date, end_date, "Date range")
    total_days = (end_date - start_date).days + 1
    return [start_date + timedelta(days=offset) for offset in range(total_days)]
