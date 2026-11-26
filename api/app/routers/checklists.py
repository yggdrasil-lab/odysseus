"""Thin REST router for typed checklists and checklist items."""

import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import (
    ChecklistCreate,
    ChecklistItemCreate,
    ChecklistItemRead,
    ChecklistItemUpdate,
    ChecklistRead,
    ChecklistUpdate,
)
from app.services import checklist_note_service

router = APIRouter(prefix="/trips/{trip_id}/checklists", tags=["Checklists"])


@router.get("", response_model=list[ChecklistRead])
def list_checklists(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[ChecklistRead]:
    """List checklists with items for a trip."""
    return [
        ChecklistRead.model_validate(checklist)
        for checklist in checklist_note_service.list_checklists(db, trip_id)
    ]


@router.post("", response_model=ChecklistRead, status_code=status.HTTP_201_CREATED)
def create_checklist(
    trip_id: uuid.UUID,
    payload: ChecklistCreate,
    db: Session = Depends(get_db),
) -> ChecklistRead:
    """Create a typed checklist."""
    return ChecklistRead.model_validate(checklist_note_service.create_checklist(db, trip_id, payload))


@router.patch("/{checklist_id}", response_model=ChecklistRead)
def update_checklist(
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    payload: ChecklistUpdate,
    db: Session = Depends(get_db),
) -> ChecklistRead:
    """Update a checklist."""
    return ChecklistRead.model_validate(
        checklist_note_service.update_checklist(db, trip_id, checklist_id, payload)
    )


@router.delete("/{checklist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist(
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete a checklist and its items."""
    checklist_note_service.delete_checklist(db, trip_id, checklist_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{checklist_id}/items",
    response_model=ChecklistItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_checklist_item(
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    payload: ChecklistItemCreate,
    db: Session = Depends(get_db),
) -> ChecklistItemRead:
    """Add an item to a checklist."""
    return ChecklistItemRead.model_validate(
        checklist_note_service.create_checklist_item(db, trip_id, checklist_id, payload)
    )


@router.patch("/{checklist_id}/items/{item_id}", response_model=ChecklistItemRead)
def update_checklist_item(
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: ChecklistItemUpdate,
    db: Session = Depends(get_db),
) -> ChecklistItemRead:
    """Update a checklist item."""
    return ChecklistItemRead.model_validate(
        checklist_note_service.update_checklist_item(db, trip_id, checklist_id, item_id, payload)
    )


@router.delete("/{checklist_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist_item(
    trip_id: uuid.UUID,
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete a checklist item."""
    checklist_note_service.delete_checklist_item(db, trip_id, checklist_id, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
