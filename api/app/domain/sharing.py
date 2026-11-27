"""Pure domain logic for capability share tokens, expiry, and workspace redaction."""

from datetime import datetime, timezone
import secrets
from typing import Protocol
import uuid

from app.domain.errors import DomainGoneError
from app.schemas.bookings import BookingRead
from app.schemas.planning import TripWorkspaceRead
from app.schemas.sharing import (
    SharedAttachmentRead,
    SharedBookingRead,
    SharedTripSummaryRead,
    SharedTripViewRead,
    SharedVisibilityRead,
)

SHARE_SECURITY_HEADERS: dict[str, str] = {
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


class ShareTokenPolicy(Protocol):
    """Structural contract for share token redaction and validity checks."""

    token: str
    include_pnrs: bool
    include_attachments: bool
    include_costs: bool
    include_checklists: bool
    include_private_notes: bool
    expires_at: datetime | None
    revoked_at: datetime | None


def generate_share_token() -> str:
    """Generate a 256-bit URL-safe capability token."""
    return secrets.token_urlsafe(32)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def validate_share_token_active(
    token_row: ShareTokenPolicy,
    now: datetime | None = None,
) -> None:
    """Fail loudly with HTTP 410 if token is revoked or past its expiration timestamp."""
    if token_row.revoked_at is not None:
        raise DomainGoneError("Share link has been revoked.")
    if token_row.expires_at is None:
        return
    current = _as_utc(now) if now is not None else datetime.now(timezone.utc)
    if _as_utc(token_row.expires_at) <= current:
        raise DomainGoneError("Share link has expired.")


def _build_shared_trip_summary(
    workspace: TripWorkspaceRead,
    include_costs: bool,
) -> SharedTripSummaryRead:
    trip = workspace.trip
    return SharedTripSummaryRead(
        id=trip.id,
        title=trip.title,
        slug=trip.slug,
        status=trip.status,
        start_date=trip.start_date,
        end_date=trip.end_date,
        home_timezone=trip.home_timezone,
        budget_nzd=trip.budget_nzd if include_costs else None,
        summary=trip.summary,
        created_at=trip.created_at,
        updated_at=trip.updated_at,
    )


def _build_shared_booking(
    booking: BookingRead,
    include_pnrs: bool,
    include_costs: bool,
) -> SharedBookingRead:
    return SharedBookingRead(
        id=booking.id,
        trip_id=booking.trip_id,
        booking_type=booking.booking_type,
        status=booking.status,
        title=booking.title,
        provider=booking.provider,
        confirmation_code=booking.confirmation_code if include_pnrs else None,
        quoted_cost=booking.quoted_cost if include_costs else None,
        quoted_currency=booking.quoted_currency if include_costs else None,
        source_reference=booking.source_reference if include_pnrs else None,
        notes=booking.notes,
        sort_order=booking.sort_order,
        segments=booking.segments,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
    )


def _build_shared_attachments(
    workspace: TripWorkspaceRead,
    token_str: str,
    include_attachments: bool,
    draft_booking_ids: set[uuid.UUID],
) -> list[SharedAttachmentRead]:
    if not include_attachments:
        return []
    return [
        SharedAttachmentRead(
            id=attachment.id,
            booking_id=attachment.booking_id,
            filename=attachment.filename,
            mime_type=attachment.mime_type,
            size_bytes=attachment.size_bytes,
            sha256=attachment.sha256,
            content_url=f"/api/share/{token_str}/attachments/{attachment.id}/content",
            created_at=attachment.created_at,
        )
        for attachment in workspace.attachments
        if attachment.booking_id is None or attachment.booking_id not in draft_booking_ids
    ]


def build_shared_trip_view(
    workspace: TripWorkspaceRead,
    token_row: ShareTokenPolicy,
) -> SharedTripViewRead:
    """Transform an internal TripWorkspaceRead into a redacted SharedTripViewRead."""
    visibility = SharedVisibilityRead(
        include_pnrs=token_row.include_pnrs,
        include_attachments=token_row.include_attachments,
        include_costs=token_row.include_costs,
        include_checklists=token_row.include_checklists,
        include_private_notes=token_row.include_private_notes,
    )
    draft_booking_ids = {
        booking.id for booking in workspace.bookings if booking.status == "draft"
    }
    bookings = [
        _build_shared_booking(booking, token_row.include_pnrs, token_row.include_costs)
        for booking in workspace.bookings
        if booking.status != "draft"
    ]
    travel_notes = [
        note
        for note in workspace.travel_notes
        if token_row.include_private_notes or not note.is_private
    ]
    return SharedTripViewRead(
        visibility=visibility,
        trip=_build_shared_trip_summary(workspace, token_row.include_costs),
        legs=workspace.legs,
        days=workspace.days,
        itinerary_items=workspace.itinerary_items,
        checklists=workspace.checklists if token_row.include_checklists else [],
        travel_notes=travel_notes,
        bookings=bookings,
        attachments=_build_shared_attachments(
            workspace,
            token_row.token,
            token_row.include_attachments,
            draft_booking_ids,
        ),
        places=workspace.places,
        route_estimates=workspace.route_estimates,
    )
