"""Unit and PostgreSQL integration tests for Ticket 11 Immich photos and Markdown export."""

from collections.abc import Generator
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import uuid

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
import httpx
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.adapters import HttpImmichClientAdapter
from app.config import Settings
from app.db import get_db
from app.dependencies import get_immich_adapter
from app.domain.errors import (
    DomainNotFoundError,
    DomainUpstreamError,
    DomainValidationError,
)
from app.main import create_app

API_DIR = Path(__file__).resolve().parents[1]
FAKE_API_KEY = "super-secret-immich-key-999"


def _build_minimal_pdf(text_line: str) -> bytes:
    stream_body = f"BT /F1 12 Tf 72 720 Td ({text_line}) Tj ET".encode("latin-1")
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        f"5 0 obj\n<< /Length {len(stream_body)} >>\nstream\n".encode("latin-1") + stream_body + b"\nendstream\nendobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin-1"))
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("latin-1"))
    out.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin-1"))
    return bytes(out)


@pytest.fixture(scope="module")
def db_session_factory() -> sessionmaker[Session]:
    """Run Alembic migrations against PostgreSQL and return a session factory."""
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        raise RuntimeError(
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL Immich/export tests."
        )
    alembic_cfg = Config(str(API_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_db_url)
    command.upgrade(alembic_cfg, "head")
    engine = create_engine(test_db_url, pool_pre_ping=True)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def app_and_client(
    db_session_factory: sessionmaker[Session],
) -> Generator[tuple[FastAPI, TestClient], None, None]:
    """Yield FastAPI app and TestClient backed by clean PostgreSQL tables."""
    with db_session_factory() as cleanup_session:
        cleanup_session.execute(text("TRUNCATE TABLE trips RESTART IDENTITY CASCADE"))
        cleanup_session.commit()

    app = create_app(
        Settings(
            environment="development",
            domain_name="home.example",
            immich_api_url="http://immich-server:2283",
            immich_api_key=FAKE_API_KEY,
        )
    )

    def override_db() -> Generator[Session, None, None]:
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    yield app, TestClient(app)


def _create_sample_trip(
    client: TestClient,
    *,
    slug: str,
    immich_album_id: str | None = None,
    vault_note_path: str | None = "second-brain/Areas/40-Leisure/Harbor.md",
) -> dict[str, object]:
    resp = client.post(
        "/trips",
        json={
            "title": "Harbor & Islands",
            "slug": slug,
            "status": "booked",
            "start_date": "2027-02-10",
            "end_date": "2027-02-12",
            "home_timezone": "Pacific/Auckland",
            "budget_nzd": "3400.00",
            "immich_album_id": immich_album_id,
            "vault_note_path": vault_note_path,
            "summary": "Trip note with dash \u2014 and en-dash \u2013 normalization.",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_immich_adapter_search_and_timeout_contract() -> None:
    captured_requests: list[tuple[str, str, dict[str, object] | None, str | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8")) if request.content else None
        captured_requests.append(
            (request.method, str(request.url), body, request.headers.get("x-api-key"))
        )
        if request.url.path == "/api/search/metadata":
            return httpx.Response(
                200,
                json={
                    "assets": {
                        "items": [
                            {
                                "id": "asset-101",
                                "originalFileName": "IMG_101.JPG",
                                "localDateTime": "2027-02-10T09:15:00.000Z",
                                "originalMimeType": "image/jpeg",
                                "thumbhash": "abc123",
                            }
                        ]
                    }
                },
            )
        if request.url.path == "/api/assets/asset-101/thumbnail":
            return httpx.Response(200, content=b"\xff\xd8\xff\xe0", headers={"content-type": "image/jpeg"})
        return httpx.Response(404)

    adapter = HttpImmichClientAdapter(
        base_url="http://immich-server:2283/",
        api_key=FAKE_API_KEY,
        transport=httpx.MockTransport(handler),
    )
    assert adapter.timeout.read is not None and adapter.timeout.read <= 3.0
    assert adapter.timeout.connect is not None and adapter.timeout.connect <= 3.0

    album_items = adapter.search_album_photos("album-xyz", limit=500)
    assert len(album_items) == 1
    assert album_items[0].asset_id == "asset-101"
    assert album_items[0].local_date == date(2027, 2, 10)
    assert captured_requests[0][1] == "http://immich-server:2283/api/search/metadata"
    assert captured_requests[0][2] == {
        "albumIds": ["album-xyz"],
        "type": "IMAGE",
        "size": 250,
        "page": 1,
    }
    assert captured_requests[0][3] == FAKE_API_KEY

    date_items = adapter.search_date_range_photos(date(2027, 2, 10), date(2027, 2, 12))
    assert len(date_items) == 1
    assert captured_requests[1][2] == {
        "takenAfter": "2027-02-09T00:00:00Z",
        "takenBefore": "2027-02-13T23:59:59Z",
        "type": "IMAGE",
        "size": 250,
        "page": 1,
    }

    thumb = adapter.fetch_thumbnail("asset-101")
    assert thumb.content_bytes == b"\xff\xd8\xff\xe0"
    assert thumb.media_type == "image/jpeg"

    with pytest.raises(DomainValidationError):
        adapter.fetch_thumbnail("../etc/passwd")

    with pytest.raises(DomainNotFoundError):
        adapter.fetch_thumbnail("missing-404")


def test_immich_adapter_timeout_raises_without_leaking_key() -> None:
    def timeout_handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out after 3.0s")

    adapter = HttpImmichClientAdapter(
        base_url="http://immich-server:2283/api",
        api_key=FAKE_API_KEY,
        transport=httpx.MockTransport(timeout_handler),
    )
    with pytest.raises(DomainUpstreamError) as exc_info:
        adapter.search_album_photos("album-xyz")
    assert "Immich offline (Muspelheim asleep)" in str(exc_info.value)
    assert FAKE_API_KEY not in str(exc_info.value)


def test_trip_photos_album_and_date_range_grouping_and_thumbnail_proxy(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    app, client = app_and_client
    trip_album = _create_sample_trip(client, slug="album-trip", immich_album_id="alb-01")
    trip_dates = _create_sample_trip(client, slug="date-trip", immich_album_id=None)

    def mock_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/search/metadata":
            payload = json.loads(request.content.decode("utf-8"))
            if "albumIds" in payload:
                return httpx.Response(
                    200,
                    json={
                        "assets": {
                            "items": [
                                {
                                    "id": "photo-day-1",
                                    "originalFileName": "day1.jpg",
                                    "localDateTime": "2027-02-10T10:00:00Z",
                                },
                                {
                                    "id": "photo-out-of-trip",
                                    "originalFileName": "before.jpg",
                                    "localDateTime": "2027-02-01T10:00:00Z",
                                },
                            ]
                        }
                    },
                )
            return httpx.Response(
                200,
                json={
                    "assets": {
                        "items": [
                            {
                                "id": "photo-padded-outside",
                                "originalFileName": "pad.jpg",
                                "localDateTime": "2027-02-09T23:00:00Z",
                            },
                            {
                                "id": "photo-day-2",
                                "originalFileName": "day2.jpg",
                                "localDateTime": "2027-02-11T16:30:00Z",
                            },
                        ]
                    }
                },
            )
        if request.url.path == "/api/assets/photo-day-1/thumbnail":
            return httpx.Response(200, content=b"PNGDATA", headers={"content-type": "image/png"})
        return httpx.Response(404)

    app.dependency_overrides[get_immich_adapter] = lambda: HttpImmichClientAdapter(
        base_url="http://immich-server:2283",
        api_key=FAKE_API_KEY,
        transport=httpx.MockTransport(mock_handler),
    )

    album_resp = client.get(f"/trips/{trip_album['id']}/photos")
    assert album_resp.status_code == 200
    album_data = album_resp.json()
    assert album_data["status"] == "available"
    assert album_data["source"] == "album"
    assert album_data["total_photos"] == 2
    assert len(album_data["days"]) == 1
    assert album_data["days"][0]["date"] == "2027-02-10"
    assert album_data["days"][0]["photos"][0]["thumbnail_url"] == f"/api/trips/{trip_album['id']}/photos/photo-day-1/thumbnail"
    assert album_data["days"][0]["photos"][0]["web_url"] == "https://photos.home.example/photos/photo-day-1"
    assert len(album_data["ungrouped_photos"]) == 1
    assert album_data["ungrouped_photos"][0]["asset_id"] == "photo-out-of-trip"

    date_resp = client.get(f"/trips/{trip_dates['id']}/photos")
    assert date_resp.status_code == 200
    date_data = date_resp.json()
    assert date_data["status"] == "available"
    assert date_data["source"] == "date_range"
    assert date_data["total_photos"] == 1
    assert len(date_data["days"]) == 1
    assert date_data["days"][0]["date"] == "2027-02-11"
    assert date_data["ungrouped_photos"] == []

    thumb_ok = client.get(f"/trips/{trip_album['id']}/photos/photo-day-1/thumbnail")
    assert thumb_ok.status_code == 200
    assert thumb_ok.content == b"PNGDATA"
    assert thumb_ok.headers["cache-control"] == "private, max-age=300"
    assert thumb_ok.headers["x-robots-tag"] == "noindex, nofollow"

    thumb_bad = client.get(f"/trips/{trip_album['id']}/photos/bad$id/thumbnail")
    assert thumb_bad.status_code == 422


def test_trip_photos_degrades_offline_and_unconfigured_and_thumbnail_502(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    app, client = app_and_client
    trip = _create_sample_trip(client, slug="offline-trip", immich_album_id="alb-offline")

    def timeout_handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("Muspelheim asleep")

    app.dependency_overrides[get_immich_adapter] = lambda: HttpImmichClientAdapter(
        base_url="http://immich-server:2283",
        api_key=FAKE_API_KEY,
        transport=httpx.MockTransport(timeout_handler),
    )

    resp = client.get(f"/trips/{trip['id']}/photos")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "offline"
    assert body["message"] == "Immich offline (Muspelheim asleep)"
    assert body["days"] == []
    assert body["total_photos"] == 0

    thumb_err = client.get(f"/trips/{trip['id']}/photos/asset-999/thumbnail")
    assert thumb_err.status_code == 502
    assert FAKE_API_KEY not in thumb_err.text

    # Unconfigured settings
    app_unconfigured = create_app(Settings(environment="development", domain_name="home.example"))
    app_unconfigured.dependency_overrides[get_db] = app.dependency_overrides[get_db]
    unconfigured_client = TestClient(app_unconfigured)
    unconf_resp = unconfigured_client.get(f"/trips/{trip['id']}/photos")
    assert unconf_resp.status_code == 200
    assert unconf_resp.json()["status"] == "unconfigured"
    assert unconf_resp.json()["source"] == "none"


def test_markdown_export_and_zero_immich_share_or_offline_leakage(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    _app, client = app_and_client
    trip = _create_sample_trip(
        client,
        slug="markdown-voyage",
        immich_album_id="secret-immich-album-777",
        vault_note_path="second-brain/Areas/40-Leisure/Voyage.md",
    )
    trip_id = str(trip["id"])

    leg_resp = client.post(
        f"/trips/{trip_id}/legs",
        json={
            "name": "Island Loop",
            "primary_city": "Tokyo",
            "country_code": "JP",
            "base_timezone": "Asia/Tokyo",
            "start_date": "2027-02-10",
            "end_date": "2027-02-12",
        },
    )
    assert leg_resp.status_code == 201

    days_resp = client.get(f"/trips/{trip_id}/days")
    assert days_resp.status_code == 200
    day_1 = days_resp.json()[0]

    booking_resp = client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "booking_type": "flight",
            "status": "confirmed",
            "title": "Pacific Air AKL to HND",
            "provider": "Pacific Air",
            "confirmation_code": "ODY777",
            "quoted_cost": "1850.00",
            "quoted_currency": "NZD",
            "segments": [
                {
                    "origin_label": "Auckland",
                    "origin_code": "AKL",
                    "destination_label": "Tokyo Haneda",
                    "destination_code": "HND",
                    "departure_local": "2027-02-10T23:30:00",
                    "departure_tz": "Pacific/Auckland",
                    "arrival_local": "2027-02-11T06:45:00",
                    "arrival_tz": "Asia/Tokyo",
                }
            ],
        },
    )
    assert booking_resp.status_code == 201
    booking_id = booking_resp.json()["id"]

    att_resp = client.post(
        f"/trips/{trip_id}/attachments",
        files={"file": ("itinerary.pdf", _build_minimal_pdf("Flight ODY777"), "application/pdf")},
        data={"booking_id": booking_id},
    )
    assert att_resp.status_code == 201

    item_resp = client.post(
        f"/trips/{trip_id}/itinerary-items",
        json={
            "day_id": day_1["id"],
            "title": "Harbor Ferry \u2014 Pier 2",
            "category": "transit",
            "status": "planned",
            "start_local": "2027-02-10T09:00:00",
            "start_tz": "Pacific/Auckland",
        },
    )
    assert item_resp.status_code == 201

    backlog_resp = client.post(
        f"/trips/{trip_id}/itinerary-items",
        json={"title": "Night Market Ramen", "category": "food", "status": "idea"},
    )
    assert backlog_resp.status_code == 201

    checklist_resp = client.post(
        f"/trips/{trip_id}/checklists",
        json={"title": "Carry-on", "list_type": "packing"},
    )
    assert checklist_resp.status_code == 201
    cl_id = checklist_resp.json()["id"]
    client.post(
        f"/trips/{trip_id}/checklists/{cl_id}/items",
        json={"label": "Passport", "is_completed": True},
    )
    client.post(
        f"/trips/{trip_id}/checklists/{cl_id}/items",
        json={"label": "Rail Pass", "is_completed": False},
    )

    client.post(
        f"/trips/{trip_id}/notes",
        json={"title": "Locker Code", "body": "Gate B \u2013 locker 14", "is_private": True},
    )

    md_resp = client.get(f"/trips/{trip_id}/export/markdown")
    assert md_resp.status_code == 200
    assert md_resp.headers["content-type"].startswith("text/markdown")
    assert md_resp.headers["content-disposition"] == 'attachment; filename="markdown-voyage.md"'
    assert "no-store" in md_resp.headers["cache-control"]

    md = md_resp.text
    assert "\u2014" not in md
    assert "\u2013" not in md
    assert "secret-immich-album-777" not in md
    assert "immich" not in md.lower()
    assert "type: trip-snapshot" in md
    assert "trip_slug: markdown-voyage" in md
    assert "vault_note_path: \"second-brain/Areas/40-Leisure/Voyage.md\"" in md
    assert "**Vault Note:** second-brain/Areas/40-Leisure/Voyage.md" in md
    assert "## Legs" in md
    assert "## Bookings" in md
    assert "ODY777" in md
    assert "(+1)" in md
    assert "itinerary.pdf" in md
    assert "## Day-by-Day Itinerary" in md
    assert "09:00 Pacific/Auckland" in md
    assert "## Backlog Places & Ideas" in md
    assert "Night Market Ramen" in md
    assert "## Checklists" in md
    assert "- [x] Passport" in md
    assert "- [ ] Rail Pass" in md
    assert "## Travel Notes" in md
    assert "Locker Code" in md

    # Verify zero leakage in /share/{token} and /offline-bundle
    tok_resp = client.post(f"/trips/{trip_id}/share-tokens", json={"label": "Guest"})
    assert tok_resp.status_code == 201
    token = tok_resp.json()["token"]
    share_resp = client.get(f"/share/{token}")
    assert share_resp.status_code == 200
    assert "secret-immich-album-777" not in share_resp.text
    assert "Voyage.md" not in share_resp.text

    bundle_resp = client.get(f"/trips/{trip_id}/offline-bundle")
    assert bundle_resp.status_code == 200
    assert "/photos" not in bundle_resp.text
