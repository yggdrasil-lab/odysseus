"""Application service for lazy private Immich trip photos and thumbnail proxy."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.immich import (
    IMMICH_OFFLINE_MESSAGE,
    ImmichClientAdapter,
    ImmichThumbnailPayload,
    validate_immich_asset_id,
)
from app.config import Settings
from app.domain.errors import DomainUpstreamError
from app.domain.immich import group_immich_photos_by_day
from app.models import Day
from app.schemas.immich import TripPhotosResponseRead
from app.services.ownership import require_trip


def get_trip_photos(
    db: Session,
    trip_id: uuid.UUID,
    adapter: ImmichClientAdapter,
    app_settings: Settings,
) -> TripPhotosResponseRead:
    """Fetch and group trip photos from Immich, degrading cleanly when offline."""
    trip = require_trip(db, trip_id)
    if not app_settings.immich_api_url.strip() or not app_settings.immich_api_key.strip():
        return TripPhotosResponseRead(
            trip_id=trip.id,
            status="unconfigured",
            source="none",
            message="Immich integration is not configured.",
            total_photos=0,
            days=[],
            ungrouped_photos=[],
        )

    album_id = (trip.immich_album_id or "").strip()
    if album_id:
        source = "album"
    elif trip.start_date is not None and trip.end_date is not None:
        source = "date_range"
    else:
        return TripPhotosResponseRead(
            trip_id=trip.id,
            status="available",
            source="none",
            message=None,
            total_photos=0,
            days=[],
            ungrouped_photos=[],
        )

    trip_days = list(db.scalars(select(Day).where(Day.trip_id == trip.id).order_by(Day.date)))
    try:
        if source == "album":
            assets = adapter.search_album_photos(album_id)
        else:
            assert trip.start_date is not None and trip.end_date is not None
            assets = adapter.search_date_range_photos(trip.start_date, trip.end_date)
    except DomainUpstreamError:
        return TripPhotosResponseRead(
            trip_id=trip.id,
            status="offline",
            source=source,
            message=IMMICH_OFFLINE_MESSAGE,
            total_photos=0,
            days=[],
            ungrouped_photos=[],
        )

    return group_immich_photos_by_day(
        trip_id=trip.id,
        assets=assets,
        trip_days=trip_days,
        start_date=trip.start_date,
        end_date=trip.end_date,
        domain_name=app_settings.domain_name,
        source=source,
    )


def get_trip_photo_thumbnail(
    db: Session,
    trip_id: uuid.UUID,
    asset_id: str,
    adapter: ImmichClientAdapter,
    app_settings: Settings,
) -> ImmichThumbnailPayload:
    """Validate trip ownership and asset ID, then proxy thumbnail bytes from Immich."""
    require_trip(db, trip_id)
    cleaned_id = validate_immich_asset_id(asset_id)
    if not app_settings.immich_api_url.strip() or not app_settings.immich_api_key.strip():
        raise DomainUpstreamError(IMMICH_OFFLINE_MESSAGE)
    return adapter.fetch_thumbnail(cleaned_id)
