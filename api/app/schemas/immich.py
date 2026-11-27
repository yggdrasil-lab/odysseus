"""Frozen Pydantic schemas for private Immich photo strip responses."""

from datetime import date, datetime
from typing import Literal
import uuid

from pydantic import BaseModel, ConfigDict

ImmichPhotoStatus = Literal["available", "offline", "unconfigured"]
ImmichPhotoSource = Literal["album", "date_range", "none"]


class ImmichPhotoItemRead(BaseModel):
    """Single Immich photo asset mapped to Odysseus proxy and web URLs."""

    model_config = ConfigDict(frozen=True)

    asset_id: str
    original_filename: str | None = None
    captured_at: datetime | None = None
    local_date: date | None = None
    thumbnail_url: str
    web_url: str | None = None
    thumbhash: str | None = None


class ImmichDayPhotosRead(BaseModel):
    """Immich photos grouped onto a single Odysseus Trip Day."""

    model_config = ConfigDict(frozen=True)

    day_id: uuid.UUID
    date: date
    photos: list[ImmichPhotoItemRead]


class TripPhotosResponseRead(BaseModel):
    """Author-only lazy photo strip response with explicit degraded states."""

    model_config = ConfigDict(frozen=True)

    trip_id: uuid.UUID
    status: ImmichPhotoStatus
    source: ImmichPhotoSource
    message: str | None = None
    total_photos: int
    days: list[ImmichDayPhotosRead]
    ungrouped_photos: list[ImmichPhotoItemRead]
