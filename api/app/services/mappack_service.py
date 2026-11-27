"""Application service for per-leg offline PMTiles map packs and offline bundles."""

from datetime import datetime, timezone
import hashlib
from pathlib import Path
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters import MapPackBuilderAdapter
from app.domain.errors import (
    DomainNotFoundError,
    DomainUpstreamError,
    DomainValidationError,
)
from app.domain.mappacks import (
    compute_padded_bbox,
    compute_workspace_sha256,
    safe_mappack_path,
    validate_bbox,
    validate_max_zoom,
)
from app.domain.places import validate_https_url
from app.models import Day, ItineraryItem, Leg, MapPack, Place, Trip
from app.schemas import (
    MapPackCreate,
    OfflineBundleAttachmentManifest,
    OfflineBundleMapPackManifest,
    OfflineBundleRead,
)
from app.services import trip_service
from app.services.ownership import (
    require_leg_for_trip,
    require_mappack_for_trip,
    require_trip,
)

HASH_CHUNK_BYTES = 65536


def list_mappacks(db: Session, trip_id: uuid.UUID) -> list[MapPack]:
    """List offline map packs for a trip ordered newest-first."""
    require_trip(db, trip_id)
    return list(
        db.scalars(
            select(MapPack)
            .where(MapPack.trip_id == trip_id)
            .order_by(MapPack.created_at.desc())
        )
    )


def _load_leg_places(db: Session, trip_id: uuid.UUID, leg: Leg) -> list[Place]:
    stmt = (
        select(Place)
        .join(ItineraryItem, ItineraryItem.place_id == Place.id)
        .join(Day, ItineraryItem.day_id == Day.id)
        .where(
            Place.trip_id == trip_id,
            Day.trip_id == trip_id,
            Day.date >= leg.start_date,
            Day.date <= leg.end_date,
        )
        .distinct()
    )
    return list(db.scalars(stmt))


def _resolve_mappack_bbox(
    db: Session,
    trip_id: uuid.UUID,
    leg: Leg | None,
    payload: MapPackCreate,
) -> tuple[float, float, float, float]:
    explicit = (payload.bbox_west, payload.bbox_south, payload.bbox_east, payload.bbox_north)
    if all(coord is not None for coord in explicit):
        return validate_bbox(
            float(explicit[0]),  # type: ignore[arg-type]
            float(explicit[1]),  # type: ignore[arg-type]
            float(explicit[2]),  # type: ignore[arg-type]
            float(explicit[3]),  # type: ignore[arg-type]
        )
    if any(coord is not None for coord in explicit):
        raise DomainValidationError(
            "All four bbox coordinates (bbox_west, bbox_south, bbox_east, bbox_north) "
            "must be provided together."
        )

    places = _load_leg_places(db, trip_id, leg) if leg is not None else []
    if not places:
        places = list(db.scalars(select(Place).where(Place.trip_id == trip_id)))
    coords = [(place.latitude, place.longitude) for place in places]
    return compute_padded_bbox(coords)


def _resolve_mappack_label(trip: Trip, leg: Leg | None, requested_label: str | None) -> str:
    if requested_label is not None and requested_label.strip():
        return requested_label.strip()[:200]
    if leg is not None:
        return leg.name[:200]
    return f"{trip.title} Offline Map"[:200]


def _resolve_source_url(requested_url: str | None, default_source_url: str) -> str:
    candidate = (requested_url or default_source_url).strip()
    if not candidate:
        raise DomainValidationError(
            "PMTiles source URL is required (provide source_url or configure ODYSSEUS_PMTILES_SOURCE_URL)."
        )
    return validate_https_url(candidate)


def _hash_and_size_file(file_path: Path) -> tuple[str, int]:
    hasher = hashlib.sha256()
    total_bytes = 0
    with file_path.open("rb") as handle:
        while chunk := handle.read(HASH_CHUNK_BYTES):
            hasher.update(chunk)
            total_bytes += len(chunk)
    if total_bytes <= 0:
        raise DomainUpstreamError("Extracted map pack archive is empty.")
    return hasher.hexdigest(), total_bytes


def create_mappack(
    db: Session,
    trip_id: uuid.UUID,
    payload: MapPackCreate,
    builder: MapPackBuilderAdapter,
    mappacks_dir: Path,
    default_source_url: str,
) -> MapPack:
    """Validate bounds, extract a bounded .pmtiles archive, hash it, and persist metadata."""
    trip = require_trip(db, trip_id)
    leg = require_leg_for_trip(db, trip_id, payload.leg_id) if payload.leg_id else None
    max_zoom = validate_max_zoom(payload.max_zoom)
    bbox = _resolve_mappack_bbox(db, trip_id, leg, payload)
    label = _resolve_mappack_label(trip, leg, payload.label)
    source_url = _resolve_source_url(payload.source_url, default_source_url)

    pack_id = uuid.uuid4()
    filename = f"pack-{pack_id}.pmtiles"
    output_path = safe_mappack_path(mappacks_dir, filename)
    builder.extract(source_url=source_url, output_path=output_path, bbox=bbox, max_zoom=max_zoom)
    try:
        sha256_hex, size_bytes = _hash_and_size_file(output_path)
        pack = MapPack(
            id=pack_id,
            trip_id=trip_id,
            leg_id=payload.leg_id,
            label=label,
            status="ready",
            bbox_west=bbox[0],
            bbox_south=bbox[1],
            bbox_east=bbox[2],
            bbox_north=bbox[3],
            max_zoom=max_zoom,
            filename=filename,
            size_bytes=size_bytes,
            sha256=sha256_hex,
            error_message=None,
        )
        db.add(pack)
        db.commit()
        db.refresh(pack)
        return pack
    except Exception:
        db.rollback()
        output_path.unlink(missing_ok=True)
        raise


def get_mappack_file_info(
    db: Session,
    trip_id: uuid.UUID,
    pack_id: uuid.UUID,
    mappacks_dir: Path,
) -> tuple[MapPack, Path]:
    """Return MapPack metadata and verified on-disk .pmtiles path or raise 404."""
    require_trip(db, trip_id)
    pack = require_mappack_for_trip(db, trip_id, pack_id)
    if pack.status != "ready":
        raise DomainNotFoundError(f"Map pack {pack_id} is not ready.")
    file_path = safe_mappack_path(mappacks_dir, pack.filename)
    if not file_path.is_file():
        raise DomainNotFoundError(f"Map pack file missing on disk for {pack_id}.")
    return pack, file_path


def delete_mappack(
    db: Session,
    trip_id: uuid.UUID,
    pack_id: uuid.UUID,
    mappacks_dir: Path,
) -> None:
    """Delete a trip's map pack metadata row and unlink its on-disk .pmtiles file."""
    require_trip(db, trip_id)
    pack = require_mappack_for_trip(db, trip_id, pack_id)
    file_path = safe_mappack_path(mappacks_dir, pack.filename)
    db.delete(pack)
    db.commit()
    file_path.unlink(missing_ok=True)


def build_offline_bundle(db: Session, trip_id: uuid.UUID) -> OfflineBundleRead:
    """Build deterministic offline sync manifest over TripWorkspace, attachments, and ready packs."""
    workspace = trip_service.get_trip_workspace(db, trip_id)
    workspace_sha256 = compute_workspace_sha256(workspace.model_dump(mode="json"))
    attachments = [
        OfflineBundleAttachmentManifest(
            id=item.id,
            booking_id=item.booking_id,
            filename=item.filename,
            mime_type=item.mime_type,
            size_bytes=item.size_bytes,
            sha256=item.sha256,
            content_url=f"/api/trips/{trip_id}/attachments/{item.id}/content",
        )
        for item in workspace.attachments
    ]
    map_packs = [
        OfflineBundleMapPackManifest(
            id=pack.id,
            leg_id=pack.leg_id,
            label=pack.label,
            filename=pack.filename,
            size_bytes=pack.size_bytes,
            sha256=pack.sha256,
            max_zoom=pack.max_zoom,
            bbox_west=pack.bbox_west,
            bbox_south=pack.bbox_south,
            bbox_east=pack.bbox_east,
            bbox_north=pack.bbox_north,
            file_url=f"/api/trips/{trip_id}/mappacks/{pack.id}/file",
        )
        for pack in workspace.map_packs
        if pack.status == "ready"
    ]
    return OfflineBundleRead(
        bundle_version=1,
        generated_at=datetime.now(timezone.utc),
        workspace_sha256=workspace_sha256,
        workspace=workspace,
        attachments=attachments,
        map_packs=map_packs,
    )
