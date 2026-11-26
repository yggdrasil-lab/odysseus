"""Application service for trip bookings and ordered transit/flight segments."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.domain.bookings import (
    compute_segment_utc_bounds,
    validate_booking_status,
    validate_booking_type,
)
from app.domain.errors import DomainConflictError
from app.models import Booking, BookingSegment
from app.schemas import BookingCreate, BookingSegmentCreate, BookingUpdate
from app.services.ownership import (
    reject_explicit_nulls,
    require_booking_for_trip,
    require_trip,
)

REQUIRED_BOOKING_UPDATE_FIELDS = (
    "booking_type",
    "status",
    "title",
    "sort_order",
    "segments",
)


def _build_segment(payload: BookingSegmentCreate) -> BookingSegment:
    departure_utc, arrival_utc = compute_segment_utc_bounds(
        payload.departure_local,
        payload.departure_tz,
        payload.arrival_local,
        payload.arrival_tz,
    )
    return BookingSegment(
        departure_utc=departure_utc,
        arrival_utc=arrival_utc,
        **payload.model_dump(),
    )


def list_bookings(db: Session, trip_id: uuid.UUID) -> list[Booking]:
    """List bookings with ordered segments for a trip."""
    require_trip(db, trip_id)
    return list(
        db.scalars(
            select(Booking)
            .where(Booking.trip_id == trip_id)
            .options(selectinload(Booking.segments))
            .order_by(Booking.sort_order, Booking.created_at)
        )
    )


def create_booking(db: Session, trip_id: uuid.UUID, payload: BookingCreate) -> Booking:
    """Create a booking and optional ordered segments for a trip."""
    require_trip(db, trip_id)
    validate_booking_type(payload.booking_type)
    validate_booking_status(payload.status)

    if payload.source_email_message_id:
        duplicate = db.scalar(
            select(Booking.id).where(
                Booking.source_email_message_id == payload.source_email_message_id
            )
        )
        if duplicate is not None:
            raise DomainConflictError(
                f"Booking for source_email_message_id '{payload.source_email_message_id}' already exists."
            )

    booking_fields = payload.model_dump(exclude={"segments"})
    booking = Booking(trip_id=trip_id, **booking_fields)
    booking.segments = [_build_segment(segment) for segment in payload.segments]
    db.add(booking)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainConflictError("Duplicate booking source_email_message_id.") from exc
    db.refresh(booking)
    return require_booking_with_segments(db, booking.id)


def require_booking_with_segments(db: Session, booking_id: uuid.UUID) -> Booking:
    """Reload a booking with its ordered segments eager-loaded."""
    booking = db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(selectinload(Booking.segments))
    )
    assert booking is not None
    return booking


def update_booking(
    db: Session,
    trip_id: uuid.UUID,
    booking_id: uuid.UUID,
    payload: BookingUpdate,
) -> Booking:
    """Update booking metadata and atomically replace segments when supplied."""
    require_trip(db, trip_id)
    booking = require_booking_for_trip(db, trip_id, booking_id)
    reject_explicit_nulls(payload, REQUIRED_BOOKING_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True, exclude={"segments"})

    if "booking_type" in updates:
        validate_booking_type(updates["booking_type"])
    if "status" in updates:
        validate_booking_status(updates["status"])

    for field, value in updates.items():
        setattr(booking, field, value)

    if payload.segments is not None:
        new_segments = [_build_segment(segment) for segment in payload.segments]
        booking.segments.clear()
        db.flush()
        booking.segments.extend(new_segments)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainConflictError("Duplicate booking source_email_message_id.") from exc
    db.refresh(booking)
    return require_booking_with_segments(db, booking.id)


def delete_booking(db: Session, trip_id: uuid.UUID, booking_id: uuid.UUID) -> None:
    """Delete a booking and its cascaded segments."""
    require_trip(db, trip_id)
    booking = require_booking_for_trip(db, trip_id, booking_id)
    db.delete(booking)
    db.commit()
