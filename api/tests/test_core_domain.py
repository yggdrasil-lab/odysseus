"""Containerized PostgreSQL integration tests for Odysseus core travel domain."""

from collections.abc import Generator
import os
from pathlib import Path
import uuid

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import get_db
from app.main import create_app

API_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def db_session_factory() -> sessionmaker[Session]:
    """Run Alembic migrations against PostgreSQL and return a session factory."""
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        raise RuntimeError(
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL core domain tests."
        )
    alembic_cfg = Config(str(API_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_db_url)
    command.upgrade(alembic_cfg, "head")
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


def _create_trip(client: TestClient, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "Pacific Explorer",
        "slug": f"pacific-explorer-{uuid.uuid4().hex[:6]}",
        "status": "planning",
        "home_timezone": "Pacific/Auckland",
    }
    payload.update(overrides)
    response = client.post("/trips", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_trip_planning_nullable_dates_and_status_validation(client: TestClient) -> None:
    """Verify planning trips allow null dates while non-planning statuses require them."""
    trip = _create_trip(client, slug="harbor-planning", status="planning")
    assert trip["start_date"] is None
    assert trip["end_date"] is None
    assert trip["chronos_overlay_mode"] == "suppress_all_grid_blocks"

    bad_promote = client.patch(f"/trips/{trip['id']}", json={"status": "booked"})
    assert bad_promote.status_code == 422

    bad_booked = client.post(
        "/trips",
        json={"title": "Island Coast", "slug": "island-coast", "status": "booked"},
    )
    assert bad_booked.status_code == 422

    bad_order = client.post(
        "/trips",
        json={
            "title": "Inverted Dates",
            "slug": "inverted-dates",
            "status": "booked",
            "start_date": "2026-12-10",
            "end_date": "2026-12-08",
        },
    )
    assert bad_order.status_code == 422

    good_promote = client.patch(
        f"/trips/{trip['id']}",
        json={"status": "booked", "start_date": "2026-12-01", "end_date": "2026-12-03"},
    )
    assert good_promote.status_code == 200
    assert good_promote.json()["status"] == "booked"

    days = client.get(f"/trips/{trip['id']}/days").json()
    assert [day["date"] for day in days] == ["2026-12-01", "2026-12-02", "2026-12-03"]


def test_trip_slug_uniqueness_and_format_validation(client: TestClient) -> None:
    """Verify unique slug returns 409 and invalid slug/timezone returns 422."""
    _create_trip(client, slug="unique-coast-route")

    duplicate = client.post(
        "/trips",
        json={"title": "Duplicate Slug", "slug": "unique-coast-route"},
    )
    assert duplicate.status_code == 409

    bad_slug = client.post(
        "/trips",
        json={"title": "Bad Slug", "slug": "Upper_Case"},
    )
    assert bad_slug.status_code == 422

    bad_tz = client.post(
        "/trips",
        json={
            "title": "Bad TZ",
            "slug": "bad-tz-trip",
            "home_timezone": "Mars/Olympus_Mons",
        },
    )
    assert bad_tz.status_code == 422


def test_overlapping_legs_provision_days_idempotently(client: TestClient) -> None:
    """Verify overlapping Legs are allowed and never duplicate Trip Day rows."""
    trip = _create_trip(
        client,
        slug="overlapping-legs-trip",
        status="booked",
        start_date="2027-01-10",
        end_date="2027-01-12",
    )
    trip_id = trip["id"]

    leg_a = client.post(
        f"/trips/{trip_id}/legs",
        json={
            "name": "Harbor City",
            "primary_city": "Harbor City",
            "country_code": "NZ",
            "base_timezone": "Pacific/Auckland",
            "start_date": "2027-01-10",
            "end_date": "2027-01-13",
            "color": "#38bdf8",
        },
    )
    assert leg_a.status_code == 201

    leg_b = client.post(
        f"/trips/{trip_id}/legs",
        json={
            "name": "Island Coast",
            "primary_city": "Island Coast",
            "country_code": "JP",
            "base_timezone": "Asia/Tokyo",
            "start_date": "2027-01-12",
            "end_date": "2027-01-15",
            "color": "#f59e0b",
        },
    )
    assert leg_b.status_code == 201

    days = client.get(f"/trips/{trip_id}/days").json()
    assert [day["date"] for day in days] == [
        "2027-01-10",
        "2027-01-11",
        "2027-01-12",
        "2027-01-13",
        "2027-01-14",
        "2027-01-15",
    ]

    duplicate_day = client.post(f"/trips/{trip_id}/days", json={"date": "2027-01-12"})
    assert duplicate_day.status_code == 409


def test_itinerary_dst_utc_recomputation_and_backlog_transitions(client: TestClient) -> None:
    """Verify DST-safe UTC recomputation, invalid TZ rejection, and backlog toggling."""
    trip = _create_trip(
        client,
        slug="dst-utc-trip",
        status="booked",
        start_date="2027-01-15",
        end_date="2027-01-15",
    )
    trip_id = trip["id"]
    day_id = client.get(f"/trips/{trip_id}/days").json()[0]["id"]

    # Create in backlog (day_id=None) during NZDT (UTC+13)
    item_res = client.post(
        f"/trips/{trip_id}/itinerary-items",
        json={
            "day_id": None,
            "title": "Ferry Boarding",
            "category": "transit",
            "status": "idea",
            "start_local": "2027-01-15T09:00:00",
            "start_tz": "Pacific/Auckland",
            "end_local": "2027-01-15T10:30:00",
            "end_tz": "Pacific/Auckland",
            "place_label": "Harbor Pier 2",
        },
    )
    assert item_res.status_code == 201, item_res.text
    created = item_res.json()
    assert created["day_id"] is None
    assert created["start_utc"] == "2027-01-14T20:00:00Z"
    assert created["end_utc"] == "2027-01-14T21:30:00Z"

    # Schedule onto day and move local wall-clock to NZST winter (UTC+12)
    scheduled_res = client.patch(
        f"/trips/{trip_id}/itinerary-items/{created['id']}",
        json={
            "day_id": day_id,
            "status": "confirmed",
            "start_local": "2027-07-15T09:00:00",
            "end_local": "2027-07-15T10:30:00",
        },
    )
    assert scheduled_res.status_code == 200, scheduled_res.text
    scheduled = scheduled_res.json()
    assert scheduled["day_id"] == day_id
    assert scheduled["start_utc"] == "2027-07-14T21:00:00Z"
    assert scheduled["end_utc"] == "2027-07-14T22:30:00Z"

    # Unschedule back to backlog
    backlog_res = client.patch(
        f"/trips/{trip_id}/itinerary-items/{created['id']}",
        json={"day_id": None, "status": "planned"},
    )
    assert backlog_res.status_code == 200
    assert backlog_res.json()["day_id"] is None

    # Invalid timezone & inverted bounds fail with 422
    bad_tz = client.post(
        f"/trips/{trip_id}/itinerary-items",
        json={
            "title": "Bad TZ Item",
            "start_local": "2027-01-15T09:00:00",
            "start_tz": "Invalid/Zone",
        },
    )
    assert bad_tz.status_code == 422

    inverted = client.post(
        f"/trips/{trip_id}/itinerary-items",
        json={
            "title": "Inverted Time",
            "start_local": "2027-01-15T12:00:00",
            "start_tz": "Asia/Tokyo",
            "end_local": "2027-01-15T10:00:00",
            "end_tz": "Asia/Tokyo",
        },
    )
    assert inverted.status_code == 422


def test_checklists_notes_workspace_and_cross_trip_ownership(client: TestClient) -> None:
    """Verify typed checklists, private travel notes, workspace hydration, and cross-trip guards."""
    trip_a = _create_trip(
        client,
        title="Coastal Loop",
        slug="coastal-loop",
        status="booked",
        start_date="2027-02-01",
        end_date="2027-02-02",
    )
    trip_b = _create_trip(
        client,
        title="Mountain Trail",
        slug="mountain-trail",
        status="booked",
        start_date="2027-03-01",
        end_date="2027-03-01",
    )
    trip_a_id = trip_a["id"]
    trip_b_id = trip_b["id"]

    leg_a = client.post(
        f"/trips/{trip_a_id}/legs",
        json={
            "name": "Bay Town",
            "primary_city": "Bay Town",
            "base_timezone": "Pacific/Auckland",
            "start_date": "2027-02-01",
            "end_date": "2027-02-02",
        },
    ).json()
    day_b = client.get(f"/trips/{trip_b_id}/days").json()[0]
    leg_b = client.post(
        f"/trips/{trip_b_id}/legs",
        json={
            "name": "Ridge Camp",
            "primary_city": "Ridge Camp",
            "base_timezone": "Pacific/Auckland",
            "start_date": "2027-03-01",
            "end_date": "2027-03-01",
        },
    ).json()

    checklist = client.post(
        f"/trips/{trip_a_id}/checklists",
        json={"title": "Carry-on Gear", "list_type": "packing"},
    ).json()
    chk_item = client.post(
        f"/trips/{trip_a_id}/checklists/{checklist['id']}/items",
        json={"label": "Rain shell", "leg_id": leg_a["id"]},
    ).json()
    toggled = client.patch(
        f"/trips/{trip_a_id}/checklists/{checklist['id']}/items/{chk_item['id']}",
        json={"is_completed": True},
    )
    assert toggled.status_code == 200
    assert toggled.json()["is_completed"] is True

    note = client.post(
        f"/trips/{trip_a_id}/notes",
        json={
            "title": "Locker Code Memo",
            "body": "Alex Tan keeps spare pass in inner pocket.",
            "is_private": True,
            "leg_id": leg_a["id"],
        },
    )
    assert note.status_code == 201
    assert note.json()["is_private"] is True

    # Cross-trip references must fail loudly with 422
    cross_item = client.post(
        f"/trips/{trip_a_id}/itinerary-items",
        json={"title": "Sneaky Day Ref", "day_id": day_b["id"]},
    )
    assert cross_item.status_code == 422

    cross_chk = client.post(
        f"/trips/{trip_a_id}/checklists/{checklist['id']}/items",
        json={"label": "Sneaky Leg Ref", "leg_id": leg_b["id"]},
    )
    assert cross_chk.status_code == 422

    cross_note = client.post(
        f"/trips/{trip_a_id}/notes",
        json={"title": "Sneaky Note", "body": "Cross trip", "day_id": day_b["id"]},
    )
    assert cross_note.status_code == 422

    workspace = client.get(f"/trips/{trip_a_id}/workspace")
    assert workspace.status_code == 200
    body = workspace.json()
    assert body["trip"]["id"] == trip_a_id
    assert len(body["legs"]) == 1
    assert len(body["days"]) == 2
    assert len(body["checklists"]) == 1
    assert body["checklists"][0]["items"][0]["is_completed"] is True
    assert len(body["travel_notes"]) == 1
    assert body["travel_notes"][0]["is_private"] is True
