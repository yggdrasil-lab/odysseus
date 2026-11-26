"""Containerized PostgreSQL integration tests for Wave 3 bookings & attachments."""

from collections.abc import Generator
import io
import os
from pathlib import Path
import random
import uuid

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from PIL import Image
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import get_db
from app.main import create_app

API_DIR = Path(__file__).resolve().parents[1]


def _build_minimal_pdf(text_line: str) -> bytes:
    """Build a valid single-page PDF byte payload containing extractable ASCII text."""
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


def _build_exif_rotated_png_bytes() -> bytes:
    """Build an 1800x900 high-entropy RGB PNG with EXIF Orientation=6 (90 deg CW)."""
    rng = random.Random(42)
    raw_rgb = rng.randbytes(1800 * 900 * 3)
    img = Image.frombytes("RGB", (1800, 900), raw_rgb)
    exif = Image.Exif()
    exif[0x0112] = 6
    out = io.BytesIO()
    img.save(out, format="PNG", exif=exif.tobytes())
    return out.getvalue()


@pytest.fixture(scope="module")
def alembic_cfg() -> Config:
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        raise RuntimeError(
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL bookings/attachments tests."
        )
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", test_db_url)
    return cfg


@pytest.fixture(scope="module")
def db_session_factory(alembic_cfg: Config) -> sessionmaker[Session]:
    """Verify Alembic upgrade/downgrade cycle through 0004_places_routing and return factory."""
    command.upgrade(alembic_cfg, "head")
    test_db_url = alembic_cfg.get_main_option("sqlalchemy.url")
    assert test_db_url is not None
    engine = create_engine(test_db_url, pool_pre_ping=True)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def client(db_session_factory: sessionmaker[Session]) -> Generator[TestClient, None, None]:
    """Yield a clean TestClient backed by PostgreSQL with tables truncated per test."""
    with db_session_factory() as cleanup_session:
        cleanup_session.execute(text("TRUNCATE TABLE trips RESTART IDENTITY CASCADE"))
        cleanup_session.commit()

    app = create_app(Settings(environment="development"))

    def override_db() -> Generator[Session, None, None]:
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    yield TestClient(app)


def _create_trip(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/trips",
        json={
            "title": "Pacific Crossing",
            "slug": f"pacific-crossing-{uuid.uuid4().hex[:6]}",
            "status": "booked",
            "start_date": "2026-12-10",
            "end_date": "2026-12-15",
            "home_timezone": "Pacific/Auckland",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_alembic_wave3_downgrade_and_upgrade_cycle(
    alembic_cfg: Config,
    db_session_factory: sessionmaker[Session],
) -> None:
    """Ensure 0004 and 0003 migrations downgrade cleanly to 0002 and re-upgrade to head."""
    command.downgrade(alembic_cfg, "0002_core_trip_domain")
    engine = db_session_factory.kw["bind"]
    inspector = inspect(engine)
    assert "bookings" not in inspector.get_table_names()
    assert "places" not in inspector.get_table_names()

    command.upgrade(alembic_cfg, "head")
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert {"bookings", "booking_segments", "attachments", "places", "route_estimates"} <= tables


def test_booking_crud_segments_cross_dateline_and_atomic_replace(client: TestClient) -> None:
    """Verify booking CRUD, overnight/dateline segment offsets, and atomic segment replacement."""
    trip = _create_trip(client)
    trip_id = trip["id"]

    created = client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "booking_type": "flight",
            "status": "confirmed",
            "title": "Auckland to Tokyo and Honolulu",
            "provider": "Pacific Air",
            "confirmation_code": "ODYS99",
            "quoted_cost": "1850.50",
            "quoted_currency": "NZD",
            "source_email_message_id": "msg-odys-001",
            "segments": [
                {
                    "segment_order": 0,
                    "carrier": "Pacific Air",
                    "flight_or_service_number": "PA101",
                    "origin_label": "Auckland Airport",
                    "origin_code": "AKL",
                    "destination_label": "Narita Airport",
                    "destination_code": "NRT",
                    "departure_local": "2026-12-10T22:00:00",
                    "departure_tz": "Pacific/Auckland",
                    "arrival_local": "2026-12-11T06:30:00",
                    "arrival_tz": "Asia/Tokyo",
                },
                {
                    "segment_order": 1,
                    "carrier": "Pacific Air",
                    "flight_or_service_number": "PA202",
                    "origin_label": "Auckland Airport",
                    "origin_code": "AKL",
                    "destination_label": "Honolulu Airport",
                    "destination_code": "HNL",
                    "departure_local": "2026-12-12T00:30:00",
                    "departure_tz": "Pacific/Auckland",
                    "arrival_local": "2026-12-11T10:30:00",
                    "arrival_tz": "Pacific/Honolulu",
                },
            ],
        },
    )
    assert created.status_code == 201, created.text
    booking = created.json()
    assert len(booking["segments"]) == 2
    assert booking["segments"][0]["day_offset"] == 1
    assert booking["segments"][0]["projected_arrival_date"] == "2026-12-11"
    assert booking["segments"][1]["day_offset"] == -1
    assert booking["segments"][1]["projected_arrival_date"] is None

    duplicate_email = client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "booking_type": "flight",
            "title": "Duplicate Email Booking",
            "source_email_message_id": "msg-odys-001",
        },
    )
    assert duplicate_email.status_code == 409

    patched = client.patch(
        f"/trips/{trip_id}/bookings/{booking['id']}",
        json={
            "status": "pending",
            "segments": [
                {
                    "segment_order": 0,
                    "origin_label": "Auckland Airport",
                    "origin_code": "AKL",
                    "destination_label": "Harbour View Hotel",
                    "departure_local": "2026-12-10T14:00:00",
                    "departure_tz": "Pacific/Auckland",
                    "arrival_local": "2026-12-10T15:00:00",
                    "arrival_tz": "Pacific/Auckland",
                }
            ],
        },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["status"] == "pending"
    assert len(patched.json()["segments"]) == 1
    assert patched.json()["segments"][0]["destination_label"] == "Harbour View Hotel"

    listed = client.get(f"/trips/{trip_id}/bookings")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    deleted = client.delete(f"/trips/{trip_id}/bookings/{booking['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/trips/{trip_id}/bookings").json() == []


def test_attachment_pdf_extraction_and_content_streaming(client: TestClient) -> None:
    """Verify PDF text extraction, metadata omission of bytes, ETag/304, and 206/416 ranges."""
    trip = _create_trip(client)
    trip_id = trip["id"]
    booking = client.post(
        f"/trips/{trip_id}/bookings",
        json={"booking_type": "lodging", "title": "Harbour View Hotel Stay"},
    ).json()

    pdf_bytes = _build_minimal_pdf("Confirmation ODYS99 Harbour View Hotel")
    uploaded = client.post(
        f"/trips/{trip_id}/attachments",
        data={"booking_id": booking["id"]},
        files={"file": ("hotel-confirm.pdf", pdf_bytes, "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    meta = uploaded.json()
    assert "content_bytes" not in meta
    assert meta["mime_type"] == "application/pdf"
    assert meta["booking_id"] == booking["id"]
    assert "ODYS99" in (meta["extracted_text"] or "")

    workspace = client.get(f"/trips/{trip_id}/workspace")
    assert workspace.status_code == 200
    ws_data = workspace.json()
    assert len(ws_data["bookings"]) == 1
    assert len(ws_data["attachments"]) == 1
    assert "content_bytes" not in ws_data["attachments"][0]

    content_url = f"/trips/{trip_id}/attachments/{meta['id']}/content"
    full = client.get(content_url)
    assert full.status_code == 200
    assert full.content == pdf_bytes
    assert full.headers["etag"] == f'"{meta["sha256"]}"'
    assert full.headers["accept-ranges"] == "bytes"
    assert 'inline; filename="hotel-confirm.pdf"' == full.headers["content-disposition"]

    not_modified = client.get(content_url, headers={"If-None-Match": full.headers["etag"]})
    assert not_modified.status_code == 304

    partial = client.get(content_url, headers={"Range": "bytes=0-15"})
    assert partial.status_code == 206
    assert partial.content == pdf_bytes[:16]
    assert partial.headers["content-range"] == f"bytes 0-15/{len(pdf_bytes)}"

    suffix = client.get(content_url, headers={"Range": "bytes=-10"})
    assert suffix.status_code == 206
    assert suffix.content == pdf_bytes[-10:]

    bad_range = client.get(content_url, headers={"Range": "bytes=999999-"})
    assert bad_range.status_code == 416
    assert bad_range.headers["content-range"] == f"bytes */{len(pdf_bytes)}"

    deleted = client.delete(f"/trips/{trip_id}/attachments/{meta['id']}")
    assert deleted.status_code == 204


def test_attachment_image_exif_webp_normalization_and_limits(client: TestClient) -> None:
    """Verify EXIF rotation, 1400px thumbnailing, WebP compression, and 413/422 errors."""
    trip = _create_trip(client)
    other_trip = _create_trip(client)
    trip_id = trip["id"]

    raw_png = _build_exif_rotated_png_bytes()
    uploaded = client.post(
        f"/trips/{trip_id}/attachments",
        files={"file": ("boarding-pass.png", raw_png, "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    meta = uploaded.json()
    assert meta["mime_type"] == "image/webp"
    assert meta["size_bytes"] < len(raw_png)

    downloaded = client.get(f"/trips/{trip_id}/attachments/{meta['id']}/content")
    assert downloaded.status_code == 200
    with Image.open(io.BytesIO(downloaded.content)) as stored_img:
        width, height = stored_img.size
        assert max(width, height) <= 1400
        assert height > width

    low_q_buf = io.BytesIO()
    low_q_raw = random.Random(7).randbytes(64 * 64 * 3)
    Image.frombytes("RGB", (64, 64), low_q_raw).save(low_q_buf, format="WEBP", quality=10)
    low_q_webp = low_q_buf.getvalue()
    kept_uploaded = client.post(
        f"/trips/{trip_id}/attachments",
        files={"file": ("already-compact.webp", low_q_webp, "image/webp")},
    )
    assert kept_uploaded.status_code == 201, kept_uploaded.text
    assert kept_uploaded.json()["mime_type"] == "image/webp"
    assert kept_uploaded.json()["size_bytes"] == len(low_q_webp)

    too_big = client.post(
        f"/trips/{trip_id}/attachments",
        files={"file": ("huge.pdf", b"%PDF-" + b"0" * (15 * 1024 * 1024), "application/pdf")},
    )
    assert too_big.status_code == 413

    bad_mime = client.post(
        f"/trips/{trip_id}/attachments",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert bad_mime.status_code == 422

    bad_pdf = client.post(
        f"/trips/{trip_id}/attachments",
        files={"file": ("fake.pdf", b"not-a-pdf", "application/pdf")},
    )
    assert bad_pdf.status_code == 422

    other_booking = client.post(
        f"/trips/{other_trip['id']}/bookings",
        json={"booking_type": "activity", "title": "Cross Trip Booking"},
    ).json()
    cross_trip = client.post(
        f"/trips/{trip_id}/attachments",
        data={"booking_id": other_booking["id"]},
        files={"file": ("valid.pdf", _build_minimal_pdf("ODYS11"), "application/pdf")},
    )
    assert cross_trip.status_code == 422
