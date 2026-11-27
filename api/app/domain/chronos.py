"""Pure Chronos sync eligibility validation and travel anchor projection."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal
import uuid
from zoneinfo import ZoneInfo

from app.domain.errors import DomainValidationError
from app.domain.timezones import validate_iana_timezone
from app.models import Booking, BookingSegment, ItineraryItem, Trip

ELIGIBLE_CHRONOS_STATUSES = frozenset({"booked", "active"})
URGENT_BOOKING_TYPES = frozenset({"flight", "transport"})


@dataclass(frozen=True)
class ProjectedChronosAnchor:
    """Pure projected Chronos commitment anchor derived from a booking segment or item."""

    external_ref: str
    source_kind: Literal["booking_segment", "itinerary_item"]
    source_id: uuid.UUID
    title: str
    target_date: date
    start_minute: int
    end_minute: int
    nudge_mode: Literal["none", "boundary"]
    urgent_quiet_bypass: bool
    notes: str


def check_chronos_sync_eligibility(
    status: str,
    start_date: date | None,
    end_date: date | None,
) -> tuple[bool, str | None]:
    """Return whether a trip can enable Chronos sync, plus reason if ineligible."""
    if status not in ELIGIBLE_CHRONOS_STATUSES:
        return (
            False,
            f"Chronos sync requires trip status 'booked' or 'active' (current: '{status}').",
        )
    if start_date is None or end_date is None:
        return (
            False,
            "Chronos sync requires non-null trip start_date and end_date.",
        )
    if end_date < start_date:
        return False, "Trip end_date must be on or after start_date."
    return True, None


def validate_chronos_sync_eligibility(
    status: str,
    start_date: date | None,
    end_date: date | None,
) -> None:
    """Raise DomainValidationError if trip is ineligible for Chronos sync."""
    eligible, reason = check_chronos_sync_eligibility(status, start_date, end_date)
    if not eligible:
        raise DomainValidationError(reason or "Trip is ineligible for Chronos sync.")


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _project_utc_window_to_home(
    start_utc: datetime,
    end_utc: datetime | None,
    home_zone: ZoneInfo,
) -> tuple[date, int, int]:
    """Convert UTC bounds into home timezone date and clamped [0..1440] minute window."""
    start_home = _ensure_utc(start_utc).astimezone(home_zone)
    target_date = start_home.date()
    start_minute = start_home.hour * 60 + start_home.minute

    if end_utc is None or _ensure_utc(end_utc) <= _ensure_utc(start_utc):
        return target_date, start_minute, min(1440, start_minute + 60)

    end_home = _ensure_utc(end_utc).astimezone(home_zone)
    if end_home.date() > target_date:
        return target_date, start_minute, 1440

    end_minute = end_home.hour * 60 + end_home.minute
    if end_minute <= start_minute:
        end_minute = min(1440, start_minute + 1)
    return target_date, start_minute, end_minute


def _format_segment_notes(booking: Booking, segment: BookingSegment) -> str:
    dep = segment.departure_local.strftime("%Y-%m-%d %H:%M")
    arr = segment.arrival_local.strftime("%Y-%m-%d %H:%M")
    parts = [f"Departs {dep} ({segment.departure_tz})", f"Arrives {arr} ({segment.arrival_tz})"]
    if segment.flight_or_service_number:
        parts.append(f"Service: {segment.flight_or_service_number}")
    if booking.confirmation_code:
        parts.append(f"Confirmation: {booking.confirmation_code}")
    if segment.notes:
        parts.append(segment.notes.strip())
    return " | ".join(parts)


def _project_segment_anchor(
    trip_slug: str,
    booking: Booking,
    segment: BookingSegment,
    home_zone: ZoneInfo,
) -> ProjectedChronosAnchor:
    target_date, start_minute, end_minute = _project_utc_window_to_home(
        segment.departure_utc,
        segment.arrival_utc,
        home_zone,
    )
    origin = segment.origin_code or segment.origin_label
    dest = segment.destination_code or segment.destination_label
    urgent = booking.booking_type in URGENT_BOOKING_TYPES
    return ProjectedChronosAnchor(
        external_ref=f"odysseus:{trip_slug}:segment:{segment.id}",
        source_kind="booking_segment",
        source_id=segment.id,
        title=f"{booking.title}: {origin} to {dest}",
        target_date=target_date,
        start_minute=start_minute,
        end_minute=end_minute,
        nudge_mode="boundary" if urgent else "none",
        urgent_quiet_bypass=urgent,
        notes=_format_segment_notes(booking, segment),
    )


def _format_item_notes(item: ItineraryItem) -> str:
    parts: list[str] = []
    if item.start_local is not None and item.start_tz:
        start_text = f"{item.start_local.strftime('%Y-%m-%d %H:%M')} ({item.start_tz})"
        if item.end_local is not None:
            end_tz = item.end_tz or item.start_tz
            end_text = f"{item.end_local.strftime('%Y-%m-%d %H:%M')} ({end_tz})"
            parts.append(f"Local: {start_text} to {end_text}")
        else:
            parts.append(f"Local: {start_text}")
    elif item.start_utc is not None:
        parts.append(f"UTC: {item.start_utc.isoformat()}")
    if item.place_label:
        parts.append(f"Place: {item.place_label}")
    if item.notes:
        parts.append(item.notes.strip())
    return " | ".join(parts)


def _project_item_anchor(
    trip_slug: str,
    item: ItineraryItem,
    home_zone: ZoneInfo,
) -> ProjectedChronosAnchor:
    assert item.start_utc is not None
    target_date, start_minute, end_minute = _project_utc_window_to_home(
        item.start_utc,
        item.end_utc,
        home_zone,
    )
    return ProjectedChronosAnchor(
        external_ref=f"odysseus:{trip_slug}:item:{item.id}",
        source_kind="itinerary_item",
        source_id=item.id,
        title=item.title,
        target_date=target_date,
        start_minute=start_minute,
        end_minute=end_minute,
        nudge_mode="none",
        urgent_quiet_bypass=False,
        notes=_format_item_notes(item),
    )


def project_trip_chronos_anchors(
    trip: Trip,
    bookings: Sequence[Booking],
    itinerary_items: Sequence[ItineraryItem],
) -> list[ProjectedChronosAnchor]:
    """Project confirmed booking segments and flagged timed itinerary items to Chronos anchors."""
    home_zone = validate_iana_timezone(trip.home_timezone)
    anchors: list[ProjectedChronosAnchor] = []

    for booking in bookings:
        if booking.status != "confirmed":
            continue
        for segment in booking.segments:
            anchors.append(_project_segment_anchor(trip.slug, booking, segment, home_zone))

    for item in itinerary_items:
        if item.sync_to_chronos and item.start_utc is not None and item.status != "skipped":
            anchors.append(_project_item_anchor(trip.slug, item, home_zone))

    anchors.sort(key=lambda anchor: (anchor.target_date, anchor.start_minute, anchor.external_ref))
    return anchors
