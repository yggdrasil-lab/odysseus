"""External OSRM routing adapter with bounded timeout and fail-loud upstream errors."""

from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict

from app.domain.errors import DomainUpstreamError, DomainValidationError
from app.domain.places import validate_coordinates, validate_travel_mode

OSRM_BASE_URL = "https://router.project-osrm.org"
OSRM_TIMEOUT_SECONDS = 4.0
OSRM_PROFILE_MAP: dict[str, str] = {
    "drive": "driving",
    "walk": "foot",
}


class RoadRouteResult(BaseModel):
    """Normalized road/foot route returned by OSRM."""

    model_config = ConfigDict(frozen=True)

    distance_meters: int
    duration_minutes: int
    geometry_geojson: dict[str, object]


class RoutingAdapter(Protocol):
    """Protocol for street/foot routing providers."""

    def route(
        self,
        from_lat: float,
        from_lon: float,
        to_lat: float,
        to_lon: float,
        travel_mode: str,
    ) -> RoadRouteResult:
        """Compute route metrics and GeoJSON geometry between two points."""


class OsrmRoutingAdapter:
    """Public OSRM routing adapter bounded to a 4-second timeout."""

    def __init__(
        self,
        base_url: str = OSRM_BASE_URL,
        timeout: float = OSRM_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._transport = transport

    def route(
        self,
        from_lat: float,
        from_lon: float,
        to_lat: float,
        to_lon: float,
        travel_mode: str,
    ) -> RoadRouteResult:
        """Fetch OSRM route geometry, distance, and duration for drive or walk mode."""
        validate_travel_mode(travel_mode)
        validate_coordinates(from_lat, from_lon)
        validate_coordinates(to_lat, to_lon)
        profile = OSRM_PROFILE_MAP.get(travel_mode)
        if profile is None:
            raise DomainValidationError(f"Travel mode '{travel_mode}' is not routed via OSRM.")

        url = (
            f"{self._base_url}/route/v1/{profile}/"
            f"{from_lon},{from_lat};{to_lon},{to_lat}"
        )
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.get(url, params={"overview": "full", "geometries": "geojson"})
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise DomainUpstreamError(f"OSRM request failed: {exc}") from exc

        routes = payload.get("routes") if isinstance(payload, dict) else None
        if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
            raise DomainUpstreamError("OSRM returned no routes.")

        primary = routes[0]
        geometry = primary.get("geometry")
        if not isinstance(geometry, dict) or geometry.get("type") != "LineString":
            raise DomainUpstreamError("OSRM returned invalid route geometry.")
        distance_meters = int(round(float(primary["distance"])))
        duration_seconds = float(primary["duration"])
        duration_minutes = 0 if distance_meters == 0 else max(1, int(round(duration_seconds / 60.0)))
        return RoadRouteResult(
            distance_meters=distance_meters,
            duration_minutes=duration_minutes,
            geometry_geojson=geometry,
        )
