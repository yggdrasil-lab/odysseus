"""Thin REST router for travel notes."""

import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import TravelNoteCreate, TravelNoteRead, TravelNoteUpdate
from app.services import checklist_note_service

router = APIRouter(prefix="/trips/{trip_id}/notes", tags=["Notes"])


@router.get("", response_model=list[TravelNoteRead])
def list_notes(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[TravelNoteRead]:
    """List travel notes for a trip."""
    return [
        TravelNoteRead.model_validate(note)
        for note in checklist_note_service.list_notes(db, trip_id)
    ]


@router.post("", response_model=TravelNoteRead, status_code=status.HTTP_201_CREATED)
def create_note(
    trip_id: uuid.UUID,
    payload: TravelNoteCreate,
    db: Session = Depends(get_db),
) -> TravelNoteRead:
    """Create a travel note."""
    return TravelNoteRead.model_validate(checklist_note_service.create_note(db, trip_id, payload))


@router.patch("/{note_id}", response_model=TravelNoteRead)
def update_note(
    trip_id: uuid.UUID,
    note_id: uuid.UUID,
    payload: TravelNoteUpdate,
    db: Session = Depends(get_db),
) -> TravelNoteRead:
    """Update a travel note."""
    return TravelNoteRead.model_validate(
        checklist_note_service.update_note(db, trip_id, note_id, payload)
    )


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    trip_id: uuid.UUID,
    note_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete a travel note."""
    checklist_note_service.delete_note(db, trip_id, note_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
