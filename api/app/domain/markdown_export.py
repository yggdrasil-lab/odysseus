"""Pure one-way Obsidian Vault Markdown snapshot renderer for Odysseus Trips."""

from datetime import datetime, timezone
import uuid

from app.schemas.bookings import AttachmentRead, BookingRead, BookingSegmentRead
from app.schemas.planning import (
    ChecklistRead,
    ItineraryItemRead,
    TravelNoteRead,
    TripWorkspaceRead,
)
from app.schemas.trips import DayRead, LegRead


def _sanitize_ascii_dashes(text: str) -> str:
    return text.replace("\u2014", "-").replace("\u2013", "-")


def _yaml_scalar(value: str) -> str:
    cleaned = value.replace("\r", " ").replace("\n", " ").strip()
    escaped = cleaned.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _format_frontmatter(workspace: TripWorkspaceRead, exported_at: datetime) -> list[str]:
    trip = workspace.trip
    lines = [
        "---",
        "type: trip-snapshot",
        f"trip_slug: {trip.slug}",
        f"status: {trip.status}",
        f"start_date: {trip.start_date.isoformat() if trip.start_date else 'null'}",
        f"end_date: {trip.end_date.isoformat() if trip.end_date else 'null'}",
        f"home_timezone: {trip.home_timezone}",
    ]
    if trip.budget_nzd is not None:
        lines.append(f"budget_nzd: {trip.budget_nzd}")
    if trip.vault_note_path:
        lines.append(f"vault_note_path: {_yaml_scalar(trip.vault_note_path)}")
    timestamp = exported_at.astimezone(timezone.utc).replace(microsecond=0).isoformat()
    lines.append(f"exported_at: {timestamp.replace('+00:00', 'Z')}")
    lines.append("source: odysseus")
    lines.append("---")
    return lines


def _format_header_section(workspace: TripWorkspaceRead) -> list[str]:
    trip = workspace.trip
    lines = [f"# {trip.title}", ""]
    if trip.summary:
        lines.extend([trip.summary.strip(), ""])
    if trip.vault_note_path:
        lines.extend([f"**Vault Note:** {trip.vault_note_path}", ""])
    return lines


def _format_legs_section(legs: list[LegRead]) -> list[str]:
    lines = ["## Legs", ""]
    if not legs:
        return [*lines, "_No legs configured._", ""]
    ordered = sorted(legs, key=lambda leg: (leg.start_date, leg.sort_order))
    for leg in ordered:
        loc = f"{leg.primary_city}, {leg.country_code}" if leg.country_code else leg.primary_city
        lines.append(
            f"- **{leg.name}** ({loc}) - {leg.start_date.isoformat()} to "
            f"{leg.end_date.isoformat()} ({leg.base_timezone})"
        )
        if leg.notes:
            lines.append(f"  - {leg.notes.strip()}")
    lines.append("")
    return lines


def _format_segment_line(seg: BookingSegmentRead) -> str:
    origin = seg.origin_code or seg.origin_label
    dest = seg.destination_code or seg.destination_label
    dep = seg.departure_local.strftime("%Y-%m-%d %H:%M")
    arr = seg.arrival_local.strftime("%Y-%m-%d %H:%M")
    offset_tag = f" (+{seg.day_offset})" if seg.day_offset > 0 else ""
    carrier_num = " ".join(
        part for part in (seg.carrier, seg.flight_or_service_number) if part
    )
    prefix = f"{carrier_num}: " if carrier_num else ""
    return (
        f"  - {prefix}{origin} -> {dest}: {dep} {seg.departure_tz} to "
        f"{arr} {seg.arrival_tz}{offset_tag}"
    )


def _format_bookings_section(
    bookings: list[BookingRead],
    attachments: list[AttachmentRead],
) -> list[str]:
    lines = ["## Bookings", ""]
    if not bookings:
        return [*lines, "_No bookings recorded._", ""]
    attachments_by_booking: dict[uuid.UUID, list[str]] = {}
    for att in attachments:
        if att.booking_id is not None:
            attachments_by_booking.setdefault(att.booking_id, []).append(att.filename)

    for booking in sorted(bookings, key=lambda b: (b.sort_order, b.created_at)):
        meta = [f"status: {booking.status}", f"type: {booking.booking_type}"]
        if booking.confirmation_code:
            meta.append(f"PNR: {booking.confirmation_code}")
        if booking.provider:
            meta.append(f"provider: {booking.provider}")
        if booking.quoted_cost is not None:
            currency = booking.quoted_currency or "NZD"
            meta.append(f"cost: {currency} {booking.quoted_cost}")
        lines.append(f"- **{booking.title}** ({', '.join(meta)})")
        for seg in sorted(booking.segments, key=lambda s: s.segment_order):
            lines.append(_format_segment_line(seg))
        doc_names = attachments_by_booking.get(booking.id, [])
        if doc_names:
            lines.append(f"  - Attachments: {', '.join(doc_names)}")
    lines.append("")
    return lines


def _format_item_time_window(item: ItineraryItemRead) -> str:
    if item.start_local is None:
        return ""
    start_hm = item.start_local.strftime("%H:%M")
    if item.end_local is not None:
        window = f"{start_hm}-{item.end_local.strftime('%H:%M')}"
    else:
        window = start_hm
    return f"{window} {item.start_tz}" if item.start_tz else window


def _build_arrivals_by_date(
    bookings: list[BookingRead],
) -> dict[str, list[tuple[BookingRead, BookingSegmentRead]]]:
    arrivals: dict[str, list[tuple[BookingRead, BookingSegmentRead]]] = {}
    for booking in bookings:
        for seg in booking.segments:
            if seg.projected_arrival_date is not None:
                key = seg.projected_arrival_date.isoformat()
                arrivals.setdefault(key, []).append((booking, seg))
    return arrivals


def _format_day_block(
    day: DayRead,
    legs: list[LegRead],
    items: list[ItineraryItemRead],
    arrivals: list[tuple[BookingRead, BookingSegmentRead]],
    place_names: dict[uuid.UUID, str],
) -> list[str]:
    title_suffix = f" - {day.title}" if day.title else ""
    lines = [f"### {day.date.isoformat()}{title_suffix}"]
    covering = [leg.name for leg in legs if leg.start_date <= day.date <= leg.end_date]
    if covering:
        lines.append(f"- **Leg:** {', '.join(covering)}")
    for booking, seg in arrivals:
        arr_hm = seg.arrival_local.strftime("%H:%M")
        offset_tag = f" (+{seg.day_offset})" if seg.day_offset > 0 else ""
        lines.append(
            f"- **Arrival:** {booking.title} ({seg.destination_code or seg.destination_label}) "
            f"at {arr_hm} {seg.arrival_tz}{offset_tag}"
        )
    for item in items:
        time_label = _format_item_time_window(item)
        place_name = place_names.get(item.place_id) if item.place_id else item.place_label
        details = [part for part in (time_label, f"[{item.category}, {item.status}]", place_name) if part]
        lines.append(f"- **{item.title}** ({' | '.join(details)})")
        if item.notes:
            lines.append(f"  - {item.notes.strip()}")
    if not covering and not arrivals and not items:
        lines.append("- _No scheduled items._")
    lines.append("")
    return lines


def _format_itinerary_section(workspace: TripWorkspaceRead) -> list[str]:
    lines = ["## Day-by-Day Itinerary", ""]
    if not workspace.days:
        return [*lines, "_No days provisioned._", ""]
    place_names = {place.id: place.name for place in workspace.places}
    arrivals_by_date = _build_arrivals_by_date(workspace.bookings)
    for day in sorted(workspace.days, key=lambda d: d.date):
        day_items = [item for item in workspace.itinerary_items if item.day_id == day.id]
        day_arrivals = arrivals_by_date.get(day.date.isoformat(), [])
        lines.extend(_format_day_block(day, workspace.legs, day_items, day_arrivals, place_names))
    return lines


def _format_backlog_section(workspace: TripWorkspaceRead) -> list[str]:
    lines = ["## Backlog Places & Ideas", ""]
    backlog_items = [item for item in workspace.itinerary_items if item.day_id is None]
    backlog_places = [place for place in workspace.places if place.is_backlog]
    if not backlog_items and not backlog_places:
        return [*lines, "_No backlog places or ideas._", ""]
    for item in backlog_items:
        place_str = f" @ {item.place_label}" if item.place_label else ""
        lines.append(f"- [Idea] **{item.title}** ({item.category}){place_str}")
    for place in backlog_places:
        addr = f" - {place.address}" if place.address else ""
        lines.append(f"- [Place] **{place.name}** ({place.category}){addr}")
    lines.append("")
    return lines


def _format_checklists_section(checklists: list[ChecklistRead]) -> list[str]:
    lines = ["## Checklists", ""]
    if not checklists:
        return [*lines, "_No checklists._", ""]
    for checklist in sorted(checklists, key=lambda c: (c.sort_order, c.created_at)):
        lines.append(f"### {checklist.title} ({checklist.list_type})")
        for item in sorted(checklist.items, key=lambda i: (i.sort_order, i.created_at)):
            mark = "x" if item.is_completed else " "
            due = f" (due {item.due_date.isoformat()})" if item.due_date else ""
            note = f" - {item.note.strip()}" if item.note else ""
            lines.append(f"- [{mark}] {item.label}{due}{note}")
        lines.append("")
    return lines


def _format_notes_section(notes: list[TravelNoteRead]) -> list[str]:
    lines = ["## Travel Notes", ""]
    if not notes:
        return [*lines, "_No travel notes._", ""]
    for note in sorted(notes, key=lambda n: (n.sort_order, n.created_at)):
        privacy = " [Private]" if note.is_private else ""
        lines.extend([f"### {note.title}{privacy}", "", note.body.strip(), ""])
    return lines


def render_trip_markdown(
    workspace: TripWorkspaceRead,
    exported_at: datetime | None = None,
) -> str:
    """Render a deterministic one-way Obsidian Markdown snapshot with zero Immich data."""
    timestamp = exported_at or datetime.now(timezone.utc)
    lines: list[str] = []
    lines.extend(_format_frontmatter(workspace, timestamp))
    lines.append("")
    lines.extend(_format_header_section(workspace))
    lines.extend(_format_legs_section(workspace.legs))
    lines.extend(_format_bookings_section(workspace.bookings, workspace.attachments))
    lines.extend(_format_itinerary_section(workspace))
    lines.extend(_format_backlog_section(workspace))
    lines.extend(_format_checklists_section(workspace.checklists))
    lines.extend(_format_notes_section(workspace.travel_notes))
    return _sanitize_ascii_dashes("\n".join(lines).rstrip() + "\n")
