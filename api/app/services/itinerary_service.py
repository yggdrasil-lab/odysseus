"""Application service for scheduled and backlog ItineraryItems."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.timezones import compute_item_utc_bounds
from app.models import ItineraryItem
from app.schemas import ItineraryItemCreate, ItineraryItemUpdate
from app.services.ownership import (
    reject_explicit_nulls,
    require_day_for_trip,
    require_itinerary_item_for_trip,
    require_trip,
)

REQUIRED_ITEM_UPDATE_FIELDS = ("title", "category", "status", "sync_to_chronos", "sort_order")


def list_itinerary_items(db: Session, trip_id: uuid.UUID) -> list[ItineraryItem]:
    """List all scheduled and backlog itinerary items for a trip."""
    require_trip(db, trip_id)
    return list(
        db.scalars(
            select(ItineraryItem)
            .where(ItineraryItem.trip_id == trip_id)
            .order_by(ItineraryItem.sort_order, ItineraryItem.start_utc, ItineraryItem.created_at)
        )
    )


def create_itinerary_item(
    db: Session,
    trip_id: uuid.UUID,
    payload: ItineraryItemCreate,
) -> ItineraryItem:
    """Create a scheduled or backlog item and compute UTC bounds from local + IANA TZ."""
    require_trip(db, trip_id)
    if payload.day_id is not None:
        require_day_for_trip(db, trip_id, payload.day_id)

    start_utc, end_utc = compute_item_utc_bounds(
        payload.start_local,
        payload.start_tz,
        payload.end_local,
        payload.end_tz,
    )
    item = ItineraryItem(
        trip_id=trip_id,
        start_utc=start_utc,
        end_utc=end_utc,
        **payload.model_dump(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_itinerary_item(
    db: Session,
    trip_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: ItineraryItemUpdate,
) -> ItineraryItem:
    """Update an itinerary item, enforce cross-trip day ownership, and recompute UTC bounds."""
    require_trip(db, trip_id)
    item = require_itinerary_item_for_trip(db, trip_id, item_id)
    reject_explicit_nulls(payload, REQUIRED_ITEM_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True)

    if "day_id" in updates and updates["day_id"] is not None:
        require_day_for_trip(db, trip_id, updates["day_id"])

    next_start_local = updates["start_local"] if "start_local" in updates else item.start_local
    next_start_tz = updates["start_tz"] if "start_tz" in updates else item.start_tz
    next_end_local = updates["end_local"] if "end_local" in updates else item.end_local
    next_end_tz = updates["end_tz"] if "end_tz" in updates else item.end_tz

    start_utc, end_utc = compute_item_utc_bounds(
        next_start_local,
        next_start_tz,
        next_end_local,
        next_end_tz,
    )
    for field, value in updates.items():
        setattr(item, field, value)
    item.start_utc = start_utc
    item.end_utc = end_utc

    db.commit()
    db.refresh(item)
    return item


def delete_itinerary_item(db: Session, trip_id: uuid.UUID, item_id: uuid.UUID) -> None:
    """Delete an itinerary item belonging to trip_id."""
    require_trip(db, trip_id)
    item = require_itinerary_item_for_trip(db, trip_id, item_id)
    db.delete(item)
    db.commit()
