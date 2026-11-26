"""Thin REST router for trip bookings and ordered segments."""

import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import BookingCreate, BookingRead, BookingUpdate
from app.services import booking_service

router = APIRouter(prefix="/trips/{trip_id}/bookings", tags=["Bookings"])


@router.get("", response_model=list[BookingRead])
def list_bookings(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[BookingRead]:
    """List bookings with ordered segments for a trip."""
    return [BookingRead.model_validate(b) for b in booking_service.list_bookings(db, trip_id)]


@router.post("", response_model=BookingRead, status_code=status.HTTP_201_CREATED)
def create_booking(
    trip_id: uuid.UUID,
    payload: BookingCreate,
    db: Session = Depends(get_db),
) -> BookingRead:
    """Create a booking and optional ordered flight/transit segments."""
    return BookingRead.model_validate(booking_service.create_booking(db, trip_id, payload))


@router.patch("/{booking_id}", response_model=BookingRead)
def update_booking(
    trip_id: uuid.UUID,
    booking_id: uuid.UUID,
    payload: BookingUpdate,
    db: Session = Depends(get_db),
) -> BookingRead:
    """Update booking metadata and atomically replace segments if supplied."""
    return BookingRead.model_validate(
        booking_service.update_booking(db, trip_id, booking_id, payload)
    )


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_booking(
    trip_id: uuid.UUID,
    booking_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete a booking and its segments."""
    booking_service.delete_booking(db, trip_id, booking_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
