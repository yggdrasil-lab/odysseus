"""Containerized PostgreSQL integration tests for Ticket 06 offline MapPacks and bundles."""

from collections.abc import Generator
import hashlib
import io
import os
from pathlib import Path
import sys
import uuid

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.adapters import PmtilesCliAdapter
from app.config import Settings
from app.db import get_db
from app.dependencies import get_mappack_builder_adapter
from app.domain.errors import DomainUpstreamError, DomainValidationError
from app.domain.mappacks import compute_padded_bbox, safe_mappack_path
from app.main import create_app

API_DIR = Path(__file__).resolve().parents[1]


class FakeMapPackBuilder:
    """In-memory MapPackBuilderAdapter stub writing deterministic PMTiles test bytes."""

    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.payload = b"PMTiles\x03" + bytes(range(256)) + (b"ODYSSEUS-TILE-" * 32)

    def extract(
        self,
        source_url: str,
        output_path: Path,
        bbox: tuple[float, float, float, float],
        max_zoom: int,
    ) -> None:
        self.calls.append(
            {
                "source_url": source_url,
                "output_path": output_path,
                "bbox": bbox,
                "max_zoom": max_zoom,
            }
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(self.payload)


def _build_minimal_pdf(text_line: str) -> bytes:
    stream_body = f"BT /F1 12 Tf 72 720 Td ({text_line}) Tj ET".encode("latin-1")
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
        ),
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        (
            f"5 0 obj\n<< /Length {len(stream_body)} >>\nstream\n".encode("latin-1")
            + stream_body
            + b"\nendstream\nendobj\n"
        ),
    ]
    buf = io.BytesIO()
    buf.write(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(buf.tell())
        buf.write(obj)
    xref_pos = buf.tell()
    buf.write(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    buf.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        buf.write(f"{off:010d} 00000 n \n".encode("latin-1"))
    buf.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
            "latin-1"
        )
    )
    return buf.getvalue()


@pytest.fixture(scope="module")
def alembic_cfg() -> Config:
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        raise RuntimeError(
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL offline mappack tests."
        )
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", test_db_url)
    return cfg


@pytest.fixture(scope="module")
def db_session_factory(alembic_cfg: Config) -> sessionmaker[Session]:
    """Run Alembic migrations to head and return a PostgreSQL session factory."""
    command.upgrade(alembic_cfg, "head")
    test_db_url = alembic_cfg.get_main_option("sqlalchemy.url")
    assert test_db_url is not None
    engine = create_engine(test_db_url, pool_pre_ping=True)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def mappack_env(
    db_session_factory: sessionmaker[Session],
    tmp_path: Path,
) -> Generator[tuple[object, TestClient, Path, FakeMapPackBuilder], None, None]:
    """Yield FastAPI app, TestClient, temp mappacks_dir, and FakeMapPackBuilder."""
    with db_session_factory() as cleanup_session:
        cleanup_session.execute(text("TRUNCATE TABLE trips RESTART IDENTITY CASCADE"))
        cleanup_session.commit()

    mappacks_dir = tmp_path / "mappacks"
    builder = FakeMapPackBuilder()
    app_settings = Settings(
        environment="development",
        mappacks_dir=str(mappacks_dir),
        pmtiles_source_url="https://tiles.example.test/planet.pmtiles",
    )
    app = create_app(app_settings)

    def override_db() -> Generator[Session, None, None]:
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_mappack_builder_adapter] = lambda: builder
    yield app, TestClient(app), mappacks_dir, builder


def _create_trip(client: TestClient, title: str = "Harbor Circuit") -> dict[str, object]:
    response = client.post(
        "/trips",
        json={
            "title": title,
            "slug": f"trip-{uuid.uuid4().hex[:8]}",
            "status": "booked",
            "start_date": "2026-12-10",
            "end_date": "2026-12-14",
            "home_timezone": "Pacific/Auckland",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_alembic_0005_downgrade_and_upgrade_cycle(
    alembic_cfg: Config,
    db_session_factory: sessionmaker[Session],
) -> None:
    """Verify 0005_offline_mappacks downgrades cleanly to 0004 and re-upgrades to head."""
    command.downgrade(alembic_cfg, "0004_places_routing")
    engine = db_session_factory.kw["bind"]
    assert "map_packs" not in inspect(engine).get_table_names()

    command.upgrade(alembic_cfg, "head")
    assert "map_packs" in inspect(engine).get_table_names()


def test_mappack_leg_bbox_explicit_bbox_and_validation(
    mappack_env: tuple[object, TestClient, Path, FakeMapPackBuilder],
) -> None:
    """Verify leg-scoped padded bbox, explicit bbox, zoom <= 14, and empty-place guards."""
    _app, client, mappacks_dir, builder = mappack_env
    trip = _create_trip(client)
    trip_id = trip["id"]

    empty_resp = client.post(f"/trips/{trip_id}/mappacks", json={})
    assert empty_resp.status_code == 422

    leg = client.post(
        f"/trips/{trip_id}/legs",
        json={
            "name": "Harbor Chapter",
            "primary_city": "Harbor City",
            "base_timezone": "Pacific/Auckland",
            "start_date": "2026-12-10",
            "end_date": "2026-12-11",
        },
    ).json()

    days = client.get(f"/trips/{trip_id}/days").json()
    in_leg_day = next(day for day in days if day["date"] == "2026-12-10")
    out_leg_day = next(day for day in days if day["date"] == "2026-12-13")

    in_place = client.post(
        f"/trips/{trip_id}/places",
        json={"name": "Harbor Pier", "latitude": -36.84, "longitude": 174.76},
    ).json()
    out_place = client.post(
        f"/trips/{trip_id}/places",
        json={"name": "South Ridge", "latitude": -41.29, "longitude": 174.77},
    ).json()

    client.post(
        f"/trips/{trip_id}/itinerary-items",
        json={"day_id": in_leg_day["id"], "title": "Ferry Pier", "place_id": in_place["id"]},
    )
    client.post(
        f"/trips/{trip_id}/itinerary-items",
        json={"day_id": out_leg_day["id"], "title": "Ridge Walk", "place_id": out_place["id"]},
    )

    leg_pack = client.post(
        f"/trips/{trip_id}/mappacks",
        json={"leg_id": leg["id"], "max_zoom": 14},
    )
    assert leg_pack.status_code == 201, leg_pack.text
    body = leg_pack.json()
    assert body["label"] == "Harbor Chapter"
    assert body["status"] == "ready"
    assert body["bbox_south"] == pytest.approx(-36.92)
    assert body["bbox_north"] == pytest.approx(-36.76)
    assert body["sha256"] == hashlib.sha256(builder.payload).hexdigest()
    assert body["size_bytes"] == len(builder.payload)
    assert (mappacks_dir / body["filename"]).is_file()

    explicit_pack = client.post(
        f"/trips/{trip_id}/mappacks",
        json={
            "label": "Custom Region",
            "bbox_west": 174.5,
            "bbox_south": -37.0,
            "bbox_east": 175.0,
            "bbox_north": -36.5,
            "max_zoom": 12,
        },
    )
    assert explicit_pack.status_code == 201, explicit_pack.text
    assert explicit_pack.json()["bbox_west"] == pytest.approx(174.5)
    assert explicit_pack.json()["max_zoom"] == 12

    bad_zoom = client.post(
        f"/trips/{trip_id}/mappacks",
        json={
            "bbox_west": 174.5,
            "bbox_south": -37.0,
            "bbox_east": 175.0,
            "bbox_north": -36.5,
            "max_zoom": 15,
        },
    )
    assert bad_zoom.status_code == 422


def test_mappack_file_range_etag_ownership_and_delete(
    mappack_env: tuple[object, TestClient, Path, FakeMapPackBuilder],
) -> None:
    """Verify ETag/304, 206 byte ranges, 416 errors, cross-trip 404, and disk cleanup."""
    _app, client, mappacks_dir, builder = mappack_env
    trip_a = _create_trip(client, "Trip Alpha")
    trip_b = _create_trip(client, "Trip Beta")

    created = client.post(
        f"/trips/{trip_a['id']}/mappacks",
        json={
            "label": "Alpha Pack",
            "bbox_west": 174.6,
            "bbox_south": -36.95,
            "bbox_east": 174.9,
            "bbox_north": -36.75,
        },
    )
    assert created.status_code == 201, created.text
    pack = created.json()
    file_url = f"/trips/{trip_a['id']}/mappacks/{pack['id']}/file"

    full = client.get(file_url)
    assert full.status_code == 200
    assert full.content == builder.payload
    assert full.headers["etag"] == f'"{pack["sha256"]}"'
    assert full.headers["accept-ranges"] == "bytes"
    assert full.headers["content-type"] == "application/octet-stream"
    assert f'inline; filename="{pack["filename"]}"' == full.headers["content-disposition"]

    assert client.get(file_url, headers={"If-None-Match": full.headers["etag"]}).status_code == 304

    partial = client.get(file_url, headers={"Range": "bytes=16-47"})
    assert partial.status_code == 206
    assert partial.content == builder.payload[16:48]
    assert partial.headers["content-range"] == f"bytes 16-47/{len(builder.payload)}"

    bad_range = client.get(file_url, headers={"Range": "bytes=999999-"})
    assert bad_range.status_code == 416
    assert bad_range.headers["content-range"] == f"bytes */{len(builder.payload)}"

    assert client.get(f"/trips/{trip_b['id']}/mappacks/{pack['id']}/file").status_code == 404
    assert client.delete(f"/trips/{trip_b['id']}/mappacks/{pack['id']}").status_code == 404

    deleted = client.delete(f"/trips/{trip_a['id']}/mappacks/{pack['id']}")
    assert deleted.status_code == 204
    assert not (mappacks_dir / pack["filename"]).exists()
    assert client.get(file_url).status_code == 404
    assert client.get(f"/trips/{trip_a['id']}/mappacks").json() == []


def test_offline_bundle_hash_determinism_and_redactions(
    mappack_env: tuple[object, TestClient, Path, FakeMapPackBuilder],
) -> None:
    """Verify deterministic workspace_sha256, manifests, and zero binary/Immich leakage."""
    _app, client, _mappacks_dir, _builder = mappack_env
    trip = _create_trip(client, "Bundle Verification Trip")
    trip_id = trip["id"]

    pdf_bytes = _build_minimal_pdf("Ticket 06 Offline Bundle")
    attachment = client.post(
        f"/trips/{trip_id}/attachments",
        files={"file": ("pass.pdf", pdf_bytes, "application/pdf")},
    ).json()
    pack = client.post(
        f"/trips/{trip_id}/mappacks",
        json={
            "label": "Harbor Extract",
            "bbox_west": 174.6,
            "bbox_south": -36.95,
            "bbox_east": 174.9,
            "bbox_north": -36.75,
        },
    ).json()

    bundle_one = client.get(f"/trips/{trip_id}/offline-bundle")
    bundle_two = client.get(f"/trips/{trip_id}/offline-bundle")
    assert bundle_one.status_code == 200, bundle_one.text
    assert bundle_two.status_code == 200
    body_one = bundle_one.json()
    body_two = bundle_two.json()

    assert body_one["bundle_version"] == 1
    assert body_one["workspace_sha256"] == body_two["workspace_sha256"]
    assert len(body_one["attachments"]) == 1
    assert body_one["attachments"][0]["content_url"] == (
        f"/api/trips/{trip_id}/attachments/{attachment['id']}/content"
    )
    assert len(body_one["map_packs"]) == 1
    assert body_one["map_packs"][0]["file_url"] == (
        f"/api/trips/{trip_id}/mappacks/{pack['id']}/file"
    )
    assert len(body_one["workspace"]["map_packs"]) == 1
    assert "content_bytes" not in body_one["workspace"]["attachments"][0]
    assert "immich_photos" not in body_one
    assert "immich_photos" not in body_one["workspace"]

    client.post(
        f"/trips/{trip_id}/places",
        json={"name": "Alex Tan Lookouts", "latitude": -36.85, "longitude": 174.75},
    )
    bundle_three = client.get(f"/trips/{trip_id}/offline-bundle").json()
    assert bundle_three["workspace_sha256"] != body_one["workspace_sha256"]


def test_domain_and_pmtiles_cli_adapter_fail_loud(tmp_path: Path) -> None:
    """Verify bbox clamping, path traversal rejection, and PmtilesCliAdapter error handling."""
    west, south, east, north = compute_padded_bbox([(85.0, 180.0)], padding_deg=0.1)
    assert (west, south, east, north) == (179.9, 84.9, 180.0, 85.0)

    with pytest.raises(DomainValidationError):
        safe_mappack_path(tmp_path, "../escape.pmtiles")
    with pytest.raises(DomainValidationError):
        safe_mappack_path(tmp_path, "not-pmtiles.txt")

    adapter = PmtilesCliAdapter(pmtiles_bin=sys.executable)
    target = tmp_path / "pack.pmtiles"
    with pytest.raises(DomainValidationError):
        adapter.extract("http://insecure.example.test/tiles.pmtiles", target, (0, 0, 1, 1), 10)

    missing_bin = PmtilesCliAdapter(pmtiles_bin="/nonexistent/pmtiles-binary")
    with pytest.raises(DomainUpstreamError):
        missing_bin.extract("https://tiles.example.test/planet.pmtiles", target, (0, 0, 1, 1), 10)
    assert list(tmp_path.glob("*.tmp.pmtiles")) == []
