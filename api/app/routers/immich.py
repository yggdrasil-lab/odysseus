"""Author-only REST router for lazy private Immich trip photos and thumbnail proxy."""

import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.adapters import ImmichClientAdapter
from app.config import Settings
from app.db import get_db
from app.dependencies import get_app_settings, get_immich_adapter
from app.schemas import TripPhotosResponseRead
from app.services import immich_service

router = APIRouter(prefix="/trips/{trip_id}/photos", tags=["Immich"])


@router.get("", response_model=TripPhotosResponseRead)
def get_trip_photos(
    trip_id: uuid.UUID,
    db: Session = Depends(get_db),
    adapter: ImmichClientAdapter = Depends(get_immich_adapter),
    app_settings: Settings = Depends(get_app_settings),
) -> TripPhotosResponseRead:
    """Return private Immich photos grouped by Trip Day, degrading cleanly if offline."""
    return immich_service.get_trip_photos(db, trip_id, adapter, app_settings)


@router.get("/{asset_id}/thumbnail")
def get_trip_photo_thumbnail(
    trip_id: uuid.UUID,
    asset_id: str,
    db: Session = Depends(get_db),
    adapter: ImmichClientAdapter = Depends(get_immich_adapter),
    app_settings: Settings = Depends(get_app_settings),
) -> Response:
    """Proxy a private Immich asset thumbnail without leaking upstream API keys."""
    payload = immich_service.get_trip_photo_thumbnail(db, trip_id, asset_id, adapter, app_settings)
    return Response(
        content=payload.content_bytes,
        media_type=payload.media_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Robots-Tag": "noindex, nofollow",
        },
    )
