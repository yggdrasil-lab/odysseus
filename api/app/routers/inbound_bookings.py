"""Thin REST router for reviewing, assigning, and dismissing unassigned inbound bookings."""

import uuid

from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.routers.attachments import build_attachment_response
from app.schemas import AssignBookingRequest, BookingRead, UnassignedBookingRead
from app.services import inbound_booking_service

router = APIRouter(prefix="/bookings/unassigned", tags=["Inbound Bookings"])


@router.get("", response_model=list[UnassignedBookingRead])
def list_unassigned_bookings(db: Session = Depends(get_db)) -> list[UnassignedBookingRead]:
    """List unassigned inbound draft bookings with nested attachment metadata."""
    return [
        UnassignedBookingRead.model_validate(item)
        for item in inbound_booking_service.list_unassigned_bookings(db)
    ]


@router.get("/{booking_id}/attachments/{attachment_id}/content")
def get_unassigned_attachment_content(
    booking_id: uuid.UUID,
    attachment_id: uuid.UUID,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    range_header: str | None = Header(default=None, alias="Range"),
    db: Session = Depends(get_db),
) -> Response:
    """Stream unassigned attachment bytes with ETag/304, Accept-Ranges, and 206 support."""
    attachment = inbound_booking_service.get_unassigned_attachment_content(
        db, booking_id, attachment_id
    )
    return build_attachment_response(attachment, if_none_match, range_header)


@router.post("/{booking_id}/assign", response_model=BookingRead)
def assign_unassigned_booking(
    booking_id: uuid.UUID,
    payload: AssignBookingRequest,
    db: Session = Depends(get_db),
) -> BookingRead:
    """Assign an unassigned inbound booking and its attachments to a trip."""
    booking = inbound_booking_service.assign_unassigned_booking(
        db,
        booking_id,
        payload.trip_id,
        confirm=payload.confirm,
    )
    return BookingRead.model_validate(booking)


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_unassigned_booking(
    booking_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Dismiss an unassigned inbound booking and purge its attachment blobs."""
    inbound_booking_service.delete_unassigned_booking(db, booking_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
