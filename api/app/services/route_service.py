"""Application service for day-level route estimation and manual overrides."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters import RoutingAdapter
from app.domain.errors import DomainUpstreamError
from app.domain.places import (
    build_geodesic_geojson,
    estimate_geodesic_duration_minutes,
    haversine_distance_meters,
    validate_travel_mode,
)
from app.models import ItineraryItem, Place, RouteEstimate
from app.schemas import RouteEstimateUpdate
from app.services.ownership import (
    reject_explicit_nulls,
    require_day_for_trip,
    require_route_for_trip,
    require_trip,
)

OSRM_ROUTABLE_MODES = frozenset({"drive", "walk"})
REQUIRED_ROUTE_UPDATE_FIELDS = (
    "travel_mode",
    "distance_meters",
    "duration_minutes",
    "manual_override",
)


def list_routes(db: Session, trip_id: uuid.UUID) -> list[RouteEstimate]:
    """List all cached or manually overridden route estimates for a trip."""
    require_trip(db, trip_id)
    return list(
        db.scalars(
            select(RouteEstimate)
            .where(RouteEstimate.trip_id == trip_id)
            .order_by(RouteEstimate.created_at)
        )
    )


def _ordered_day_places(db: Session, trip_id: uuid.UUID, day_id: uuid.UUID) -> list[Place]:
    rows = db.execute(
        select(ItineraryItem.place_id, Place)
        .join(Place, ItineraryItem.place_id == Place.id)
        .where(
            ItineraryItem.trip_id == trip_id,
            ItineraryItem.day_id == day_id,
            ItineraryItem.place_id.is_not(None),
        )
        .order_by(ItineraryItem.sort_order, ItineraryItem.start_utc, ItineraryItem.created_at)
    ).all()

    ordered: list[Place] = []
    for _, place in rows:
        if not ordered or ordered[-1].id != place.id:
            ordered.append(place)
    return ordered


def _compute_pair_estimate(
    from_place: Place,
    to_place: Place,
    travel_mode: str,
    routing_adapter: RoutingAdapter,
) -> tuple[str, int, int, dict[str, object], bool]:
    if travel_mode in OSRM_ROUTABLE_MODES:
        try:
            road = routing_adapter.route(
                from_place.latitude,
                from_place.longitude,
                to_place.latitude,
                to_place.longitude,
                travel_mode,
            )
            return (
                "osrm",
                road.distance_meters,
                road.duration_minutes,
                road.geometry_geojson,
                False,
            )
        except DomainUpstreamError:
            used_fallback = True
    else:
        used_fallback = False

    distance_meters = haversine_distance_meters(
        from_place.latitude,
        from_place.longitude,
        to_place.latitude,
        to_place.longitude,
    )
    duration_minutes = estimate_geodesic_duration_minutes(distance_meters, travel_mode)
    geometry = build_geodesic_geojson(
        from_place.latitude,
        from_place.longitude,
        to_place.latitude,
        to_place.longitude,
    )
    return "geodesic", distance_meters, duration_minutes, geometry, used_fallback


def _upsert_route_pair(
    db: Session,
    trip_id: uuid.UUID,
    day_id: uuid.UUID,
    from_place: Place,
    to_place: Place,
    travel_mode: str,
    existing: RouteEstimate | None,
    routing_adapter: RoutingAdapter,
) -> tuple[RouteEstimate, bool]:
    if existing is not None and existing.manual_override:
        return existing, False

    source, distance_meters, duration_minutes, geometry, used_fallback = _compute_pair_estimate(
        from_place,
        to_place,
        travel_mode,
        routing_adapter,
    )
    if existing is None:
        route = RouteEstimate(
            trip_id=trip_id,
            day_id=day_id,
            from_place_id=from_place.id,
            to_place_id=to_place.id,
            travel_mode=travel_mode,
            source=source,
            distance_meters=distance_meters,
            duration_minutes=duration_minutes,
            geometry_geojson=geometry,
            manual_override=False,
        )
        db.add(route)
        return route, used_fallback

    existing.travel_mode = travel_mode
    existing.source = source
    existing.distance_meters = distance_meters
    existing.duration_minutes = duration_minutes
    existing.geometry_geojson = geometry
    return existing, used_fallback


def compute_day_routes(
    db: Session,
    trip_id: uuid.UUID,
    day_id: uuid.UUID,
    travel_mode: str,
    routing_adapter: RoutingAdapter,
) -> tuple[list[RouteEstimate], bool, str | None]:
    """Compute consecutive day place-to-place routes with OSRM fallback to geodesic."""
    require_trip(db, trip_id)
    require_day_for_trip(db, trip_id, day_id)
    validate_travel_mode(travel_mode)

    stops = _ordered_day_places(db, trip_id, day_id)
    pairs = [(stops[idx], stops[idx + 1]) for idx in range(max(0, len(stops) - 1))]
    active_keys = {(pair[0].id, pair[1].id) for pair in pairs}

    existing_rows = list(
        db.scalars(select(RouteEstimate).where(RouteEstimate.day_id == day_id))
    )
    existing_by_pair = {
        (row.from_place_id, row.to_place_id): row for row in existing_rows
    }
    for row in existing_rows:
        if (row.from_place_id, row.to_place_id) not in active_keys and not row.manual_override:
            db.delete(row)

    results: list[RouteEstimate] = []
    fallback_used = False
    for from_place, to_place in pairs:
        existing = existing_by_pair.get((from_place.id, to_place.id))
        route, pair_fallback = _upsert_route_pair(
            db,
            trip_id,
            day_id,
            from_place,
            to_place,
            travel_mode,
            existing,
            routing_adapter,
        )
        fallback_used = fallback_used or pair_fallback
        results.append(route)

    db.commit()
    for route in results:
        db.refresh(route)
    warning = (
        "OSRM routing unavailable for one or more segments; geodesic estimates used."
        if fallback_used
        else None
    )
    return results, fallback_used, warning


def update_route_estimate(
    db: Session,
    trip_id: uuid.UUID,
    route_id: uuid.UUID,
    payload: RouteEstimateUpdate,
) -> RouteEstimate:
    """Apply manual route metrics/mode override while marking source='manual'."""
    require_trip(db, trip_id)
    route = require_route_for_trip(db, trip_id, route_id)
    reject_explicit_nulls(payload, REQUIRED_ROUTE_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True)

    if "travel_mode" in updates:
        validate_travel_mode(updates["travel_mode"])
    for field, value in updates.items():
        setattr(route, field, value)

    if "manual_override" not in updates:
        route.manual_override = True
    if route.manual_override:
        route.source = "manual"

    db.commit()
    db.refresh(route)
    return route
