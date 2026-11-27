"""Frozen Pydantic schemas for trips, legs, and days."""

from datetime import date as CalendarDate, datetime
from decimal import Decimal
from typing import Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field

TripStatus = Literal["planning", "booked", "active", "completed", "archived"]
ChronosOverlayMode = Literal["suppress_all_grid_blocks", "keep_work_blocks"]


class TripCreate(BaseModel):
    """Payload to create a new trip."""

    model_config = ConfigDict(frozen=True)

    title: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=120)
    status: TripStatus = "planning"
    start_date: CalendarDate | None = None
    end_date: CalendarDate | None = None
    home_timezone: str = Field(default="Pacific/Auckland", min_length=1, max_length=64)
    budget_nzd: Decimal | None = Field(default=None, ge=0)
    immich_album_id: str | None = Field(default=None, max_length=128)
    vault_note_path: str | None = Field(default=None, max_length=500)
    chronos_sync_enabled: bool = False
    chronos_overlay_mode: ChronosOverlayMode = "suppress_all_grid_blocks"
    summary: str | None = None


class TripUpdate(BaseModel):
    """Partial update payload for an existing trip."""

    model_config = ConfigDict(frozen=True)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, min_length=1, max_length=120)
    status: TripStatus | None = None
    start_date: CalendarDate | None = None
    end_date: CalendarDate | None = None
    home_timezone: str | None = Field(default=None, min_length=1, max_length=64)
    budget_nzd: Decimal | None = Field(default=None, ge=0)
    immich_album_id: str | None = Field(default=None, max_length=128)
    vault_note_path: str | None = Field(default=None, max_length=500)
    chronos_sync_enabled: bool | None = None
    chronos_overlay_mode: ChronosOverlayMode | None = None
    summary: str | None = None


class TripRead(BaseModel):
    """Serialized trip representation."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    title: str
    slug: str
    status: TripStatus
    start_date: CalendarDate | None
    end_date: CalendarDate | None
    home_timezone: str
    budget_nzd: Decimal | None
    immich_album_id: str | None
    vault_note_path: str | None
    chronos_sync_enabled: bool
    chronos_overlay_mode: ChronosOverlayMode
    summary: str | None
    created_at: datetime
    updated_at: datetime


class LegCreate(BaseModel):
    """Payload to create a destination leg inside a trip."""

    model_config = ConfigDict(frozen=True)

    name: str = Field(min_length=1, max_length=200)
    primary_city: str = Field(min_length=1, max_length=120)
    country_code: str | None = Field(default=None, max_length=16)
    base_timezone: str = Field(min_length=1, max_length=64)
    start_date: CalendarDate
    end_date: CalendarDate
    color: str = Field(default="#38bdf8", min_length=1, max_length=32)
    sort_order: int = 0
    notes: str | None = None


class LegUpdate(BaseModel):
    """Partial update payload for an existing destination leg."""

    model_config = ConfigDict(frozen=True)

    name: str | None = Field(default=None, min_length=1, max_length=200)
    primary_city: str | None = Field(default=None, min_length=1, max_length=120)
    country_code: str | None = Field(default=None, max_length=16)
    base_timezone: str | None = Field(default=None, min_length=1, max_length=64)
    start_date: CalendarDate | None = None
    end_date: CalendarDate | None = None
    color: str | None = Field(default=None, min_length=1, max_length=32)
    sort_order: int | None = None
    notes: str | None = None


class LegRead(BaseModel):
    """Serialized leg representation."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    name: str
    primary_city: str
    country_code: str | None
    base_timezone: str
    start_date: CalendarDate
    end_date: CalendarDate
    color: str
    sort_order: int
    notes: str | None
    created_at: datetime
    updated_at: datetime


class DayCreate(BaseModel):
    """Payload to explicitly create a trip day."""

    model_config = ConfigDict(frozen=True)

    date: CalendarDate
    title: str | None = Field(default=None, max_length=200)
    notes: str | None = None


class DayUpdate(BaseModel):
    """Partial update payload for an existing trip day."""

    model_config = ConfigDict(frozen=True)

    date: CalendarDate | None = None
    title: str | None = Field(default=None, max_length=200)
    notes: str | None = None


class DayRead(BaseModel):
    """Serialized trip day representation."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    date: CalendarDate
    title: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
