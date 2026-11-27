"""Read-model projection builders for Odysseus MCP trip overviews and day briefs."""

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.schemas.bookings import BookingRead, BookingSegmentRead
from app.schemas.planning import (
    ChecklistRead,
    ItineraryItemRead,
    TripWorkspaceRead,
)
from app.schemas.trips import DayRead, LegRead, TripRead

EXCLUDED_BOOKING_STATUSES = frozenset({"draft", "cancelled"})


def _serialize_trip_summary(trip: TripRead) -> dict[str, Any]:
    """Project Trip fields without Immich or ShareToken metadata."""
    return {
        "id": str(trip.id),
        "title": trip.title,
        "slug": trip.slug,
        "status": trip.status,
        "start_date": trip.start_date.isoformat() if trip.start_date else None,
        "end_date": trip.end_date.isoformat() if trip.end_date else None,
        "home_timezone": trip.home_timezone,
        "budget_nzd": str(trip.budget_nzd) if trip.budget_nzd is not None else None,
        "vault_note_path": trip.vault_note_path,
        "summary": trip.summary,
        "chronos_sync_enabled": trip.chronos_sync_enabled,
        "chronos_overlay_mode": trip.chronos_overlay_mode,
    }


def _serialize_leg_summary(leg: LegRead) -> dict[str, Any]:
    return {
        "id": str(leg.id),
        "name": leg.name,
        "primary_city": leg.primary_city,
        "country_code": leg.country_code,
        "base_timezone": leg.base_timezone,
        "start_date": leg.start_date.isoformat(),
        "end_date": leg.end_date.isoformat(),
        "notes": leg.notes,
    }


def _build_bookings_summary(workspace: TripWorkspaceRead) -> dict[str, Any]:
    attachments_by_booking: dict[str, list[str]] = {}
    for attachment in workspace.attachments:
        if attachment.booking_id is not None:
            attachments_by_booking.setdefault(str(attachment.booking_id), []).append(
                attachment.filename
            )

    by_status: dict[str, int] = {}
    items: list[dict[str, Any]] = []
    ordered_bookings = sorted(workspace.bookings, key=lambda b: (b.sort_order, b.created_at))
    for booking in ordered_bookings:
        by_status[booking.status] = by_status.get(booking.status, 0) + 1
        items.append(
            {
                "id": str(booking.id),
                "booking_type": booking.booking_type,
                "status": booking.status,
                "title": booking.title,
                "provider": booking.provider,
                "confirmation_code": booking.confirmation_code,
                "quoted_cost": (
                    str(booking.quoted_cost) if booking.quoted_cost is not None else None
                ),
                "quoted_currency": booking.quoted_currency,
                "segment_count": len(booking.segments),
                "attachment_filenames": attachments_by_booking.get(str(booking.id), []),
            }
        )
    return {"total_count": len(items), "by_status": by_status, "bookings": items}


def _build_checklist_progress(checklists: list[ChecklistRead]) -> dict[str, Any]:
    total_items = 0
    completed_items = 0
    per_list: list[dict[str, Any]] = []
    for checklist in sorted(checklists, key=lambda c: (c.sort_order, c.created_at)):
        list_total = len(checklist.items)
        list_done = sum(1 for item in checklist.items if item.is_completed)
        total_items += list_total
        completed_items += list_done
        per_list.append(
            {
                "id": str(checklist.id),
                "title": checklist.title,
                "list_type": checklist.list_type,
                "total_items": list_total,
                "completed_items": list_done,
            }
        )
    return {
        "total_checklists": len(per_list),
        "total_items": total_items,
        "completed_items": completed_items,
        "remaining_items": total_items - completed_items,
        "checklists": per_list,
    }


def build_trip_overview(workspace: TripWorkspaceRead) -> dict[str, Any]:
    """Build a compact trip overview excluding binary attachments, Immich, and ShareTokens."""
    ordered_legs = sorted(workspace.legs, key=lambda leg: (leg.start_date, leg.sort_order))
    return {
        "trip": _serialize_trip_summary(workspace.trip),
        "day_count": len(workspace.days),
        "legs": [_serialize_leg_summary(leg) for leg in ordered_legs],
        "bookings_summary": _build_bookings_summary(workspace),
        "checklist_progress": _build_checklist_progress(workspace.checklists),
        "counts": {
            "itinerary_items": len(workspace.itinerary_items),
            "places": len(workspace.places),
            "travel_notes": len(workspace.travel_notes),
        },
    }


def _serialize_day(day: DayRead | None) -> dict[str, Any] | None:
    if day is None:
        return None
    return {
        "id": str(day.id),
        "date": day.date.isoformat(),
        "title": day.title,
        "notes": day.notes,
    }


def _serialize_itinerary_item(
    item: ItineraryItemRead,
    place_names: dict[str, str],
) -> dict[str, Any]:
    place_name = place_names.get(str(item.place_id)) if item.place_id is not None else None
    return {
        "id": str(item.id),
        "title": item.title,
        "category": item.category,
        "status": item.status,
        "start_local": item.start_local.isoformat() if item.start_local else None,
        "start_tz": item.start_tz,
        "end_local": item.end_local.isoformat() if item.end_local else None,
        "end_tz": item.end_tz,
        "place_id": str(item.place_id) if item.place_id else None,
        "place_name": place_name or item.place_label,
        "sort_order": item.sort_order,
        "notes": item.notes,
    }


def _serialize_segment_event(
    booking: BookingRead,
    segment: BookingSegmentRead,
) -> dict[str, Any]:
    return {
        "booking_id": str(booking.id),
        "booking_title": booking.title,
        "booking_type": booking.booking_type,
        "booking_status": booking.status,
        "confirmation_code": booking.confirmation_code,
        "provider": booking.provider,
        "segment_id": str(segment.id),
        "carrier": segment.carrier,
        "flight_or_service_number": segment.flight_or_service_number,
        "origin_label": segment.origin_label,
        "origin_code": segment.origin_code,
        "destination_label": segment.destination_label,
        "destination_code": segment.destination_code,
        "departure_local": segment.departure_local.isoformat(),
        "departure_tz": segment.departure_tz,
        "arrival_local": segment.arrival_local.isoformat(),
        "arrival_tz": segment.arrival_tz,
        "day_offset": segment.day_offset,
        "projected_arrival_date": (
            segment.projected_arrival_date.isoformat()
            if segment.projected_arrival_date
            else None
        ),
        "seat_or_cabin": segment.seat_or_cabin,
        "terminal_gate": segment.terminal_gate,
    }


def _collect_day_segments(
    bookings: list[BookingRead],
    target_date: date,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    departing: list[dict[str, Any]] = []
    arriving: list[dict[str, Any]] = []
    for booking in sorted(bookings, key=lambda b: (b.sort_order, b.created_at)):
        if booking.status in EXCLUDED_BOOKING_STATUSES:
            continue
        for segment in sorted(booking.segments, key=lambda s: s.segment_order):
            if segment.departure_local.date() == target_date:
                departing.append(_serialize_segment_event(booking, segment))
            if segment.projected_arrival_date == target_date:
                arriving.append(_serialize_segment_event(booking, segment))
    return departing, arriving


def build_day_brief(
    workspace: TripWorkspaceRead,
    target_date: date,
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """Build a single-day travel brief with legs, sorted itinerary items, and active segments."""
    matching_day = next((day for day in workspace.days if day.date == target_date), None)
    active_legs = [
        _serialize_leg_summary(leg)
        for leg in sorted(workspace.legs, key=lambda leg: (leg.start_date, leg.sort_order))
        if leg.start_date <= target_date <= leg.end_date
    ]
    place_names = {str(place.id): place.name for place in workspace.places}
    day_items: list[dict[str, Any]] = []
    if matching_day is not None:
        raw_items = [
            item for item in workspace.itinerary_items if item.day_id == matching_day.id
        ]
        raw_items.sort(key=lambda item: (item.sort_order, item.start_local or datetime.max, item.created_at))
        day_items = [_serialize_itinerary_item(item, place_names) for item in raw_items]

    departing, arriving = _collect_day_segments(workspace.bookings, target_date)
    ref_date = today or datetime.now(ZoneInfo(workspace.trip.home_timezone)).date()
    days_until_departure = (
        (workspace.trip.start_date - ref_date).days
        if workspace.trip.start_date is not None
        else None
    )
    return {
        "trip_id": str(workspace.trip.id),
        "trip_title": workspace.trip.title,
        "target_date": target_date.isoformat(),
        "days_until_departure": days_until_departure,
        "day": _serialize_day(matching_day),
        "active_legs": active_legs,
        "itinerary_items": day_items,
        "departing_segments": departing,
        "arriving_segments": arriving,
    }
