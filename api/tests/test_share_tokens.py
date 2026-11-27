"""Containerized PostgreSQL integration tests for Ticket 07 share tokens and companion views."""

from collections.abc import Generator
from datetime import datetime, timedelta, timezone
import io
import os
from pathlib import Path
import re
import uuid

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import get_db
from app.dependencies import get_share_rate_limiter
from app.domain.rate_limit import InMemoryRateLimiter
from app.main import create_app

API_DIR = Path(__file__).resolve().parents[1]
URL_SAFE_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]+$")


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


@pytest.fixture(scope="module")
def alembic_cfg() -> Config:
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        raise RuntimeError(
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL share token tests."
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
def share_env(
    db_session_factory: sessionmaker[Session],
) -> Generator[tuple[object, TestClient], None, None]:
    """Yield FastAPI app and TestClient backed by clean PostgreSQL state."""
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
    yield app, TestClient(app)


def _assert_share_security_headers(response: object) -> None:
    headers = response.headers  # type: ignore[attr-defined]
    assert headers["x-robots-tag"] == "noindex, nofollow"
    assert headers["referrer-policy"] == "no-referrer"
    assert headers["cache-control"] == "no-store"


def _create_trip_and_leg(client: TestClient) -> dict[str, object]:
    trip_resp = client.post(
        "/trips",
        json={
            "title": "Harbor Retreat",
            "slug": f"harbor-retreat-{uuid.uuid4().hex[:6]}",
            "status": "booked",
            "start_date": "2026-12-10",
            "end_date": "2026-12-12",
            "home_timezone": "Pacific/Auckland",
            "budget_nzd": "4200.50",
            "immich_album_id": "immich-secret-album-42",
            "vault_note_path": "second-brain/Areas/40-Leisure/Harbor.md",
            "summary": "Public summary for Alex Tan",
        },
    )
    assert trip_resp.status_code == 201, trip_resp.text
    trip = trip_resp.json()
    leg_resp = client.post(
        f"/trips/{trip['id']}/legs",
        json={
            "name": "Auckland Stopover",
            "primary_city": "Auckland",
            "country_code": "NZ",
            "base_timezone": "Pacific/Auckland",
            "start_date": "2026-12-10",
            "end_date": "2026-12-12",
        },
    )
    assert leg_resp.status_code == 201, leg_resp.text
    return trip


def _create_booking_and_attachment(
    client: TestClient,
    trip_id: str,
) -> tuple[dict[str, object], dict[str, object], bytes]:
    unique_msg = f"<msg-{uuid.uuid4().hex[:8]}@example.invalid>"
    booking_resp = client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "booking_type": "flight",
            "status": "confirmed",
            "title": "AKL-NRT Flight",
            "provider": "Air Horizon",
            "confirmation_code": "ODYS99",
            "quoted_cost": "1850.00",
            "quoted_currency": "NZD",
            "source_reference": "REF-ODYS99-TICKET",
            "source_email_message_id": unique_msg,
            "notes": "Window seat requested for Alex Tan",
        },
    )
    assert booking_resp.status_code == 201, booking_resp.text
    booking = booking_resp.json()
    pdf_bytes = _build_minimal_pdf("Ticket ODYS99 for Alex Tan")
    attach_resp = client.post(
        f"/trips/{trip_id}/attachments",
        files={"file": ("boarding-pass.pdf", pdf_bytes, "application/pdf")},
        data={"booking_id": booking["id"]},
    )
    assert attach_resp.status_code == 201, attach_resp.text
    return booking, attach_resp.json(), pdf_bytes


def _create_checklists_and_notes(client: TestClient, trip_id: str) -> None:
    checklist_resp = client.post(
        f"/trips/{trip_id}/checklists",
        json={"title": "Packing List", "list_type": "packing"},
    )
    assert checklist_resp.status_code == 201, checklist_resp.text
    checklist_id = checklist_resp.json()["id"]
    item_resp = client.post(
        f"/trips/{trip_id}/checklists/{checklist_id}/items",
        json={"label": "Passport & power adapter"},
    )
    assert item_resp.status_code == 201, item_resp.text

    pub_note = client.post(
        f"/trips/{trip_id}/notes",
        json={"title": "Meeting Point", "body": "Gate B4 concourse", "is_private": False},
    )
    assert pub_note.status_code == 201, pub_note.text

    priv_note = client.post(
        f"/trips/{trip_id}/notes",
        json={"title": "Passport Backup PIN", "body": "Private locker code 9999", "is_private": True},
    )
    assert priv_note.status_code == 201, priv_note.text


def _seed_rich_trip(client: TestClient) -> dict[str, object]:
    trip = _create_trip_and_leg(client)
    trip_id = str(trip["id"])
    booking, attachment, pdf_bytes = _create_booking_and_attachment(client, trip_id)
    _create_checklists_and_notes(client, trip_id)
    return {
        "trip": trip,
        "booking": booking,
        "attachment": attachment,
        "pdf_bytes": pdf_bytes,
    }


def test_alembic_share_tokens_downgrade_and_upgrade_cycle(
    alembic_cfg: Config,
    db_session_factory: sessionmaker[Session],
) -> None:
    """Verify 0006_share_tokens downgrades cleanly to 0005 and re-upgrades to head."""
    command.downgrade(alembic_cfg, "0005_offline_mappacks")
    engine = db_session_factory.kw["bind"]
    inspector = inspect(engine)
    assert "share_tokens" not in inspector.get_table_names()

    command.upgrade(alembic_cfg, "head")
    inspector = inspect(engine)
    assert "share_tokens" in inspector.get_table_names()
    index_names = {idx["name"] for idx in inspector.get_indexes("share_tokens")}
    assert {"ix_share_tokens_trip_id", "uq_share_tokens_token"} <= index_names


def test_share_token_crud_and_rotate(share_env: tuple[object, TestClient]) -> None:
    """Verify token CRUD, safe-by-default flags, 256-bit entropy, and rotation."""
    _, client = share_env
    seeded = _seed_rich_trip(client)
    trip_id = seeded["trip"]["id"]  # type: ignore[index]

    create_resp = client.post(f"/trips/{trip_id}/share-tokens", json={"label": "Companion View"})
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert len(created["token"]) >= 40
    assert URL_SAFE_TOKEN_RE.match(created["token"])
    assert not any(
        created[k]
        for k in (
            "include_pnrs",
            "include_attachments",
            "include_costs",
            "include_checklists",
            "include_private_notes",
        )
    )
    assert created["is_active"] is True

    list_resp = client.get(f"/trips/{trip_id}/share-tokens")
    assert [row["id"] for row in list_resp.json()] == [created["id"]]

    null_toggle = client.patch(
        f"/trips/{trip_id}/share-tokens/{created['id']}",
        json={"include_pnrs": None},
    )
    assert null_toggle.status_code == 422

    rotated = client.post(f"/trips/{trip_id}/share-tokens/{created['id']}/rotate").json()
    assert rotated["id"] != created["id"] and rotated["token"] != created["token"]
    assert rotated["label"] == "Companion View" and rotated["is_active"] is True

    old_view = client.get(f"/share/{created['token']}")
    assert old_view.status_code == 410
    _assert_share_security_headers(old_view)

    new_view = client.get(f"/share/{rotated['token']}")
    assert new_view.status_code == 200
    _assert_share_security_headers(new_view)


def test_share_token_revoke_expiry_delete_and_unknown(
    share_env: tuple[object, TestClient],
) -> None:
    """Verify revoke (410), expired (410), unknown (404), and delete (204)."""
    _, client = share_env
    trip_id = _create_trip_and_leg(client)["id"]

    created = client.post(f"/trips/{trip_id}/share-tokens", json={"label": "Temp"}).json()
    revoked = client.post(f"/trips/{trip_id}/share-tokens/{created['id']}/revoke").json()
    assert revoked["is_active"] is False and revoked["revoked_at"] is not None

    revoked_view = client.get(f"/share/{created['token']}")
    assert revoked_view.status_code == 410
    _assert_share_security_headers(revoked_view)

    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    expired = client.post(
        f"/trips/{trip_id}/share-tokens",
        json={"label": "Expired", "expires_at": past},
    ).json()
    assert expired["is_active"] is False
    expired_view = client.get(f"/share/{expired['token']}")
    assert expired_view.status_code == 410
    _assert_share_security_headers(expired_view)

    unknown_view = client.get("/share/nonexistent-capability-token-0000")
    assert unknown_view.status_code == 404
    _assert_share_security_headers(unknown_view)

    assert client.delete(f"/trips/{trip_id}/share-tokens/{expired['id']}").status_code == 204


def test_share_redaction_defaults_and_opt_in_toggles(
    share_env: tuple[object, TestClient],
) -> None:
    """Verify safe-by-default redaction, opt-in toggles, and Authentik header immunity."""
    _, client = share_env
    trip_id = _seed_rich_trip(client)["trip"]["id"]  # type: ignore[index]

    token_row = client.post(f"/trips/{trip_id}/share-tokens", json={"label": "Redaction"}).json()
    token_id, token_str = token_row["id"], token_row["token"]

    default_resp = client.get(
        f"/share/{token_str}",
        headers={"X-authentik-username": "spoofed-owner", "X-authentik-groups": "admins"},
    )
    assert default_resp.status_code == 200
    _assert_share_security_headers(default_resp)
    view = default_resp.json()
    assert "immich_album_id" not in view["trip"] and "vault_note_path" not in view["trip"]
    assert "map_packs" not in view
    assert view["trip"]["budget_nzd"] is None
    assert view["checklists"] == [] and view["attachments"] == []
    assert [n["title"] for n in view["travel_notes"]] == ["Meeting Point"]
    booking = view["bookings"][0]
    assert "source_email_message_id" not in booking
    assert booking["confirmation_code"] is None and booking["source_reference"] is None
    assert booking["quoted_cost"] is None and booking["quoted_currency"] is None

    patch_resp = client.patch(
        f"/trips/{trip_id}/share-tokens/{token_id}",
        json={
            "include_pnrs": True,
            "include_attachments": True,
            "include_costs": True,
            "include_checklists": True,
            "include_private_notes": True,
        },
    )
    assert patch_resp.status_code == 200

    full_view = client.get(f"/share/{token_str}").json()
    assert "immich_album_id" not in full_view["trip"]
    assert "vault_note_path" not in full_view["trip"]
    assert full_view["trip"]["budget_nzd"] == "4200.50"
    assert len(full_view["checklists"]) == 1
    assert {n["title"] for n in full_view["travel_notes"]} == {
        "Meeting Point",
        "Passport Backup PIN",
    }
    full_booking = full_view["bookings"][0]
    assert "source_email_message_id" not in full_booking
    assert full_booking["confirmation_code"] == "ODYS99"
    assert full_booking["quoted_cost"] == "1850.00" and full_booking["quoted_currency"] == "NZD"
    shared_att = full_view["attachments"][0]
    assert "extracted_text" not in shared_att and "content_bytes" not in shared_att
    assert shared_att["content_url"] == f"/api/share/{token_str}/attachments/{shared_att['id']}/content"


def test_share_attachment_idor_disabled_flag_and_range_streaming(
    share_env: tuple[object, TestClient],
) -> None:
    """Verify attachment gating, cross-trip IDOR 404, and 200/206/304/416 streaming."""
    _, client = share_env
    trip_a = _seed_rich_trip(client)
    trip_b = _seed_rich_trip(client)

    trip_a_id = trip_a["trip"]["id"]  # type: ignore[index]
    att_a = trip_a["attachment"]  # type: ignore[index]
    att_b = trip_b["attachment"]  # type: ignore[index]
    pdf_bytes = trip_a["pdf_bytes"]  # type: ignore[index]

    token_row = client.post(
        f"/trips/{trip_a_id}/share-tokens",
        json={"include_attachments": False},
    ).json()
    token_id, token_str = token_row["id"], token_row["token"]

    disabled = client.get(f"/share/{token_str}/attachments/{att_a['id']}/content")
    assert disabled.status_code == 404
    _assert_share_security_headers(disabled)

    client.patch(f"/trips/{trip_a_id}/share-tokens/{token_id}", json={"include_attachments": True})

    idor = client.get(f"/share/{token_str}/attachments/{att_b['id']}/content")
    assert idor.status_code == 404
    _assert_share_security_headers(idor)

    full = client.get(f"/share/{token_str}/attachments/{att_a['id']}/content")
    assert full.status_code == 200 and full.content == pdf_bytes
    _assert_share_security_headers(full)

    not_modified = client.get(
        f"/share/{token_str}/attachments/{att_a['id']}/content",
        headers={"If-None-Match": full.headers["etag"]},
    )
    assert not_modified.status_code == 304
    _assert_share_security_headers(not_modified)

    partial = client.get(
        f"/share/{token_str}/attachments/{att_a['id']}/content",
        headers={"Range": "bytes=0-15"},
    )
    assert partial.status_code == 206 and partial.content == pdf_bytes[:16]
    assert partial.headers["content-range"] == f"bytes 0-15/{len(pdf_bytes)}"
    _assert_share_security_headers(partial)

    bad_range = client.get(
        f"/share/{token_str}/attachments/{att_a['id']}/content",
        headers={"Range": "bytes=999999-1000005"},
    )
    assert bad_range.status_code == 416
    _assert_share_security_headers(bad_range)


def test_share_rate_limiter_per_ip_and_retry_after(
    share_env: tuple[object, TestClient],
) -> None:
    """Verify per-IP sliding-window rate limiting returns 429 + Retry-After + security headers."""
    app, client = share_env
    trip_id = _create_trip_and_leg(client)["id"]
    token_str = client.post(f"/trips/{trip_id}/share-tokens", json={}).json()["token"]

    now = [1000.0]
    limiter = InMemoryRateLimiter(limit=2, window_seconds=60, clock=lambda: now[0])
    app.dependency_overrides[get_share_rate_limiter] = lambda: limiter  # type: ignore[attr-defined]

    ip_a = {"X-Forwarded-For": "203.0.113.10, 10.0.0.1"}
    ip_b = {"X-Forwarded-For": "203.0.113.20"}

    assert client.get(f"/share/{token_str}", headers=ip_a).status_code == 200
    assert client.get(f"/share/{token_str}", headers=ip_a).status_code == 200

    blocked = client.get(f"/share/{token_str}", headers=ip_a)
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) >= 1
    _assert_share_security_headers(blocked)

    assert client.get(f"/share/{token_str}", headers=ip_b).status_code == 200

    now[0] += 61.0
    assert client.get(f"/share/{token_str}", headers=ip_a).status_code == 200
