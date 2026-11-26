"""FastAPI dependency providers for external adapters (overridable in tests)."""

from fastapi import Request

from app.adapters import (
    GeocoderAdapter,
    GoogleUrlResolverAdapter,
    MapPackBuilderAdapter,
    OsrmRoutingAdapter,
    PhotonGeocoderAdapter,
    PmtilesCliAdapter,
    RoutingAdapter,
    UrlResolverAdapter,
)
from app.config import Settings, settings


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
