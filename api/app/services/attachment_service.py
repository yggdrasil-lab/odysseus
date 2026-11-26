"""Application service for PostgreSQL-backed PDF/image attachments."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, defer

from app.domain.attachments import normalize_attachment
from app.models import Attachment
from app.services.ownership import (
    require_attachment_for_trip,
    require_booking_for_trip,
    require_trip,
)


def list_attachments(db: Session, trip_id: uuid.UUID) -> list[Attachment]:
    """List attachment metadata for a trip without loading binary blobs."""
    require_trip(db, trip_id)
    return list(
        db.scalars(
            select(Attachment)
            .where(Attachment.trip_id == trip_id)
            .options(defer(Attachment.content_bytes))
            .order_by(Attachment.created_at.desc())
        )
    )


def upload_attachment(
    db: Session,
    trip_id: uuid.UUID,
    filename: str,
    mime_type: str | None,
    raw_bytes: bytes,
    booking_id: uuid.UUID | None = None,
) -> Attachment:
    """Validate, normalize, extract text if PDF, and store attachment in PostgreSQL."""
    require_trip(db, trip_id)
    if booking_id is not None:
        require_booking_for_trip(db, trip_id, booking_id)

    normalized = normalize_attachment(filename, mime_type, raw_bytes)
    attachment = Attachment(
        trip_id=trip_id,
        booking_id=booking_id,
        filename=normalized.filename,
        mime_type=normalized.mime_type,
        size_bytes=normalized.size_bytes,
        sha256=normalized.sha256,
        content_bytes=normalized.content_bytes,
        extracted_text=normalized.extracted_text,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


def get_attachment_content(
    db: Session,
    trip_id: uuid.UUID,
    attachment_id: uuid.UUID,
) -> Attachment:
    """Fetch an attachment record including binary content for download/streaming."""
    require_trip(db, trip_id)
    return require_attachment_for_trip(db, trip_id, attachment_id)


def delete_attachment(db: Session, trip_id: uuid.UUID, attachment_id: uuid.UUID) -> None:
    """Delete an attachment belonging to trip_id."""
    require_trip(db, trip_id)
    attachment = require_attachment_for_trip(db, trip_id, attachment_id)
    db.delete(attachment)
    db.commit()
