"""Pure domain helpers for places, Google Maps URL allowlisting, and geodesic routing."""

from dataclasses import dataclass
import ipaddress
import math
import re
from urllib.parse import parse_qs, unquote_plus, urlsplit

from app.domain.errors import DomainValidationError

PLACE_CATEGORIES = frozenset({"lodging", "airport", "food", "activity", "transit", "other"})
TRAVEL_MODES = frozenset({"walk", "drive", "transit", "flight", "ferry"})
ROUTE_SOURCES = frozenset({"geodesic", "osrm", "manual"})

MODE_SPEED_KMH: dict[str, float] = {
    "walk": 4.5,
    "drive": 50.0,
    "transit": 35.0,
    "flight": 750.0,
    "ferry": 30.0,
}

GOOGLE_SHORTENER_HOSTS = frozenset({"maps.app.goo.gl", "goo.gl"})
GOOGLE_MAPS_PATH_HOSTS = frozenset({"goo.gl", "google.com", "www.google.com"})
GOOGLE_MAPS_ANY_PATH_HOSTS = frozenset({"maps.app.goo.gl", "maps.google.com"})

PIN_COORD_RE = re.compile(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)")
VIEWPORT_COORD_RE = re.compile(r"/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")
PAIR_COORD_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")
PLACE_NAME_RE = re.compile(r"/maps/place/([^/]+)")
PLACE_ID_DATA_RE = re.compile(r"!1s(ChIJ[A-Za-z0-9_-]+)")
PLACE_ID_VALUE_RE = re.compile(r"^(ChIJ[A-Za-z0-9_-]+)$")


@dataclass(frozen=True)
class ExtractedGooglePlace:
    """Minimal exempt coordinates and identifiers extracted from a Google Maps URL."""

    resolved_url: str
    latitude: float
    longitude: float
    suggested_name: str | None
    google_place_id: str | None


def validate_place_category(category: str) -> str:
    """Validate place category."""
    if category not in PLACE_CATEGORIES:
        raise DomainValidationError(f"Unsupported place category: {category}")
    return category


def validate_travel_mode(travel_mode: str) -> str:
    """Validate route travel_mode."""
    if travel_mode not in TRAVEL_MODES:
        raise DomainValidationError(f"Unsupported travel_mode: {travel_mode}")
    return travel_mode


def validate_coordinates(latitude: float, longitude: float) -> tuple[float, float]:
    """Validate finite WGS84 coordinates."""
    if not (math.isfinite(latitude) and math.isfinite(longitude)):
        raise DomainValidationError("Coordinates must be finite numbers.")
    if not (-90.0 <= latitude <= 90.0):
        raise DomainValidationError("Latitude must be between -90 and 90.")
    if not (-180.0 <= longitude <= 180.0):
        raise DomainValidationError("Longitude must be between -180 and 180.")
    return float(latitude), float(longitude)


def validate_https_url(url: str) -> str:
    """Ensure a user-supplied external map URL is HTTPS without credentials."""
    parsed = urlsplit(url.strip())
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise DomainValidationError("External map URL must use HTTPS with a valid hostname.")
    if parsed.username is not None or parsed.password is not None:
        raise DomainValidationError("External map URL must not embed credentials.")
    return url.strip()


def validate_google_maps_url(url: str) -> str:
    """Enforce strict SSRF allowlist for Google Maps URL resolution."""
    cleaned = validate_https_url(url)
    parsed = urlsplit(cleaned)
    if parsed.port not in (None, 443):
        raise DomainValidationError("Non-standard ports are not allowed for Google Maps URLs.")

    hostname = (parsed.hostname or "").lower().rstrip(".")
    try:
        ipaddress.ip_address(hostname)
        raise DomainValidationError("IP literal hosts are not allowed.")
    except ValueError:
        pass

    if hostname in GOOGLE_MAPS_ANY_PATH_HOSTS:
        return cleaned
    if hostname in GOOGLE_MAPS_PATH_HOSTS and (
        parsed.path == "/maps" or parsed.path.startswith("/maps/")
    ):
        return cleaned
    raise DomainValidationError(f"Host/path is not in the Google Maps allowlist: {hostname}")


def is_google_shortener_url(url: str) -> bool:
    """Return True if URL points to a Google shortener host requiring HTTP resolution."""
    hostname = (urlsplit(url).hostname or "").lower().rstrip(".")
    return hostname in GOOGLE_SHORTENER_HOSTS


def _extract_coords_from_url(url: str) -> tuple[float, float] | None:
    parsed = urlsplit(url)
    for pattern in (PIN_COORD_RE, VIEWPORT_COORD_RE):
        match = pattern.search(url)
        if match:
            return validate_coordinates(float(match.group(1)), float(match.group(2)))

    query_params = parse_qs(parsed.query)
    for key in ("q", "ll", "query", "destination"):
        for raw_value in query_params.get(key, []):
            pair_match = PAIR_COORD_RE.match(raw_value)
            if pair_match:
                return validate_coordinates(
                    float(pair_match.group(1)),
                    float(pair_match.group(2)),
                )
    return None


def _extract_suggested_name(url: str) -> str | None:
    parsed = urlsplit(url)
    match = PLACE_NAME_RE.search(parsed.path)
    if not match:
        return None
    candidate = unquote_plus(match.group(1)).strip()
    if not candidate or PAIR_COORD_RE.match(candidate):
        return None
    return candidate[:250]


def _extract_google_place_id(url: str) -> str | None:
    parsed = urlsplit(url)
    query_params = parse_qs(parsed.query)
    for key in ("query_place_id", "place_id"):
        for raw_value in query_params.get(key, []):
            if PLACE_ID_VALUE_RE.match(raw_value.strip()):
                return raw_value.strip()
    data_match = PLACE_ID_DATA_RE.search(url)
    return data_match.group(1) if data_match else None


def extract_google_maps_place_info(url: str) -> ExtractedGooglePlace | None:
    """Extract coordinates, optional name, and exempt place_id from a Google Maps URL."""
    coords = _extract_coords_from_url(url)
    if coords is None:
        return None
    latitude, longitude = coords
    return ExtractedGooglePlace(
        resolved_url=url,
        latitude=latitude,
        longitude=longitude,
        suggested_name=_extract_suggested_name(url),
        google_place_id=_extract_google_place_id(url),
    )


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """Compute great-circle distance in meters between two WGS84 points."""
    validate_coordinates(lat1, lon1)
    validate_coordinates(lat2, lon2)
    earth_radius_m = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    return int(round(earth_radius_m * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))))


def estimate_geodesic_duration_minutes(distance_meters: int, travel_mode: str) -> int:
    """Estimate travel duration in minutes from distance and travel mode."""
    validate_travel_mode(travel_mode)
    if distance_meters <= 0:
        return 0
    speed_kmh = MODE_SPEED_KMH[travel_mode]
    minutes = (distance_meters / 1000.0) / speed_kmh * 60.0
    return max(1, int(round(minutes)))


def build_geodesic_geojson(lat1: float, lon1: float, lat2: float, lon2: float) -> dict[str, object]:
    """Build a 2-point GeoJSON LineString geometry for geodesic fallback routes."""
    return {
        "type": "LineString",
        "coordinates": [[lon1, lat1], [lon2, lat2]],
    }
