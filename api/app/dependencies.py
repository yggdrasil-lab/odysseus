"""FastAPI dependency providers for external adapters (overridable in tests)."""

from fastapi import Request

from app.adapters import (
    ChronosClientAdapter,
    GeocoderAdapter,
    GoogleUrlResolverAdapter,
    HttpChronosClientAdapter,
    HttpPlutusClientAdapter,
    MapPackBuilderAdapter,
    OsrmRoutingAdapter,
    PhotonGeocoderAdapter,
    PlutusClientAdapter,
    PmtilesCliAdapter,
    RoutingAdapter,
    UrlResolverAdapter,
)
from app.config import Settings, settings
from app.domain.rate_limit import InMemoryRateLimiter

_default_share_rate_limiter = InMemoryRateLimiter(limit=60, window_seconds=60)


def get_app_settings(request: Request) -> Settings:
    """Provide the Settings instance bound to the running FastAPI application."""
    return getattr(request.app.state, "settings", settings)


def get_geocoder_adapter() -> GeocoderAdapter:
    """Provide the configured place geocoder adapter."""
    return PhotonGeocoderAdapter()


def get_url_resolver_adapter() -> UrlResolverAdapter:
    """Provide the configured SSRF-hardened Google Maps URL resolver."""
    return GoogleUrlResolverAdapter()


def get_routing_adapter() -> RoutingAdapter:
    """Provide the configured street/foot routing adapter."""
    return OsrmRoutingAdapter()


def get_mappack_builder_adapter(request: Request) -> MapPackBuilderAdapter:
    """Provide the configured go-pmtiles CLI extraction adapter."""
    resolved = get_app_settings(request)
    return PmtilesCliAdapter(pmtiles_bin=resolved.pmtiles_bin)


def get_plutus_client_adapter(request: Request) -> PlutusClientAdapter:
    """Provide the configured read-only Plutus HTTP client adapter."""
    resolved = get_app_settings(request)
    return HttpPlutusClientAdapter(base_url=resolved.plutus_api_url)


def get_chronos_client_adapter(request: Request) -> ChronosClientAdapter:
    """Provide the configured Chronos HTTP client adapter."""
    resolved = get_app_settings(request)
    return HttpChronosClientAdapter(base_url=resolved.chronos_api_url)


def get_share_rate_limiter(request: Request) -> InMemoryRateLimiter:
    """Provide the per-IP sliding-window rate limiter bound to the FastAPI app."""
    return getattr(request.app.state, "share_rate_limiter", _default_share_rate_limiter)
