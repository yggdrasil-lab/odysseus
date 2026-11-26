"""Thin REST router for offline .pmtiles map packs, byte-range streaming, and bundles."""

from collections.abc import Iterator
from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, Header, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.adapters import MapPackBuilderAdapter
from app.config import Settings
from app.db import get_db
from app.dependencies import get_app_settings, get_mappack_builder_adapter
from app.domain.attachments import etag_matches, parse_byte_range
from app.schemas import MapPackCreate, MapPackRead, OfflineBundleRead
from app.services import mappack_service

router = APIRouter(prefix="/trips/{trip_id}", tags=["MapPacks"])

STREAM_CHUNK_BYTES = 65536


def _iter_file_slice(
    file_path: Path,
    start: int,
    length: int,
    chunk_size: int = STREAM_CHUNK_BYTES,
) -> Iterator[bytes]:
    remaining = length
    with file_path.open("rb") as handle:
        handle.seek(start)
        while remaining > 0:
            chunk = handle.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def _file_headers(filename: str, sha256_hex: str) -> dict[str, str]:
    return {
        "ETag": f'"{sha256_hex}"',
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
    }


@router.get("/mappacks", response_model=list[MapPackRead])
def list_mappacks(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[MapPackRead]:
    """List extracted offline map packs for a trip."""
    return [
        MapPackRead.model_validate(item)
        for item in mappack_service.list_mappacks(db, trip_id)
    ]


@router.post("/mappacks", response_model=MapPackRead, status_code=status.HTTP_201_CREATED)
def create_mappack(
    trip_id: uuid.UUID,
    payload: MapPackCreate,
    db: Session = Depends(get_db),
    builder: MapPackBuilderAdapter = Depends(get_mappack_builder_adapter),
    app_settings: Settings = Depends(get_app_settings),
) -> MapPackRead:
    """Extract and persist a bounded .pmtiles offline map pack for a trip or leg."""
    pack = mappack_service.create_mappack(
        db=db,
        trip_id=trip_id,
        payload=payload,
        builder=builder,
        mappacks_dir=Path(app_settings.mappacks_dir),
        default_source_url=app_settings.pmtiles_source_url,
    )
    return MapPackRead.model_validate(pack)


@router.delete("/mappacks/{pack_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mappack(
    trip_id: uuid.UUID,
    pack_id: uuid.UUID,
    db: Session = Depends(get_db),
    app_settings: Settings = Depends(get_app_settings),
) -> Response:
    """Delete a map pack metadata record and remove its on-disk .pmtiles file."""
    mappack_service.delete_mappack(
        db=db,
        trip_id=trip_id,
        pack_id=pack_id,
        mappacks_dir=Path(app_settings.mappacks_dir),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/mappacks/{pack_id}/file")
def stream_mappack_file(
    trip_id: uuid.UUID,
    pack_id: uuid.UUID,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    range_header: str | None = Header(default=None, alias="Range"),
    db: Session = Depends(get_db),
    app_settings: Settings = Depends(get_app_settings),
) -> Response:
    """Stream .pmtiles bytes from disk with ETag/304 and RFC 9110 byte-range reads."""
    pack, file_path = mappack_service.get_mappack_file_info(
        db=db,
        trip_id=trip_id,
        pack_id=pack_id,
        mappacks_dir=Path(app_settings.mappacks_dir),
    )
    headers = _file_headers(pack.filename, pack.sha256)
    if etag_matches(if_none_match, pack.sha256):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    total_size = file_path.stat().st_size
    if range_header:
        start, end = parse_byte_range(range_header, total_size)
        length = end - start + 1
        range_headers = {
            **headers,
            "Content-Range": f"bytes {start}-{end}/{total_size}",
            "Content-Length": str(length),
        }
        return StreamingResponse(
            _iter_file_slice(file_path, start, length),
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type="application/octet-stream",
            headers=range_headers,
        )

    full_headers = {**headers, "Content-Length": str(total_size)}
    return StreamingResponse(
        _iter_file_slice(file_path, 0, total_size),
        status_code=status.HTTP_200_OK,
        media_type="application/octet-stream",
        headers=full_headers,
    )


@router.get("/offline-bundle", response_model=OfflineBundleRead)
def get_offline_bundle(
    trip_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> OfflineBundleRead:
    """Return deterministic offline sync manifest for a trip."""
    return mappack_service.build_offline_bundle(db, trip_id)
