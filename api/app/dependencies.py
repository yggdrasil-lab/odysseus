"""FastAPI dependency providers for external adapters (overridable in tests)."""

from app.adapters import (
    GeocoderAdapter,
    GoogleUrlResolverAdapter,
    OsrmRoutingAdapter,
    PhotonGeocoderAdapter,
    RoutingAdapter,
    UrlResolverAdapter,
)


def get_geocoder_adapter() -> GeocoderAdapter:
    """Provide the configured place geocoder adapter."""
    return PhotonGeocoderAdapter()


def get_url_resolver_adapter() -> UrlResolverAdapter:
    """Provide the configured SSRF-hardened Google Maps URL resolver."""
    return GoogleUrlResolverAdapter()


def get_routing_adapter() -> RoutingAdapter:
    """Provide the configured street/foot routing adapter."""
    return OsrmRoutingAdapter()
