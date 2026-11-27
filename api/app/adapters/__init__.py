"""External I/O adapter protocols and implementations for Odysseus."""

from app.adapters.chronos import (
    ChronosClientAdapter,
    ChronosCommitmentRead,
    ChronosCommitmentUpsert,
    ChronosNudgeMode,
    ChronosOverlayMode,
    ChronosTravelModeResponse,
    ChronosTravelModeUpsert,
    HttpChronosClientAdapter,
)
from app.adapters.geocoder import (
    GeocoderAdapter,
    GoogleUrlResolverAdapter,
    PhotonGeocoderAdapter,
    PlaceSearchCandidate,
    ResolvedUrlPlace,
    UrlResolverAdapter,
)
from app.adapters.immich import (
    HttpImmichClientAdapter,
    ImmichAssetRecord,
    ImmichClientAdapter,
    ImmichThumbnailPayload,
)
from app.adapters.mappacks import MapPackBuilderAdapter, PmtilesCliAdapter
from app.adapters.plutus import (
    HttpPlutusClientAdapter,
    PlutusClientAdapter,
    PlutusFxRate,
    PlutusTagCategorySummary,
    PlutusTagSummary,
    PlutusTransaction,
)
from app.adapters.routing import OsrmRoutingAdapter, RoadRouteResult, RoutingAdapter

__all__ = [
    "ChronosClientAdapter",
    "ChronosCommitmentRead",
    "ChronosCommitmentUpsert",
    "ChronosNudgeMode",
    "ChronosOverlayMode",
    "ChronosTravelModeResponse",
    "ChronosTravelModeUpsert",
    "GeocoderAdapter",
    "GoogleUrlResolverAdapter",
    "HttpChronosClientAdapter",
    "HttpImmichClientAdapter",
    "HttpPlutusClientAdapter",
    "ImmichAssetRecord",
    "ImmichClientAdapter",
    "ImmichThumbnailPayload",
    "MapPackBuilderAdapter",
    "OsrmRoutingAdapter",
    "PhotonGeocoderAdapter",
    "PlaceSearchCandidate",
    "PlutusClientAdapter",
    "PlutusFxRate",
    "PlutusTagCategorySummary",
    "PlutusTagSummary",
    "PlutusTransaction",
    "PmtilesCliAdapter",
    "ResolvedUrlPlace",
    "RoadRouteResult",
    "RoutingAdapter",
    "UrlResolverAdapter",
]
