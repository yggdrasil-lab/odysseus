"""Pure domain helpers for offline PMTiles bounding boxes, paths, and bundle hashing."""

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from app.domain.errors import DomainValidationError
from app.domain.places import validate_coordinates

MAX_MAPPACK_ZOOM = 14
DEFAULT_BBOX_PADDING_DEG = 0.08
MIN_MERCATOR_LAT = -85.0
MAX_MERCATOR_LAT = 85.0
MIN_LON = -180.0
MAX_LON = 180.0


def validate_max_zoom(max_zoom: int) -> int:
    """Validate that max_zoom is an integer within 1..MAX_MAPPACK_ZOOM."""
    if isinstance(max_zoom, bool) or not isinstance(max_zoom, int):
        raise DomainValidationError("max_zoom must be an integer.")
    if not (1 <= max_zoom <= MAX_MAPPACK_ZOOM):
        raise DomainValidationError(f"max_zoom must be between 1 and {MAX_MAPPACK_ZOOM}.")
    return max_zoom


def validate_bbox(
    west: float,
    south: float,
    east: float,
    north: float,
) -> tuple[float, float, float, float]:
    """Validate finite Web Mercator bounding box coordinates with west < east and south < north."""
    coords = (west, south, east, north)
    if not all(math.isfinite(val) for val in coords):
        raise DomainValidationError("Bounding box coordinates must be finite numbers.")
    if not (MIN_LON <= west < east <= MAX_LON):
        raise DomainValidationError("Bounding box longitude must satisfy -180 <= west < east <= 180.")
    if not (MIN_MERCATOR_LAT <= south < north <= MAX_MERCATOR_LAT):
        raise DomainValidationError("Bounding box latitude must satisfy -85 <= south < north <= 85.")
    return float(west), float(south), float(east), float(north)


def compute_padded_bbox(
    coords: list[tuple[float, float]],
    padding_deg: float = DEFAULT_BBOX_PADDING_DEG,
) -> tuple[float, float, float, float]:
    """Compute a clamped (west, south, east, north) box from (lat, lon) points."""
    if not coords:
        raise DomainValidationError("At least one place coordinate is required to derive a map pack bbox.")
    if not math.isfinite(padding_deg) or padding_deg <= 0:
        raise DomainValidationError("Bbox padding_deg must be a positive finite number.")

    validated = [validate_coordinates(lat, lon) for lat, lon in coords]
    lats = [lat for lat, _ in validated]
    lons = [lon for _, lon in validated]

    west = max(MIN_LON, min(lons) - padding_deg)
    south = max(MIN_MERCATOR_LAT, min(lats) - padding_deg)
    east = min(MAX_LON, max(lons) + padding_deg)
    north = min(MAX_MERCATOR_LAT, max(lats) + padding_deg)
    return validate_bbox(west, south, east, north)


def safe_mappack_path(mappacks_dir: Path, filename: str) -> Path:
    """Resolve a single-component .pmtiles filename strictly inside mappacks_dir."""
    cleaned = filename.strip()
    if not cleaned or Path(cleaned).name != cleaned or "/" in cleaned or "\\" in cleaned:
        raise DomainValidationError("Invalid map pack filename.")
    if cleaned in {".", ".."} or not cleaned.endswith(".pmtiles"):
        raise DomainValidationError("Map pack filename must be a single .pmtiles file.")

    base_dir = mappacks_dir.resolve()
    candidate = (base_dir / cleaned).resolve()
    if candidate.parent != base_dir:
        raise DomainValidationError("Map pack path escapes configured storage directory.")
    return candidate


def compute_workspace_sha256(workspace_payload: dict[str, Any]) -> str:
    """Compute deterministic SHA-256 hex digest for a serialized TripWorkspace payload."""
    canonical = json.dumps(
        workspace_payload,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
