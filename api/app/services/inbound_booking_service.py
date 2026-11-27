"""Application service for reviewing, assigning, and dismissing unassigned inbound bookings."""

import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, defer, selectinload

from app.domain.errors import DomainConflictError, DomainNotFoundError
from app.models import Attachment, Booking
from app.services.booking_service import require_booking_with_segments
from app.services.ownership import require_trip


def _require_unassigned_booking(db: Session, booking_id: uuid.UUID) -> Booking:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise DomainNotFoundError(f"Booking {booking_id} not found.")
    if booking.trip_id is not None:
        raise DomainConflictError(f"Booking {booking_id} is already assigned to a trip.")
    return booking


def list_unassigned_bookings(db: Session) -> list[Booking]:
    """List unassigned inbound draft bookings with deferred attachment binary blobs."""
    return list(
        db.scalars(
            select(Booking)
            .where(Booking.trip_id.is_(None))
            .options(
                selectinload(Booking.segments),
                selectinload(Booking.attachments).defer(Attachment.content_bytes),
            )
            .order_by(Booking.created_at.desc())
        )
    )


def get_unassigned_attachment_content(
    db: Session,
    booking_id: uuid.UUID,
    attachment_id: uuid.UUID,
) -> Attachment:
    """Fetch binary attachment content belonging to an unassigned booking."""
    booking = db.get(Booking, booking_id)
    if booking is None or booking.trip_id is not None:
        raise DomainNotFoundError(f"Unassigned booking {booking_id} not found.")
    attachment = db.get(Attachment, attachment_id)
    if (
        attachment is None
        or attachment.booking_id != booking_id
        or attachment.trip_id is not None
    ):
        raise DomainNotFoundError(f"Attachment {attachment_id} not found.")
    return attachment


def assign_unassigned_booking(
    db: Session,
    booking_id: uuid.UUID,
    trip_id: uuid.UUID,
    confirm: bool = True,
) -> Booking:
    """Assign an unassigned inbound booking and its attachments to a trip."""
    require_trip(db, trip_id)
    booking = _require_unassigned_booking(db, booking_id)
    booking.trip_id = trip_id
    if confirm:
        booking.status = "confirmed"
    db.execute(
        update(Attachment)
        .where(Attachment.booking_id == booking.id)
        .values(trip_id=trip_id)
    )
    db.commit()
    return require_booking_with_segments(db, booking.id)


def delete_unassigned_booking(db: Session, booking_id: uuid.UUID) -> None:
    """Dismiss an unassigned inbound booking and purge its unassigned attachment blobs."""
    booking = _require_unassigned_booking(db, booking_id)
    db.execute(
        delete(Attachment).where(
            Attachment.booking_id == booking.id,
            Attachment.trip_id.is_(None),
        )
    )
    db.delete(booking)
    db.commit()
