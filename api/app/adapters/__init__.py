"""External I/O adapter protocols and implementations for Odysseus."""

from app.adapters.geocoder import (
    GeocoderAdapter,
    GoogleUrlResolverAdapter,
    PhotonGeocoderAdapter,
    PlaceSearchCandidate,
    ResolvedUrlPlace,
    UrlResolverAdapter,
)
from app.adapters.mappacks import MapPackBuilderAdapter, PmtilesCliAdapter
from app.adapters.routing import OsrmRoutingAdapter, RoadRouteResult, RoutingAdapter

__all__ = [
    "GeocoderAdapter",
    "GoogleUrlResolverAdapter",
    "MapPackBuilderAdapter",
    "OsrmRoutingAdapter",
    "PhotonGeocoderAdapter",
    "PlaceSearchCandidate",
    "PmtilesCliAdapter",
    "ResolvedUrlPlace",
    "RoadRouteResult",
    "RoutingAdapter",
    "UrlResolverAdapter",
]
