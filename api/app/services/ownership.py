"""Cross-entity lookup and trip-ownership guards for Odysseus services."""

import uuid

from sqlalchemy.orm import Session

from app.domain.errors import DomainNotFoundError, DomainValidationError
from app.models import Checklist, ChecklistItem, Day, ItineraryItem, Leg, TravelNote, Trip


def require_trip(db: Session, trip_id: uuid.UUID) -> Trip:
    """Return Trip by ID or raise DomainNotFoundError."""
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise DomainNotFoundError(f"Trip {trip_id} not found.")
    return trip


def require_leg_for_trip(db: Session, trip_id: uuid.UUID, leg_id: uuid.UUID) -> Leg:
    """Return Leg belonging to trip_id or raise 404/422."""
    leg = db.get(Leg, leg_id)
    if leg is None:
        raise DomainNotFoundError(f"Leg {leg_id} not found.")
    if leg.trip_id != trip_id:
        raise DomainValidationError(f"Leg {leg_id} does not belong to trip {trip_id}.")
    return leg


def require_day_for_trip(db: Session, trip_id: uuid.UUID, day_id: uuid.UUID) -> Day:
    """Return Day belonging to trip_id or raise 404/422."""
    day = db.get(Day, day_id)
    if day is None:
        raise DomainNotFoundError(f"Day {day_id} not found.")
    if day.trip_id != trip_id:
        raise DomainValidationError(f"Day {day_id} does not belong to trip {trip_id}.")
    return day


def require_itinerary_item_for_trip(
    db: Session, trip_id: uuid.UUID, item_id: uuid.UUID
) -> ItineraryItem:
    """Return ItineraryItem belonging to trip_id or raise 404/422."""
    item = db.get(ItineraryItem, item_id)
    if item is None:
        raise DomainNotFoundError(f"Itinerary item {item_id} not found.")
    if item.trip_id != trip_id:
        raise DomainValidationError(f"Itinerary item {item_id} does not belong to trip {trip_id}.")
    return item


def require_checklist_for_trip(
    db: Session, trip_id: uuid.UUID, checklist_id: uuid.UUID
) -> Checklist:
    """Return Checklist belonging to trip_id or raise 404/422."""
    checklist = db.get(Checklist, checklist_id)
    if checklist is None:
        raise DomainNotFoundError(f"Checklist {checklist_id} not found.")
    if checklist.trip_id != trip_id:
        raise DomainValidationError(f"Checklist {checklist_id} does not belong to trip {trip_id}.")
    return checklist


def require_checklist_item_for_checklist(
    db: Session, checklist_id: uuid.UUID, item_id: uuid.UUID
) -> ChecklistItem:
    """Return ChecklistItem belonging to checklist_id or raise 404/422."""
    item = db.get(ChecklistItem, item_id)
    if item is None:
        raise DomainNotFoundError(f"Checklist item {item_id} not found.")
    if item.checklist_id != checklist_id:
        raise DomainValidationError(
            f"Checklist item {item_id} does not belong to checklist {checklist_id}."
        )
    return item


def require_note_for_trip(db: Session, trip_id: uuid.UUID, note_id: uuid.UUID) -> TravelNote:
    """Return TravelNote belonging to trip_id or raise 404/422."""
    note = db.get(TravelNote, note_id)
    if note is None:
        raise DomainNotFoundError(f"Travel note {note_id} not found.")
    if note.trip_id != trip_id:
        raise DomainValidationError(f"Travel note {note_id} does not belong to trip {trip_id}.")
    return note


def reject_explicit_nulls(payload: object, required_fields: tuple[str, ...]) -> None:
    """Reject explicit null assignments on non-nullable update fields."""
    fields_set = getattr(payload, "model_fields_set", set())
    for field_name in required_fields:
        if field_name in fields_set and getattr(payload, field_name) is None:
            raise DomainValidationError(f"Field '{field_name}' cannot be null.")
