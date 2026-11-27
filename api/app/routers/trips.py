"""Thin REST router for trips, workspace, legs, and days."""

import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.domain.markdown_export import render_trip_markdown
from app.schemas import (
    DayCreate,
    DayRead,
    DayUpdate,
    LegCreate,
    LegRead,
    LegUpdate,
    TripCreate,
    TripRead,
    TripUpdate,
    TripWorkspaceRead,
)
from app.services import leg_day_service, trip_service

router = APIRouter(prefix="/trips", tags=["Trips"])


@router.get("", response_model=list[TripRead])
def list_trips(db: Session = Depends(get_db)) -> list[TripRead]:
    """List all trips ordered newest-first."""
    return [TripRead.model_validate(trip) for trip in trip_service.list_trips(db)]


@router.post("", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(payload: TripCreate, db: Session = Depends(get_db)) -> TripRead:
    """Create a new trip."""
    return TripRead.model_validate(trip_service.create_trip(db, payload))


@router.get("/{trip_id}", response_model=TripRead)
def get_trip(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> TripRead:
    """Fetch a single trip by ID."""
    return TripRead.model_validate(trip_service.require_trip(db, trip_id))


@router.patch("/{trip_id}", response_model=TripRead)
def update_trip(
    trip_id: uuid.UUID,
    payload: TripUpdate,
    db: Session = Depends(get_db),
) -> TripRead:
    """Update trip metadata or dates."""
    return TripRead.model_validate(trip_service.update_trip(db, trip_id, payload))


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    """Delete a trip and all nested planning data."""
    trip_service.delete_trip(db, trip_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{trip_id}/workspace", response_model=TripWorkspaceRead)
def get_trip_workspace(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> TripWorkspaceRead:
    """Hydrate complete Variant A trip workspace."""
    return trip_service.get_trip_workspace(db, trip_id)


@router.get("/{trip_id}/export/markdown")
def export_trip_markdown(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    """Render and download a one-way Obsidian Vault Markdown snapshot for a trip."""
    workspace = trip_service.get_trip_workspace(db, trip_id)
    markdown = render_trip_markdown(workspace)
    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{workspace.trip.slug}.md"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/{trip_id}/legs", response_model=list[LegRead])
def list_legs(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[LegRead]:
    """List destination legs for a trip."""
    return [LegRead.model_validate(leg) for leg in leg_day_service.list_legs(db, trip_id)]


@router.post("/{trip_id}/legs", response_model=LegRead, status_code=status.HTTP_201_CREATED)
def create_leg(
    trip_id: uuid.UUID,
    payload: LegCreate,
    db: Session = Depends(get_db),
) -> LegRead:
    """Create a destination leg and idempotently provision overlapping days."""
    return LegRead.model_validate(leg_day_service.create_leg(db, trip_id, payload))


@router.patch("/{trip_id}/legs/{leg_id}", response_model=LegRead)
def update_leg(
    trip_id: uuid.UUID,
    leg_id: uuid.UUID,
    payload: LegUpdate,
    db: Session = Depends(get_db),
) -> LegRead:
    """Update a destination leg."""
    return LegRead.model_validate(leg_day_service.update_leg(db, trip_id, leg_id, payload))


@router.delete("/{trip_id}/legs/{leg_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leg(
    trip_id: uuid.UUID,
    leg_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete a destination leg."""
    leg_day_service.delete_leg(db, trip_id, leg_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{trip_id}/days", response_model=list[DayRead])
def list_days(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[DayRead]:
    """List calendar days for a trip."""
    return [DayRead.model_validate(day) for day in leg_day_service.list_days(db, trip_id)]


@router.post("/{trip_id}/days", response_model=DayRead, status_code=status.HTTP_201_CREATED)
def create_day(
    trip_id: uuid.UUID,
    payload: DayCreate,
    db: Session = Depends(get_db),
) -> DayRead:
    """Explicitly create a calendar day for a trip."""
    return DayRead.model_validate(leg_day_service.create_day(db, trip_id, payload))


@router.patch("/{trip_id}/days/{day_id}", response_model=DayRead)
def update_day(
    trip_id: uuid.UUID,
    day_id: uuid.UUID,
    payload: DayUpdate,
    db: Session = Depends(get_db),
) -> DayRead:
    """Update a calendar day."""
    return DayRead.model_validate(leg_day_service.update_day(db, trip_id, day_id, payload))


@router.delete("/{trip_id}/days/{day_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_day(
    trip_id: uuid.UUID,
    day_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete a calendar day."""
    leg_day_service.delete_day(db, trip_id, day_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
