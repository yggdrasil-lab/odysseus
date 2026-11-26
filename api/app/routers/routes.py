"""Thin REST router for day-level route estimation and manual overrides."""

import uuid

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.adapters import RoutingAdapter
from app.db import get_db
from app.dependencies import get_routing_adapter
from app.schemas import (
    DayRoutesComputeRequest,
    DayRoutesComputeResponse,
    RouteEstimateRead,
    RouteEstimateUpdate,
)
from app.services import route_service

router = APIRouter(prefix="/trips/{trip_id}", tags=["Routes"])


@router.get("/routes", response_model=list[RouteEstimateRead])
def list_routes(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[RouteEstimateRead]:
    """List all route estimates for a trip."""
    return [RouteEstimateRead.model_validate(route) for route in route_service.list_routes(db, trip_id)]


@router.post("/days/{day_id}/routes/compute", response_model=DayRoutesComputeResponse)
def compute_day_routes(
    trip_id: uuid.UUID,
    day_id: uuid.UUID,
    payload: DayRoutesComputeRequest | None = Body(default=None),
    db: Session = Depends(get_db),
    routing_adapter: RoutingAdapter = Depends(get_routing_adapter),
) -> DayRoutesComputeResponse:
    """Compute or refresh consecutive place-to-place route estimates for a day."""
    travel_mode = payload.travel_mode if payload is not None else "drive"
    routes, fallback_used, warning = route_service.compute_day_routes(
        db=db,
        trip_id=trip_id,
        day_id=day_id,
        travel_mode=travel_mode,
        routing_adapter=routing_adapter,
    )
    return DayRoutesComputeResponse(
        day_id=day_id,
        routes=[RouteEstimateRead.model_validate(route) for route in routes],
        fallback_used=fallback_used,
        warning=warning,
    )


@router.patch("/routes/{route_id}", response_model=RouteEstimateRead)
def update_route_estimate(
    trip_id: uuid.UUID,
    route_id: uuid.UUID,
    payload: RouteEstimateUpdate,
    db: Session = Depends(get_db),
) -> RouteEstimateRead:
    """Manually override route distance, duration, mode, or geometry."""
    return RouteEstimateRead.model_validate(
        route_service.update_route_estimate(db, trip_id, route_id, payload)
    )
