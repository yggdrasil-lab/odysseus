"""Application service for saved trip places, Photon search, and URL resolution."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters import GeocoderAdapter, PlaceSearchCandidate, ResolvedUrlPlace, UrlResolverAdapter
from app.domain.places import (
    validate_coordinates,
    validate_https_url,
    validate_place_category,
)
from app.models import Place
from app.schemas import PlaceCreate, PlaceUpdate
from app.services.ownership import reject_explicit_nulls, require_place_for_trip, require_trip

REQUIRED_PLACE_UPDATE_FIELDS = ("name", "category", "latitude", "longitude", "is_backlog")


def list_places(db: Session, trip_id: uuid.UUID) -> list[Place]:
    """List all saved places for a trip."""
    require_trip(db, trip_id)
    return list(db.scalars(select(Place).where(Place.trip_id == trip_id).order_by(Place.created_at)))


def create_place(db: Session, trip_id: uuid.UUID, payload: PlaceCreate) -> Place:
    """Create a validated place pin or backlog candidate for a trip."""
    require_trip(db, trip_id)
    validate_place_category(payload.category)
    validate_coordinates(payload.latitude, payload.longitude)
    data = payload.model_dump()
    if data["external_map_url"] is not None:
        data["external_map_url"] = validate_https_url(data["external_map_url"])

    place = Place(trip_id=trip_id, **data)
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


def update_place(
    db: Session,
    trip_id: uuid.UUID,
    place_id: uuid.UUID,
    payload: PlaceUpdate,
) -> Place:
    """Update a saved trip place with strict validation."""
    require_trip(db, trip_id)
    place = require_place_for_trip(db, trip_id, place_id)
    reject_explicit_nulls(payload, REQUIRED_PLACE_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True)

    if "category" in updates:
        validate_place_category(updates["category"])
    next_lat = updates.get("latitude", place.latitude)
    next_lon = updates.get("longitude", place.longitude)
    validate_coordinates(next_lat, next_lon)
    if "external_map_url" in updates and updates["external_map_url"] is not None:
        updates["external_map_url"] = validate_https_url(updates["external_map_url"])

    for field, value in updates.items():
        setattr(place, field, value)
    db.commit()
    db.refresh(place)
    return place


def delete_place(db: Session, trip_id: uuid.UUID, place_id: uuid.UUID) -> None:
    """Delete a saved place belonging to trip_id."""
    require_trip(db, trip_id)
    place = require_place_for_trip(db, trip_id, place_id)
    db.delete(place)
    db.commit()


def search_places(
    db: Session,
    trip_id: uuid.UUID,
    query: str,
    geocoder: GeocoderAdapter,
) -> list[PlaceSearchCandidate]:
    """Search candidate places via the configured geocoder adapter."""
    require_trip(db, trip_id)
    return geocoder.search(query)


def resolve_place_url(
    db: Session,
    trip_id: uuid.UUID,
    url: str,
    resolver: UrlResolverAdapter,
) -> ResolvedUrlPlace:
    """Resolve a Google Maps share URL into minimal exempt coordinates and identifiers."""
    require_trip(db, trip_id)
    return resolver.resolve_google_maps_url(url)
