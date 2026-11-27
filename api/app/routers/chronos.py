"""Thin REST router for Chronos travel mode preview and synchronization."""

import uuid

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.adapters import ChronosClientAdapter
from app.db import get_db
from app.dependencies import get_chronos_client_adapter
from app.schemas import ChronosPreviewRead, ChronosSyncRequest, ChronosSyncResultRead
from app.services import chronos_sync_service

router = APIRouter(prefix="/trips/{trip_id}/chronos", tags=["Chronos"])


@router.get("/preview", response_model=ChronosPreviewRead)
def get_chronos_preview(
    trip_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> ChronosPreviewRead:
    """Preview Chronos sync eligibility and projected trip anchor commitments."""
    return chronos_sync_service.get_chronos_preview(db=db, trip_id=trip_id)


@router.post("/sync", response_model=ChronosSyncResultRead)
def sync_trip_to_chronos(
    trip_id: uuid.UUID,
    payload: ChronosSyncRequest = Body(default_factory=ChronosSyncRequest),
    db: Session = Depends(get_db),
    chronos: ChronosClientAdapter = Depends(get_chronos_client_adapter),
) -> ChronosSyncResultRead:
    """Sync or disable trip travel mode overlay and anchor commitments in Chronos."""
    return chronos_sync_service.sync_trip_to_chronos(
        db=db,
        trip_id=trip_id,
        payload=payload,
        chronos=chronos,
    )
