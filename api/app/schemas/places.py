"""Frozen Pydantic schemas for places, geocoding, URL resolution, and routing."""

from datetime import datetime
from typing import Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field

PlaceCategory = Literal["lodging", "airport", "food", "activity", "transit", "other"]
TravelMode = Literal["walk", "drive", "transit", "flight", "ferry"]
RouteSource = Literal["geodesic", "osrm", "manual"]


class PlaceCreate(BaseModel):
    """Payload to create a saved map pin or backlog place."""

    model_config = ConfigDict(frozen=True)

    name: str = Field(min_length=1, max_length=250)
    category: PlaceCategory = "other"
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    address: str | None = Field(default=None, max_length=400)
    notes: str | None = None
    external_map_url: str | None = Field(default=None, max_length=1000)
    google_place_id: str | None = Field(default=None, max_length=160)
    osm_id: str | None = Field(default=None, max_length=80)
    is_backlog: bool = False


class PlaceUpdate(BaseModel):
    """Partial update payload for a saved place."""

    model_config = ConfigDict(frozen=True)

    name: str | None = Field(default=None, min_length=1, max_length=250)
    category: PlaceCategory | None = None
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    address: str | None = Field(default=None, max_length=400)
    notes: str | None = None
    external_map_url: str | None = Field(default=None, max_length=1000)
    google_place_id: str | None = Field(default=None, max_length=160)
    osm_id: str | None = Field(default=None, max_length=80)
    is_backlog: bool | None = None


class PlaceRead(BaseModel):
    """Serialized saved trip place."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    name: str
    category: PlaceCategory
    latitude: float
    longitude: float
    address: str | None
    notes: str | None
    external_map_url: str | None
    google_place_id: str | None
    osm_id: str | None
    is_backlog: bool
    created_at: datetime
    updated_at: datetime


class PlaceSearchCandidateRead(BaseModel):
    """Serialized Photon geocoder search candidate."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    name: str
    latitude: float
    longitude: float
    address: str | None = None
    osm_id: str | None = None
    category_hint: str | None = None


class ResolveUrlRequest(BaseModel):
    """Request payload to resolve a Google Maps share URL."""

    model_config = ConfigDict(frozen=True)

    url: str = Field(min_length=1, max_length=1000)


class ResolveUrlResponse(BaseModel):
    """Minimal exempt place details extracted from a Google Maps URL."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    resolved_url: str
    latitude: float
    longitude: float
    suggested_name: str | None = None
    google_place_id: str | None = None


class RouteEstimateRead(BaseModel):
    """Serialized day-level route estimate between two saved places."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    day_id: uuid.UUID
    from_place_id: uuid.UUID
    to_place_id: uuid.UUID
    travel_mode: TravelMode
    source: RouteSource
    distance_meters: int
    duration_minutes: int
    geometry_geojson: dict[str, object] | None
    manual_override: bool
    created_at: datetime
    updated_at: datetime


class DayRoutesComputeRequest(BaseModel):
    """Optional compute request specifying desired travel_mode."""

    model_config = ConfigDict(frozen=True)

    travel_mode: TravelMode = "drive"


class DayRoutesComputeResponse(BaseModel):
    """Computed day route estimates with explicit OSRM fallback status."""

    model_config = ConfigDict(frozen=True)

    day_id: uuid.UUID
    routes: list[RouteEstimateRead]
    fallback_used: bool = False
    warning: str | None = None


class RouteEstimateUpdate(BaseModel):
    """Partial update payload to manually override a route estimate."""

    model_config = ConfigDict(frozen=True)

    travel_mode: TravelMode | None = None
    distance_meters: int | None = Field(default=None, ge=0)
    duration_minutes: int | None = Field(default=None, ge=0)
    geometry_geojson: dict[str, object] | None = None
    manual_override: bool | None = None
