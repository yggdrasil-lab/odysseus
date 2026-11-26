"""Thin REST router for scheduled and backlog itinerary items."""

import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import ItineraryItemCreate, ItineraryItemRead, ItineraryItemUpdate
from app.services import itinerary_service

router = APIRouter(prefix="/trips/{trip_id}/itinerary-items", tags=["Itinerary"])


@router.get("", response_model=list[ItineraryItemRead])
def list_itinerary_items(
    trip_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> list[ItineraryItemRead]:
    """List scheduled and backlog itinerary items for a trip."""
    return [
        ItineraryItemRead.model_validate(item)
        for item in itinerary_service.list_itinerary_items(db, trip_id)
    ]


@router.post("", response_model=ItineraryItemRead, status_code=status.HTTP_201_CREATED)
def create_itinerary_item(
    trip_id: uuid.UUID,
    payload: ItineraryItemCreate,
    db: Session = Depends(get_db),
) -> ItineraryItemRead:
    """Create a scheduled or backlog itinerary item."""
    return ItineraryItemRead.model_validate(
        itinerary_service.create_itinerary_item(db, trip_id, payload)
    )


@router.patch("/{item_id}", response_model=ItineraryItemRead)
def update_itinerary_item(
    trip_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: ItineraryItemUpdate,
    db: Session = Depends(get_db),
) -> ItineraryItemRead:
    """Update an itinerary item and recompute UTC timestamps."""
    return ItineraryItemRead.model_validate(
        itinerary_service.update_itinerary_item(db, trip_id, item_id, payload)
    )


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_itinerary_item(
    trip_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete an itinerary item."""
    itinerary_service.delete_itinerary_item(db, trip_id, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
