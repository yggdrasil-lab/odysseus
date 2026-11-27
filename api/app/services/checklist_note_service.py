"""Application services for typed Checklists, ChecklistItems, and TravelNotes."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.domain.errors import DomainNotFoundError, DomainValidationError
from app.models import Checklist, ChecklistItem, TravelNote
from app.schemas import (
    ChecklistCreate,
    ChecklistItemCreate,
    ChecklistItemUpdate,
    ChecklistUpdate,
    TravelNoteCreate,
    TravelNoteUpdate,
)
from app.services.ownership import (
    reject_explicit_nulls,
    require_checklist_for_trip,
    require_checklist_item_for_checklist,
    require_day_for_trip,
    require_leg_for_trip,
    require_note_for_trip,
    require_trip,
)

REQUIRED_CHECKLIST_UPDATE_FIELDS = ("title", "list_type", "sort_order")
REQUIRED_CHECKLIST_ITEM_UPDATE_FIELDS = ("label", "is_completed", "sort_order")
REQUIRED_NOTE_UPDATE_FIELDS = ("title", "body", "is_private", "sort_order")


def list_checklists(db: Session, trip_id: uuid.UUID) -> list[Checklist]:
    """List checklists with nested items for a trip."""
    require_trip(db, trip_id)
    return list(
        db.scalars(
            select(Checklist)
            .where(Checklist.trip_id == trip_id)
            .options(selectinload(Checklist.items))
            .order_by(Checklist.sort_order, Checklist.created_at)
        )
    )


def _reload_checklist_or_fail(db: Session, checklist_id: uuid.UUID) -> Checklist:
    loaded = db.scalar(
        select(Checklist).where(Checklist.id == checklist_id).options(selectinload(Checklist.items))
    )
    if loaded is None:
        raise DomainNotFoundError(f"Checklist {checklist_id} not found after persistence.")
    return loaded


def create_checklist(db: Session, trip_id: uuid.UUID, payload: ChecklistCreate) -> Checklist:
    """Create a typed checklist under trip_id."""
    require_trip(db, trip_id)
    checklist = Checklist(trip_id=trip_id, **payload.model_dump())
    db.add(checklist)
    db.commit()
    return _reload_checklist_or_fail(db, checklist.id)


def update_checklist(
    db: Session,
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    payload: ChecklistUpdate,
) -> Checklist:
    """Update a trip checklist."""
    require_trip(db, trip_id)
    checklist = require_checklist_for_trip(db, trip_id, checklist_id)
    reject_explicit_nulls(payload, REQUIRED_CHECKLIST_UPDATE_FIELDS)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(checklist, field, value)
    db.commit()
    return _reload_checklist_or_fail(db, checklist.id)


def delete_checklist(db: Session, trip_id: uuid.UUID, checklist_id: uuid.UUID) -> None:
    """Delete a trip checklist and cascade its items."""
    require_trip(db, trip_id)
    checklist = require_checklist_for_trip(db, trip_id, checklist_id)
    db.delete(checklist)
    db.commit()


def create_checklist_item(
    db: Session,
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    payload: ChecklistItemCreate,
) -> ChecklistItem:
    """Add an item to a checklist, verifying optional leg_id belongs to trip_id."""
    require_trip(db, trip_id)
    require_checklist_for_trip(db, trip_id, checklist_id)
    if payload.leg_id is not None:
        require_leg_for_trip(db, trip_id, payload.leg_id)

    item = ChecklistItem(checklist_id=checklist_id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_checklist_item(
    db: Session,
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: ChecklistItemUpdate,
) -> ChecklistItem:
    """Update a checklist item, verifying checklist and optional leg ownership."""
    require_trip(db, trip_id)
    require_checklist_for_trip(db, trip_id, checklist_id)
    item = require_checklist_item_for_checklist(db, checklist_id, item_id)
    reject_explicit_nulls(payload, REQUIRED_CHECKLIST_ITEM_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True)

    if "leg_id" in updates and updates["leg_id"] is not None:
        require_leg_for_trip(db, trip_id, updates["leg_id"])

    for field, value in updates.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


def delete_checklist_item(
    db: Session,
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
) -> None:
    """Delete a checklist item."""
    require_trip(db, trip_id)
    require_checklist_for_trip(db, trip_id, checklist_id)
    item = require_checklist_item_for_checklist(db, checklist_id, item_id)
    db.delete(item)
    db.commit()


def _find_matching_checklist_item(
    db: Session,
    checklist_id: uuid.UUID,
    cleaned_label: str,
) -> ChecklistItem | None:
    existing = list(
        db.scalars(
            select(ChecklistItem)
            .where(ChecklistItem.checklist_id == checklist_id)
            .order_by(ChecklistItem.sort_order, ChecklistItem.created_at)
        )
    )
    target = cleaned_label.lower()
    return next(
        (candidate for candidate in existing if candidate.label.strip().lower() == target),
        None,
    )


def upsert_checklist_item(
    db: Session,
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    label: str,
    is_checked: bool,
    item_id: uuid.UUID | None = None,
    sort_order: int | None = None,
) -> ChecklistItem:
    """Update an item by item_id or case-insensitive stripped label, or create a new item."""
    require_trip(db, trip_id)
    require_checklist_for_trip(db, trip_id, checklist_id)
    cleaned_label = label.strip()
    if not cleaned_label or len(cleaned_label) > 250:
        raise DomainValidationError("Checklist item label must be between 1 and 250 characters.")

    if item_id is not None:
        item = require_checklist_item_for_checklist(db, checklist_id, item_id)
        item.label = cleaned_label
    else:
        item = _find_matching_checklist_item(db, checklist_id, cleaned_label)
        if item is None:
            item = ChecklistItem(checklist_id=checklist_id, label=cleaned_label)
            db.add(item)

    item.is_completed = is_checked
    if sort_order is not None:
        item.sort_order = sort_order
    db.commit()
    db.refresh(item)
    return item


def list_notes(db: Session, trip_id: uuid.UUID) -> list[TravelNote]:
    """List travel notes for a trip ordered by sort_order then created_at."""
    require_trip(db, trip_id)
    return list(
        db.scalars(
            select(TravelNote)
            .where(TravelNote.trip_id == trip_id)
            .order_by(TravelNote.sort_order, TravelNote.created_at)
        )
    )


def create_note(db: Session, trip_id: uuid.UUID, payload: TravelNoteCreate) -> TravelNote:
    """Create a travel note, verifying optional leg_id and day_id belong to trip_id."""
    require_trip(db, trip_id)
    if payload.leg_id is not None:
        require_leg_for_trip(db, trip_id, payload.leg_id)
    if payload.day_id is not None:
        require_day_for_trip(db, trip_id, payload.day_id)

    note = TravelNote(trip_id=trip_id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_note(
    db: Session,
    trip_id: uuid.UUID,
    note_id: uuid.UUID,
    payload: TravelNoteUpdate,
) -> TravelNote:
    """Update a travel note, verifying optional leg_id and day_id belong to trip_id."""
    require_trip(db, trip_id)
    note = require_note_for_trip(db, trip_id, note_id)
    reject_explicit_nulls(payload, REQUIRED_NOTE_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True)

    if "leg_id" in updates and updates["leg_id"] is not None:
        require_leg_for_trip(db, trip_id, updates["leg_id"])
    if "day_id" in updates and updates["day_id"] is not None:
        require_day_for_trip(db, trip_id, updates["day_id"])

    for field, value in updates.items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, trip_id: uuid.UUID, note_id: uuid.UUID) -> None:
    """Delete a travel note."""
    require_trip(db, trip_id)
    note = require_note_for_trip(db, trip_id, note_id)
    db.delete(note)
    db.commit()
