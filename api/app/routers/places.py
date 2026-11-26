"""Thin REST router for saved trip places, Photon search, and URL resolution."""

import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.adapters import GeocoderAdapter, UrlResolverAdapter
from app.db import get_db
from app.dependencies import get_geocoder_adapter, get_url_resolver_adapter
from app.schemas import (
    PlaceCreate,
    PlaceRead,
    PlaceSearchCandidateRead,
    PlaceUpdate,
    ResolveUrlRequest,
    ResolveUrlResponse,
)
from app.services import place_service

router = APIRouter(prefix="/trips/{trip_id}/places", tags=["Places"])


@router.get("/search", response_model=list[PlaceSearchCandidateRead])
def search_places(
    trip_id: uuid.UUID,
    q: str = Query(min_length=1, max_length=200),
    db: Session = Depends(get_db),
    geocoder: GeocoderAdapter = Depends(get_geocoder_adapter),
) -> list[PlaceSearchCandidateRead]:
    """Search places via Photon OSM geocoder without storing upstream records."""
    candidates = place_service.search_places(db, trip_id, q, geocoder)
    return [PlaceSearchCandidateRead.model_validate(item) for item in candidates]


@router.post("/resolve-url", response_model=ResolveUrlResponse)
def resolve_place_url(
    trip_id: uuid.UUID,
    payload: ResolveUrlRequest,
    db: Session = Depends(get_db),
    resolver: UrlResolverAdapter = Depends(get_url_resolver_adapter),
) -> ResolveUrlResponse:
    """Resolve an allowlisted Google Maps share URL into coordinates and exempt ID."""
    resolved = place_service.resolve_place_url(db, trip_id, payload.url, resolver)
    return ResolveUrlResponse.model_validate(resolved)


@router.get("", response_model=list[PlaceRead])
def list_places(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[PlaceRead]:
    """List saved places for a trip."""
    return [PlaceRead.model_validate(place) for place in place_service.list_places(db, trip_id)]


@router.post("", response_model=PlaceRead, status_code=status.HTTP_201_CREATED)
def create_place(
    trip_id: uuid.UUID,
    payload: PlaceCreate,
    db: Session = Depends(get_db),
) -> PlaceRead:
    """Save a place pin or backlog candidate to a trip."""
    return PlaceRead.model_validate(place_service.create_place(db, trip_id, payload))


@router.patch("/{place_id}", response_model=PlaceRead)
def update_place(
    trip_id: uuid.UUID,
    place_id: uuid.UUID,
    payload: PlaceUpdate,
    db: Session = Depends(get_db),
) -> PlaceRead:
    """Update a saved trip place."""
    return PlaceRead.model_validate(place_service.update_place(db, trip_id, place_id, payload))


@router.delete("/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_place(
    trip_id: uuid.UUID,
    place_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete a saved trip place."""
    place_service.delete_place(db, trip_id, place_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
