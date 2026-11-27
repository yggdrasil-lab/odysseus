"""Frozen Pydantic schemas for offline PMTiles map packs and offline bundles."""

from datetime import datetime
from typing import TYPE_CHECKING, Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from app.schemas.planning import TripWorkspaceRead

MapPackStatus = Literal["ready", "failed"]


class MapPackCreate(BaseModel):
    """Payload to extract and store a bounded offline .pmtiles map pack."""

    model_config = ConfigDict(frozen=True)

    leg_id: uuid.UUID | None = None
    label: str | None = Field(default=None, max_length=200)
    bbox_west: float | None = None
    bbox_south: float | None = None
    bbox_east: float | None = None
    bbox_north: float | None = None
    max_zoom: int = 14
    source_url: str | None = Field(default=None, max_length=1000)


class MapPackRead(BaseModel):
    """Serialized metadata for a stored .pmtiles map pack."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    leg_id: uuid.UUID | None
    label: str
    status: MapPackStatus
    bbox_west: float
    bbox_south: float
    bbox_east: float
    bbox_north: float
    max_zoom: int
    filename: str
    size_bytes: int
    sha256: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class OfflineBundleAttachmentManifest(BaseModel):
    """Attachment manifest entry inside an offline trip bundle."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    booking_id: uuid.UUID | None
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    content_url: str


class OfflineBundleMapPackManifest(BaseModel):
    """Ready map pack manifest entry inside an offline trip bundle."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    leg_id: uuid.UUID | None
    label: str
    filename: str
    size_bytes: int
    sha256: str
    max_zoom: int
    bbox_west: float
    bbox_south: float
    bbox_east: float
    bbox_north: float
    file_url: str


class OfflineBundleRead(BaseModel):
    """Deterministic offline sync manifest bundling TripWorkspace, attachments, and map packs."""

    model_config = ConfigDict(frozen=True)

    bundle_version: int = 1
    generated_at: datetime
    workspace_sha256: str
    workspace: "TripWorkspaceRead"
    attachments: list[OfflineBundleAttachmentManifest]
    map_packs: list[OfflineBundleMapPackManifest]
