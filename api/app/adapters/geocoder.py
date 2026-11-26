"""External geocoding (Photon OSM) and SSRF-hardened Google Maps URL resolution."""

import ipaddress
import socket
from typing import Protocol
from urllib.parse import urljoin, urlsplit

import httpx
from pydantic import BaseModel, ConfigDict

from app.domain.errors import DomainUpstreamError, DomainValidationError
from app.domain.places import (
    extract_google_maps_place_info,
    is_google_shortener_url,
    validate_coordinates,
    validate_google_maps_url,
)

PHOTON_BASE_URL = "https://photon.komoot.io/api"
ADAPTER_TIMEOUT_SECONDS = 4.0
MAX_REDIRECT_HOPS = 5


class PlaceSearchCandidate(BaseModel):
    """Normalized geocoder candidate returned from Photon search."""

    model_config = ConfigDict(frozen=True)

    name: str
    latitude: float
    longitude: float
    address: str | None = None
    osm_id: str | None = None
    category_hint: str | None = None


class ResolvedUrlPlace(BaseModel):
    """Minimal exempt place details resolved from a Google Maps share URL."""

    model_config = ConfigDict(frozen=True)

    resolved_url: str
    latitude: float
    longitude: float
    suggested_name: str | None = None
    google_place_id: str | None = None


class GeocoderAdapter(Protocol):
    """Protocol for place geocoding providers."""

    def search(self, query: str, limit: int = 8) -> list[PlaceSearchCandidate]:
        """Search places matching query text."""


class UrlResolverAdapter(Protocol):
    """Protocol for resolving Google Maps URLs into coordinates."""

    def resolve_google_maps_url(self, url: str) -> ResolvedUrlPlace:
        """Resolve a Google Maps URL into exempt coordinates and optional identifiers."""


def _map_osm_category(props: dict[str, object]) -> str | None:
    osm_key = str(props.get("osm_key") or "").lower()
    osm_value = str(props.get("osm_value") or "").lower()
    if osm_key == "aeroway" or osm_value in {"aerodrome", "airport"}:
        return "airport"
    if osm_value in {"hotel", "hostel", "motel", "guest_house", "apartment"}:
        return "lodging"
    if osm_value in {"restaurant", "cafe", "bakery", "bar", "pub", "fast_food"}:
        return "food"
    if osm_key in {"railway", "public_transport"} or osm_value in {"station", "ferry_terminal"}:
        return "transit"
    if osm_key in {"tourism", "leisure", "historic"}:
        return "activity"
    return None


def _format_photon_address(props: dict[str, object]) -> str | None:
    street = " ".join(
        str(part)
        for part in (props.get("housenumber"), props.get("street"))
        if part
    ).strip()
    parts = [
        part
        for part in (
            street or None,
            props.get("city") or props.get("town") or props.get("village"),
            props.get("state"),
            props.get("country"),
        )
        if isinstance(part, str) and part.strip()
    ]
    return ", ".join(parts)[:400] if parts else None


def _feature_to_candidate(feature: object) -> PlaceSearchCandidate | None:
    if not isinstance(feature, dict):
        return None
    geometry = feature.get("geometry")
    props = feature.get("properties")
    if not isinstance(geometry, dict) or not isinstance(props, dict):
        return None
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or len(coords) < 2:
        return None
    lon, lat = validate_coordinates(float(coords[1]), float(coords[0]))
    address = _format_photon_address(props)
    name = str(props.get("name") or "").strip() or (address or f"{lat:.5f}, {lon:.5f}")
    osm_type = props.get("osm_type")
    osm_num = props.get("osm_id")
    osm_id = f"{osm_type}:{osm_num}" if osm_type and osm_num else None
    return PlaceSearchCandidate(
        name=name[:250],
        latitude=lat,
        longitude=lon,
        address=address,
        osm_id=osm_id,
        category_hint=_map_osm_category(props),
    )


class PhotonGeocoderAdapter:
    """OpenStreetMap Photon geocoding adapter with bounded timeout."""

    def __init__(
        self,
        base_url: str = PHOTON_BASE_URL,
        timeout: float = ADAPTER_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = base_url
        self._timeout = timeout
        self._transport = transport

    def search(self, query: str, limit: int = 8) -> list[PlaceSearchCandidate]:
        """Query Photon API and map GeoJSON features to PlaceSearchCandidate DTOs."""
        cleaned = query.strip()
        if not cleaned:
            raise DomainValidationError("Place search query must not be empty.")
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.get(
                    self._base_url,
                    params={"q": cleaned, "limit": max(1, min(limit, 20))},
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise DomainUpstreamError(f"Photon geocoder request failed: {exc}") from exc

        features = payload.get("features") if isinstance(payload, dict) else None
        if not isinstance(features, list):
            raise DomainUpstreamError("Photon geocoder returned malformed response.")
        candidates: list[PlaceSearchCandidate] = []
        for feature in features:
            candidate = _feature_to_candidate(feature)
            if candidate is not None:
                candidates.append(candidate)
        return candidates


def _assert_public_dns(hostname: str) -> None:
    try:
        addr_infos = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise DomainUpstreamError(f"Unable to resolve hostname '{hostname}': {exc}") from exc
    if not addr_infos:
        raise DomainUpstreamError(f"No DNS records returned for '{hostname}'.")
    for info in addr_infos:
        ip_str = info[4][0].split("%", 1)[0]
        ip_obj = ipaddress.ip_address(ip_str)
        if (
            ip_obj.is_private
            or ip_obj.is_loopback
            or ip_obj.is_link_local
            or ip_obj.is_reserved
            or ip_obj.is_multicast
            or ip_obj.is_unspecified
        ):
            raise DomainValidationError(f"Resolved non-public IP address for '{hostname}'.")


def _validate_hop_url(url: str) -> str:
    validated = validate_google_maps_url(url)
    hostname = (urlsplit(validated).hostname or "").lower().rstrip(".")
    _assert_public_dns(hostname)
    return validated


class GoogleUrlResolverAdapter:
    """SSRF-hardened Google Maps URL resolver with per-hop allowlist and DNS checks."""

    def __init__(
        self,
        timeout: float = ADAPTER_TIMEOUT_SECONDS,
        max_hops: int = MAX_REDIRECT_HOPS,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._timeout = timeout
        self._max_hops = max_hops
        self._transport = transport

    def resolve_google_maps_url(self, url: str) -> ResolvedUrlPlace:
        """Validate URL, manually follow up to 5 Google hops, and extract coordinates."""
        current_url = _validate_hop_url(url)
        if not is_google_shortener_url(current_url):
            direct = extract_google_maps_place_info(current_url)
            if direct is not None:
                return ResolvedUrlPlace(**direct.__dict__)

        final_url = self._follow_validated_redirects(current_url)
        extracted = extract_google_maps_place_info(final_url)
        if extracted is None:
            raise DomainValidationError(
                "Could not extract coordinates from resolved Google Maps URL."
            )
        return ResolvedUrlPlace(**extracted.__dict__)

    def _probe_hop(self, client: httpx.Client, current_url: str) -> tuple[str | None, str]:
        response = client.head(current_url)
        if response.status_code == 405:
            response = client.get(current_url)
        if response.status_code not in {301, 302, 303, 307, 308}:
            return None, str(response.url)
        location = response.headers.get("location")
        if not location:
            raise DomainUpstreamError("Redirect response missing Location header.")
        next_url = _validate_hop_url(urljoin(current_url, location))
        return next_url, next_url

    def _follow_validated_redirects(self, start_url: str) -> str:
        current_url = start_url
        try:
            with httpx.Client(
                timeout=self._timeout,
                follow_redirects=False,
                transport=self._transport,
            ) as client:
                for _ in range(self._max_hops + 1):
                    next_url, final_url = self._probe_hop(client, current_url)
                    if next_url is None:
                        return final_url
                    current_url = next_url
                    if (
                        extract_google_maps_place_info(current_url) is not None
                        and not is_google_shortener_url(current_url)
                    ):
                        return current_url
        except httpx.HTTPError as exc:
            raise DomainUpstreamError(f"Failed to resolve Google Maps URL: {exc}") from exc
        raise DomainValidationError("Exceeded maximum redirect hops for Google Maps URL.")
