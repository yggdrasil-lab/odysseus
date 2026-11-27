"""Frozen Pydantic schemas for Chronos travel mode preview and synchronization."""

from datetime import date as CalendarDate
from typing import Literal
import uuid

from pydantic import BaseModel, ConfigDict

from app.schemas.trips import ChronosOverlayMode


class ChronosAnchorPreviewRead(BaseModel):
    """Serialized preview of a single Chronos travel anchor commitment."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    external_ref: str
    source_kind: Literal["booking_segment", "itinerary_item"]
    source_id: uuid.UUID
    title: str
    target_date: CalendarDate
    start_minute: int
    end_minute: int
    nudge_mode: Literal["none", "boundary"]
    urgent_quiet_bypass: bool
    notes: str


class ChronosPreviewRead(BaseModel):
    """Read-only preview of trip eligibility and projected Chronos anchors."""

    model_config = ConfigDict(frozen=True)

    trip_id: uuid.UUID
    trip_slug: str
    eligible: bool
    ineligible_reason: str | None = None
    sync_enabled: bool
    overlay_mode: ChronosOverlayMode
    confirmed_segment_count: int
    synced_item_count: int
    anchors: list[ChronosAnchorPreviewRead]


class ChronosSyncRequest(BaseModel):
    """Optional overrides when triggering Chronos travel mode sync."""

    model_config = ConfigDict(frozen=True)

    enabled: bool | None = None
    overlay_mode: ChronosOverlayMode | None = None


class ChronosSyncResultRead(BaseModel):
    """Result summary returned after syncing or disabling Chronos travel mode."""

    model_config = ConfigDict(frozen=True)

    trip_id: uuid.UUID
    trip_slug: str
    sync_enabled: bool
    overlay_mode: ChronosOverlayMode
    overlay_active: bool
    upserted_count: int
    deleted_count: int
    anchors: list[ChronosAnchorPreviewRead]
