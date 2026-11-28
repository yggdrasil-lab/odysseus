"""Containerized PostgreSQL integration tests for Ticket 10 inbound email ingestion & draft review."""

import base64
from collections.abc import Generator
import io
import os
from pathlib import Path
import uuid

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import get_db
from app.main import create_app
from app.models import Attachment, Booking

API_DIR = Path(__file__).resolve().parents[1]
INTEGRATION_TOKEN = "test-iris-odysseus-secret-token"


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
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL inbound email tests."
        )
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", test_db_url)
    return cfg


@pytest.fixture(scope="module")
def db_session_factory(alembic_cfg: Config) -> sessionmaker[Session]:
    """Upgrade Alembic migrations to head and return a PostgreSQL session factory."""
    command.upgrade(alembic_cfg, "head")
    test_db_url = alembic_cfg.get_main_option("sqlalchemy.url")
    assert test_db_url is not None
    engine = create_engine(test_db_url, pool_pre_ping=True)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _build_client(
    db_session_factory: sessionmaker[Session],
    integration_token: str = INTEGRATION_TOKEN,
) -> TestClient:
    app = create_app(Settings(environment="development", integration_token=integration_token))

    def override_db() -> Generator[Session, None, None]:
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


@pytest.fixture()
def env(
    db_session_factory: sessionmaker[Session],
) -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    """Yield configured TestClient backed by clean PostgreSQL state."""
    with db_session_factory() as cleanup_session:
        cleanup_session.execute(
            text("TRUNCATE TABLE bookings, attachments, trips RESTART IDENTITY CASCADE")
        )
        cleanup_session.commit()

    yield _build_client(db_session_factory), db_session_factory


def _auth_headers(token: str = INTEGRATION_TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_trip(
    client: TestClient,
    *,
    title: str = "Pacific Crossing",
    start_date: str = "2027-01-12",
    end_date: str = "2027-01-16",
    status: str = "booked",
) -> dict[str, object]:
    resp = client.post(
        "/trips",
        json={
            "title": title,
            "slug": f"trip-{uuid.uuid4().hex[:8]}",
            "status": status,
            "start_date": start_date,
            "end_date": end_date,
            "home_timezone": "Pacific/Auckland",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_alembic_0007_downgrade_and_upgrade_cycle(
    alembic_cfg: Config,
    db_session_factory: sessionmaker[Session],
) -> None:
    """Verify 0007_inbound_email_bookings downgrades cleanly to 0006 and re-upgrades to head."""
    command.downgrade(alembic_cfg, "0006_share_tokens")
    engine = db_session_factory.kw["bind"]
    inspector = inspect(engine)
    booking_cols = {col["name"] for col in inspector.get_columns("bookings")}
    assert "raw_email_payload" not in booking_cols
    att_cols = {col["name"]: col for col in inspector.get_columns("attachments")}
    assert att_cols["trip_id"]["nullable"] is False

    command.upgrade(alembic_cfg, "head")
    inspector = inspect(engine)
    booking_cols = {col["name"] for col in inspector.get_columns("bookings")}
    assert "raw_email_payload" in booking_cols
    att_cols = {col["name"]: col for col in inspector.get_columns("attachments")}
    assert att_cols["trip_id"]["nullable"] is True


def test_integration_auth_fail_closed_and_ignores_authentik_headers(
    db_session_factory: sessionmaker[Session],
) -> None:
    """Verify 503 when unconfigured, 401 on missing/wrong Bearer, and Authentik immunity."""
    with db_session_factory() as cleanup_session:
        cleanup_session.execute(
            text("TRUNCATE TABLE bookings, attachments, trips RESTART IDENTITY CASCADE")
        )
        cleanup_session.commit()

    payload = {
        "email_id": "iris-email-auth-1",
        "message_id": "<auth-1@airline.example>",
        "subject": "Flight Confirmation",
    }

    unconfigured_client = _build_client(db_session_factory, integration_token="")
    resp_503 = unconfigured_client.post("/integrations/email", json=payload)
    assert resp_503.status_code == 503

    configured_client = _build_client(db_session_factory, integration_token=INTEGRATION_TOKEN)
    resp_missing = configured_client.post(
        "/integrations/email",
        json=payload,
        headers={
            "X-authentik-username": "spoofed-owner",
            "X-authentik-groups": "admins",
        },
    )
    assert resp_missing.status_code == 401

    resp_wrong = configured_client.post(
        "/integrations/email",
        json=payload,
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert resp_wrong.status_code == 401


def test_inbound_email_idempotency_and_date_matched_auto_link_with_share_redaction(
    env: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verify 201->200 idempotency, date auto-link, PDF extraction, and draft share exclusion."""
    client, session_factory = env
    trip = _create_trip(
        client,
        title="Tokyo Winter Escape",
        start_date="2027-02-10",
        end_date="2027-02-15",
    )
    trip_id = str(trip["id"])

    pdf_bytes = _build_minimal_pdf("E-Ticket PNR: KLM774 Total NZD 1490.00 on 2027-02-11")
    ics_bytes = b"BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n"
    webhook_payload = {
        "email_id": "iris-email-101",
        "message_id": "<msg-101@airline.example>",
        "route_target": "odysseus",
        "from_address": "Pacific Air <bookings@pacificair.example>",
        "to_address": "travel@inbox.example",
        "subject": "Fwd: Pacific Air E-Ticket Confirmation",
        "received_at": "2027-01-15T04:12:00Z",
        "text_body": "Passenger: Alex Tan. Flight AKL to NRT departing 11 Feb 2027.",
        "html_excerpt": "<p>Flight AKL to NRT</p>",
        "raw_excerpt": "Flight AKL to NRT",
        "jev_verdict": "travel_booking",
        "attachments": [
            {
                "filename": "e-ticket.pdf",
                "content_type": "application/pdf",
                "size_bytes": len(pdf_bytes),
                "content_base64": base64.b64encode(pdf_bytes).decode("ascii"),
            },
            {
                "filename": "flight.ics",
                "content_type": "text/calendar",
                "size_bytes": len(ics_bytes),
                "content_base64": base64.b64encode(ics_bytes).decode("ascii"),
            },
        ],
    }

    first = client.post("/integrations/email", json=webhook_payload, headers=_auth_headers())
    assert first.status_code == 201, first.text
    first_data = first.json()
    assert first_data["status"] == "staged"
    assert first_data["duplicate"] is False
    assert first_data["trip_id"] == trip_id
    assert first_data["booking_status"] == "draft"
    assert first_data["consumer_ref"] == f"booking:{first_data['booking_id']}"
    assert first_data["attachments_saved"] == 1
    assert first_data["skipped_attachments"] == []

    second = client.post("/integrations/email", json=webhook_payload, headers=_auth_headers())
    assert second.status_code == 200, second.text
    second_data = second.json()
    assert second_data["status"] == "duplicate"
    assert second_data["duplicate"] is True
    assert second_data["booking_id"] == first_data["booking_id"]

    with session_factory() as db:
        booking_count = len(list(db.scalars(select(Booking))))
        assert booking_count == 1

    workspace = client.get(f"/trips/{trip_id}/workspace").json()
    assert len(workspace["bookings"]) == 1
    booking = workspace["bookings"][0]
    assert booking["status"] == "draft"
    assert booking["booking_type"] == "flight"
    assert booking["title"] == "Pacific Air E-Ticket Confirmation"
    assert booking["provider"] == "Pacific Air"
    assert booking["confirmation_code"] == "KLM774"
    assert booking["quoted_cost"] == "1490.00"
    assert booking["quoted_currency"] == "NZD"
    assert booking["raw_email_payload"]["matched_trip_reason"] == "exact_date_match"
    assert "content_base64" not in str(booking["raw_email_payload"])
    assert len(workspace["attachments"]) == 1
    att_id = workspace["attachments"][0]["id"]
    assert "KLM774" in (workspace["attachments"][0]["extracted_text"] or "")

    token_str = client.post(
        f"/trips/{trip_id}/share-tokens",
        json={"label": "Companion", "include_attachments": True, "include_pnrs": True},
    ).json()["token"]
    shared_before = client.get(f"/share/{token_str}").json()
    assert shared_before["bookings"] == []
    assert shared_before["attachments"] == []
    assert client.get(f"/share/{token_str}/attachments/{att_id}/content").status_code == 404

    confirmed = client.post(f"/trips/{trip_id}/bookings/{booking['id']}/confirm")
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "confirmed"

    shared_after = client.get(f"/share/{token_str}").json()
    assert len(shared_after["bookings"]) == 1
    assert shared_after["bookings"][0]["confirmation_code"] == "KLM774"
    assert len(shared_after["attachments"]) == 1
    assert client.get(f"/share/{token_str}/attachments/{att_id}/content").status_code == 200


def test_unmatched_email_oversized_skip_and_unassigned_inbox_assign_and_delete(
    env: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verify unmatched staging, >15 MB graceful skip, unassigned streaming, assign, and delete."""
    client, session_factory = env
    trip = _create_trip(
        client,
        title="South Island Roadtrip",
        start_date="2027-04-01",
        end_date="2027-04-06",
    )
    trip_id = str(trip["id"])

    valid_pdf = _build_minimal_pdf("Harbour Lodge Booking Ref: HTL552 Total SGD 420.50")
    oversized_pdf = b"%PDF-1.4\n" + (b"0" * (15 * 1024 * 1024 + 64))

    bad_b64_resp = client.post(
        "/integrations/email",
        json={
            "message_id": "<bad-b64@hotel.example>",
            "subject": "Hotel Voucher",
            "attachments": [
                {
                    "filename": "voucher.pdf",
                    "content_type": "application/pdf",
                    "content_base64": "%%%not-valid-base64%%%",
                }
            ],
        },
        headers=_auth_headers(),
    )
    assert bad_b64_resp.status_code == 422

    ingest_resp = client.post(
        "/integrations/email",
        json={
            "email_id": "iris-email-202",
            "message_id": "<msg-202@hotel.example>",
            "from_address": "Harbour Lodge <reservations@harbourlodge.example>",
            "subject": "Hotel Reservation Confirmation",
            "text_body": "Check-in 2027-09-10 for Alex Tan. Total SGD 420.50.",
            "attachments": [
                {
                    "filename": "brochure-huge.pdf",
                    "content_type": "application/pdf",
                    "content_base64": base64.b64encode(oversized_pdf).decode("ascii"),
                },
                {
                    "filename": "hotel-voucher.pdf",
                    "content_type": "application/pdf",
                    "content_base64": base64.b64encode(valid_pdf).decode("ascii"),
                },
            ],
        },
        headers=_auth_headers(),
    )
    assert ingest_resp.status_code == 201, ingest_resp.text
    staged = ingest_resp.json()
    assert staged["trip_id"] is None
    assert staged["booking_status"] == "draft"
    assert staged["attachments_saved"] == 1
    assert staged["skipped_attachments"] == ["brochure-huge.pdf"]

    inbox = client.get("/bookings/unassigned")
    assert inbox.status_code == 200, inbox.text
    items = inbox.json()
    assert len(items) == 1
    unassigned = items[0]
    assert unassigned["id"] == staged["booking_id"]
    assert unassigned["booking_type"] == "lodging"
    assert unassigned["confirmation_code"] == "HTL552"
    assert "brochure-huge.pdf" in (unassigned["notes"] or "")
    assert len(unassigned["attachments"]) == 1
    att_id = unassigned["attachments"][0]["id"]
    assert unassigned["attachments"][0]["trip_id"] is None
    assert "content_bytes" not in unassigned["attachments"][0]

    content_url = f"/bookings/unassigned/{unassigned['id']}/attachments/{att_id}/content"
    full = client.get(content_url)
    assert full.status_code == 200
    assert full.content == valid_pdf
    assert client.get(content_url, headers={"If-None-Match": full.headers["etag"]}).status_code == 304
    partial = client.get(content_url, headers={"Range": "bytes=0-7"})
    assert partial.status_code == 206
    assert partial.content == valid_pdf[:8]

    assign_resp = client.post(
        f"/bookings/unassigned/{unassigned['id']}/assign",
        json={"trip_id": trip_id, "confirm": True},
    )
    assert assign_resp.status_code == 200, assign_resp.text
    assigned = assign_resp.json()
    assert assigned["trip_id"] == trip_id
    assert assigned["status"] == "confirmed"

    assert client.get("/bookings/unassigned").json() == []
    workspace = client.get(f"/trips/{trip_id}/workspace").json()
    assert len(workspace["bookings"]) == 1
    assert len(workspace["attachments"]) == 1
    assert workspace["attachments"][0]["trip_id"] == trip_id

    second_ingest = client.post(
        "/integrations/email",
        json={
            "email_id": "iris-email-203",
            "message_id": "<msg-203@ferry.example>",
            "subject": "Cook Strait Ferry Ticket",
            "text_body": "Ferry sailing 2027-11-20 for Alex Tan.",
            "attachments": [
                {
                    "filename": "ferry-pass.pdf",
                    "content_type": "application/pdf",
                    "content_base64": base64.b64encode(valid_pdf).decode("ascii"),
                }
            ],
        },
        headers=_auth_headers(),
    )
    assert second_ingest.status_code == 201
    dismiss_id = second_ingest.json()["booking_id"]

    delete_resp = client.delete(f"/bookings/unassigned/{dismiss_id}")
    assert delete_resp.status_code == 204
    assert client.get("/bookings/unassigned").json() == []

    with session_factory() as db:
        orphans = list(db.scalars(select(Attachment).where(Attachment.trip_id.is_(None))))
        assert orphans == []


def test_inbound_date_matching_margin_ambiguity_and_assign_draft_confirm(
    env: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verify +/-1d margin match, multi-trip tie stays unassigned, assign-draft & confirm guard."""
    client, _ = env
    trip_a = _create_trip(client, title="Osaka Spring", start_date="2027-06-10", end_date="2027-06-14")
    trip_b = _create_trip(client, title="Kyoto Overlap", start_date="2027-06-12", end_date="2027-06-16")
    trip_c = _create_trip(client, title="Fiji Break", start_date="2027-08-10", end_date="2027-08-14")

    blank_msg = client.post(
        "/integrations/email",
        json={"message_id": "   ", "subject": "Blank ID"},
        headers=_auth_headers(),
    )
    assert blank_msg.status_code == 422

    margin_resp = client.post(
        "/integrations/email",
        json={
            "message_id": "<margin-1@airline.example>",
            "subject": "Fiji Resort Shuttle",
            "text_body": "Pickup scheduled 2027-08-09 ahead of stay.",
        },
        headers=_auth_headers(),
    )
    assert margin_resp.status_code == 201
    assert margin_resp.json()["trip_id"] == str(trip_c["id"])

    tie_pdf = _build_minimal_pdf("JR Rail Pass Confirmation REF9981")
    tie_resp = client.post(
        "/integrations/email",
        json={
            "message_id": "<tie-1@rail.example>",
            "subject": "Shinkansen Voucher",
            "text_body": "Travel date 2027-06-13 between cities.",
            "attachments": [
                {
                    "filename": "rail-pass.pdf",
                    "content_type": "application/pdf",
                    "content_base64": base64.b64encode(tie_pdf).decode("ascii"),
                }
            ],
        },
        headers=_auth_headers(),
    )
    assert tie_resp.status_code == 201
    tie_data = tie_resp.json()
    assert tie_data["trip_id"] is None
    assert tie_data["booking_status"] == "draft"

    assign_draft = client.post(
        f"/bookings/unassigned/{tie_data['booking_id']}/assign",
        json={"trip_id": str(trip_a["id"]), "confirm": False},
    )
    assert assign_draft.status_code == 200
    assert assign_draft.json()["status"] == "draft"
    assert assign_draft.json()["trip_id"] == str(trip_a["id"])

    token_str = client.post(
        f"/trips/{trip_a['id']}/share-tokens",
        json={"include_attachments": True},
    ).json()["token"]
    assert client.get(f"/share/{token_str}").json()["bookings"] == []

    cancelled = client.post(
        f"/trips/{trip_b['id']}/bookings",
        json={"booking_type": "activity", "status": "cancelled", "title": "Cancelled Tour"},
    ).json()
    bad_confirm = client.post(f"/trips/{trip_b['id']}/bookings/{cancelled['id']}/confirm")
    assert bad_confirm.status_code == 422


def test_inbound_email_id_integer_coercion_and_validation(
    env: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verify Iris integer email_id values coerce to str while booleans return HTTP 422."""
    client, session_factory = env
    cases: list[tuple[int | str | None, str, str | None]] = [
        (21, "<int-21@airline.example.com>", "21"),
        (0, "<int-0@airline.example.com>", "0"),
        ("iris-str-42", "<str-42@airline.example.com>", "iris-str-42"),
        (None, "<none-id@airline.example.com>", None),
    ]
    for email_id, message_id, expected_ref in cases:
        resp = client.post(
            "/integrations/email",
            json={
                "email_id": email_id,
                "message_id": message_id,
                "from_address": "flight@airline.example.com",
                "subject": "Flight Confirmation ABC123",
                "text_body": "Itinerary confirmation ABC123.",
            },
            headers=_auth_headers(),
        )
        assert resp.status_code == 201, resp.text
        booking_id = uuid.UUID(resp.json()["booking_id"])
        with session_factory() as db:
            booking = db.get(Booking, booking_id)
            assert booking is not None
            assert booking.source_reference == expected_ref

    bool_resp = client.post(
        "/integrations/email",
        json={
            "email_id": True,
            "message_id": "<bool-id@airline.example.com>",
            "from_address": "flight@airline.example.com",
            "subject": "Invalid email_id",
        },
        headers=_auth_headers(),
    )
    assert bool_resp.status_code == 422
