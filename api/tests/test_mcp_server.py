"""Containerized PostgreSQL integration tests for Odysseus Bearer-authenticated POST /mcp."""

from collections.abc import Generator
from datetime import date, datetime
import json
import os
from pathlib import Path
from typing import Any
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
from app.schemas import (
    BookingCreate,
    BookingSegmentCreate,
    ChecklistCreate,
    ChecklistItemCreate,
    ItineraryItemCreate,
    LegCreate,
    PlaceCreate,
    TravelNoteCreate,
    TripCreate,
)
from app.services import (
    booking_service,
    checklist_note_service,
    itinerary_service,
    leg_day_service,
    place_service,
    trip_service,
)

API_DIR = Path(__file__).resolve().parents[1]
MCP_URL = "/mcp"
PROTOCOL_VERSION = "2025-06-18"
MCP_TOKEN = "synthetic-odysseus-mcp-token"

EXPECTED_TOOL_NAMES = {
    "odysseus_list_trips",
    "odysseus_get_trip_overview",
    "odysseus_get_day_brief",
    "odysseus_get_checklists",
    "odysseus_export_trip_markdown",
    "odysseus_add_place",
    "odysseus_add_itinerary_item",
    "odysseus_add_travel_note",
    "odysseus_upsert_checklist_item",
}


def _prod_settings(mcp_token: str = MCP_TOKEN) -> Settings:
    if not mcp_token:
        return Settings.model_construct(environment="production", mcp_token="")
    return Settings(
        environment="production",
        mcp_token=mcp_token,
        db_password="synthetic-db-password",
        integration_token="synthetic-integration-token",
        immich_api_key="synthetic-immich-key",
        plutus_api_url="http://plutus:8000",
        chronos_api_url="http://chronos:8000",
        immich_api_url="http://immich:2283",
        domain_name="odysseus.example.com",
    )


def _rpc(
    client: TestClient,
    method: str,
    params: dict[str, Any] | None = None,
    *,
    token: str | None = MCP_TOKEN,
    extra_headers: dict[str, str] | None = None,
    request_id: int = 1,
) -> dict[str, Any]:
    body: dict[str, Any] = {"jsonrpc": "2.0", "method": method, "id": request_id}
    if params is not None:
        body["params"] = params

    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if extra_headers:
        headers.update(extra_headers)

    response = client.post(MCP_URL, json=body, headers=headers)
    assert response.status_code == 200, response.text
    content_type = response.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        for line in response.text.splitlines():
            if line.startswith("data:"):
                return json.loads(line[len("data:") :].strip())
        raise AssertionError(f"No data frame in event stream: {response.text!r}")
    return response.json()


def _call_tool(
    client: TestClient,
    name: str,
    arguments: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    rpc_payload = _rpc(client, "tools/call", {"name": name, "arguments": arguments})
    result = rpc_payload["result"]
    if result.get("isError"):
        return rpc_payload, {}
    text_body = result["content"][0]["text"]
    return rpc_payload, json.loads(text_body)


@pytest.fixture(scope="module")
def db_session_factory() -> sessionmaker[Session]:
    """Run Alembic migrations against PostgreSQL and return a session factory."""
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        raise RuntimeError(
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL MCP tests."
        )
    alembic_cfg = Config(str(API_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_db_url)
    command.upgrade(alembic_cfg, "head")
    engine = create_engine(test_db_url, pool_pre_ping=True)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def mcp_env(
    db_session_factory: sessionmaker[Session],
) -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    """Yield a lifespan-started TestClient backed by PostgreSQL with clean tables."""
    with db_session_factory() as cleanup_session:
        cleanup_session.execute(text("TRUNCATE TABLE trips RESTART IDENTITY CASCADE"))
        cleanup_session.commit()

    app = create_app(_prod_settings())

    def override_db() -> Generator[Session, None, None]:
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        yield client, db_session_factory


def _seed_sample_trip(session_factory: sessionmaker[Session]) -> dict[str, str]:
    with session_factory() as db:
        trip = trip_service.create_trip(
            db,
            TripCreate(
                title="Kyoto Spring 2027",
                slug="kyoto-spring-2027",
                status="booked",
                start_date=date(2027, 4, 10),
                end_date=date(2027, 4, 12),
                home_timezone="Pacific/Auckland",
                immich_album_id="secret-immich-album-1001",
                vault_note_path="second-brain/Efforts/Kyoto/Kyoto.md",
                summary=f"Synthetic trip for Alex Tan \u2014 cherry blossom season.",
            ),
        )
        leg = leg_day_service.create_leg(
            db,
            trip.id,
            LegCreate(
                name="Kyoto Base",
                primary_city="Kyoto",
                country_code="JP",
                base_timezone="Asia/Tokyo",
                start_date=date(2027, 4, 11),
                end_date=date(2027, 4, 12),
            ),
        )
        days = leg_day_service.list_days(db, trip.id)
        day_apr11 = next(day for day in days if day.date == date(2027, 4, 11))
        place = place_service.create_place(
            db,
            trip.id,
            PlaceCreate(
                name="Fushimi Inari Taisha",
                category="activity",
                latitude=34.9671,
                longitude=135.7727,
            ),
        )
        itinerary_service.create_itinerary_item(
            db,
            trip.id,
            ItineraryItemCreate(
                day_id=day_apr11.id,
                title="Morning Shrine Walk",
                category="activity",
                status="planned",
                start_local=datetime(2027, 4, 11, 7, 30),
                start_tz="Asia/Tokyo",
                end_local=datetime(2027, 4, 11, 9, 30),
                end_tz="Asia/Tokyo",
                place_id=place.id,
                sort_order=1,
            ),
        )
        booking_service.create_booking(
            db,
            trip.id,
            BookingCreate(
                booking_type="flight",
                status="confirmed",
                title="AKL to KIX Flight",
                provider="Air New Zealand",
                confirmation_code="REF1001",
                segments=[
                    BookingSegmentCreate(
                        segment_order=0,
                        carrier="NZ",
                        flight_or_service_number="NZ99",
                        origin_label="Auckland",
                        origin_code="AKL",
                        destination_label="Osaka Kansai",
                        destination_code="KIX",
                        departure_local=datetime(2027, 4, 10, 9, 45),
                        departure_tz="Pacific/Auckland",
                        arrival_local=datetime(2027, 4, 11, 17, 30),
                        arrival_tz="Asia/Tokyo",
                    )
                ],
            ),
        )
        booking_service.create_booking(
            db,
            trip.id,
            BookingCreate(
                booking_type="transport",
                status="draft",
                title="Draft Shinkansen Option",
                segments=[
                    BookingSegmentCreate(
                        segment_order=0,
                        origin_label="Osaka",
                        destination_label="Kyoto",
                        departure_local=datetime(2027, 4, 11, 18, 30),
                        departure_tz="Asia/Tokyo",
                        arrival_local=datetime(2027, 4, 11, 19, 0),
                        arrival_tz="Asia/Tokyo",
                    )
                ],
            ),
        )
        checklist = checklist_note_service.create_checklist(
            db,
            trip.id,
            ChecklistCreate(title="Carry-On Packing", list_type="packing"),
        )
        checklist_note_service.create_checklist_item(
            db,
            trip.id,
            checklist.id,
            ChecklistItemCreate(label="Passport", is_completed=True, sort_order=1),
        )
        checklist_note_service.create_note(
            db,
            trip.id,
            TravelNoteCreate(
                leg_id=leg.id,
                title=f"IC Card \u2013 Reminder",
                body="Load ICOCA card at Kansai Airport.",
            ),
        )
        return {
            "trip_id": str(trip.id),
            "leg_id": str(leg.id),
            "day_apr11_id": str(day_apr11.id),
            "checklist_id": str(checklist.id),
        }


def test_mcp_auth_matrix_and_ignores_spoofed_authentik_headers(
    db_session_factory: sessionmaker[Session],
) -> None:
    """Verify 503 when unconfigured in prod, 401 on bad/missing Bearer, and Authentik header rejection."""
    del db_session_factory
    init_body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "odysseus-test", "version": "0.1.0"},
        },
    }
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
    }

    with TestClient(create_app(_prod_settings(""))) as unconfigured_client:
        res_503 = unconfigured_client.post(MCP_URL, json=init_body, headers=headers)
        assert res_503.status_code == 503

    with TestClient(create_app(_prod_settings(MCP_TOKEN))) as auth_client:
        spoofed_missing = auth_client.post(
            MCP_URL,
            json=init_body,
            headers={**headers, "X-authentik-username": "alex.tan"},
        )
        assert spoofed_missing.status_code == 401
        assert spoofed_missing.headers["www-authenticate"] == "Bearer"

        spoofed_wrong = auth_client.post(
            MCP_URL,
            json=init_body,
            headers={
                **headers,
                "Authorization": "Bearer wrong-secret",
                "X-authentik-username": "alex.tan",
            },
        )
        assert spoofed_wrong.status_code == 401


def test_mcp_initialize_and_tools_list_exact_scope(
    mcp_env: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verify initialize returns 2025-06-18 stateless JSON and tools/list exposes only the 9 tools."""
    client, _ = mcp_env
    init_res = _rpc(
        client,
        "initialize",
        {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "odysseus-test", "version": "0.1.0"},
        },
    )
    assert init_res["result"]["protocolVersion"] == PROTOCOL_VERSION
    assert init_res["result"]["serverInfo"]["name"] == "odysseus"

    tools_res = _rpc(client, "tools/list", {})
    names = {tool["name"] for tool in tools_res["result"]["tools"]}
    assert names == EXPECTED_TOOL_NAMES


def test_mcp_read_tools_and_day_brief_projection(
    mcp_env: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verify all 5 read tools, segment departure/arrival projection, and dash sanitization."""
    client, session_factory = mcp_env
    seeded = _seed_sample_trip(session_factory)
    trip_id = seeded["trip_id"]

    _, listed = _call_tool(client, "odysseus_list_trips", {})
    assert listed["count"] == 1
    assert listed["trips"][0]["slug"] == "kyoto-spring-2027"
    assert "immich_album_id" not in listed["trips"][0]

    _, overview = _call_tool(client, "odysseus_get_trip_overview", {"trip_id": trip_id})
    assert overview["day_count"] == 3
    assert overview["checklist_progress"]["completed_items"] == 1
    assert overview["bookings_summary"]["total_count"] == 2
    assert "immich_album_id" not in overview["trip"]
    assert "share_tokens" not in overview

    _, apr10_brief = _call_tool(
        client,
        "odysseus_get_day_brief",
        {"trip_id": trip_id, "target_date": "2027-04-10"},
    )
    assert len(apr10_brief["departing_segments"]) == 1
    assert apr10_brief["departing_segments"][0]["origin_code"] == "AKL"
    assert apr10_brief["arriving_segments"] == []

    _, apr11_brief = _call_tool(
        client,
        "odysseus_get_day_brief",
        {"trip_id": trip_id, "target_date": "2027-04-11"},
    )
    assert apr11_brief["day"]["date"] == "2027-04-11"
    assert len(apr11_brief["active_legs"]) == 1
    assert apr11_brief["active_legs"][0]["name"] == "Kyoto Base"
    assert len(apr11_brief["itinerary_items"]) == 1
    assert apr11_brief["itinerary_items"][0]["start_local"] == "2027-04-11T07:30:00"
    assert apr11_brief["itinerary_items"][0]["start_tz"] == "Asia/Tokyo"
    assert apr11_brief["departing_segments"] == []
    assert len(apr11_brief["arriving_segments"]) == 1
    assert apr11_brief["arriving_segments"][0]["destination_code"] == "KIX"
    assert isinstance(apr11_brief["days_until_departure"], int)

    _, checklists = _call_tool(client, "odysseus_get_checklists", {"trip_id": trip_id})
    assert len(checklists["checklists"]) == 1
    assert checklists["checklists"][0]["items"][0]["label"] == "Passport"

    _, exported = _call_tool(
        client,
        "odysseus_export_trip_markdown",
        {"trip_id": trip_id},
    )
    assert "Kyoto Spring 2027" in exported["markdown"]
    assert "\u2014" not in exported["markdown"]
    assert "\u2013" not in exported["markdown"]


def test_mcp_additive_write_tools_and_idempotent_checklist_upsert(
    mcp_env: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verify all 4 additive write tools persist cleanly and upsert checklist items idempotently."""
    client, session_factory = mcp_env
    seeded = _seed_sample_trip(session_factory)
    trip_id = seeded["trip_id"]
    day_id = seeded["day_apr11_id"]
    leg_id = seeded["leg_id"]
    checklist_id = seeded["checklist_id"]

    _, created_place = _call_tool(
        client,
        "odysseus_add_place",
        {
            "trip_id": trip_id,
            "name": "Nishiki Market",
            "category": "food",
            "latitude": 35.005,
            "longitude": 135.7649,
            "is_backlog": True,
        },
    )
    assert created_place["name"] == "Nishiki Market"
    place_id = created_place["id"]

    _, created_item = _call_tool(
        client,
        "odysseus_add_itinerary_item",
        {
            "trip_id": trip_id,
            "day_id": day_id,
            "title": "Lunch at Nishiki Market",
            "category": "food",
            "status": "planned",
            "start_local": "2027-04-11T12:00:00",
            "start_tz": "Asia/Tokyo",
            "place_id": place_id,
        },
    )
    assert created_item["title"] == "Lunch at Nishiki Market"
    assert created_item["start_utc"] is not None

    _, created_note = _call_tool(
        client,
        "odysseus_add_travel_note",
        {
            "trip_id": trip_id,
            "leg_id": leg_id,
            "title": "Pocket Wi-Fi Pickup",
            "body": "Collect at KIX Terminal 1 counter.",
        },
    )
    assert created_note["title"] == "Pocket Wi-Fi Pickup"

    _, upserted_new = _call_tool(
        client,
        "odysseus_upsert_checklist_item",
        {
            "trip_id": trip_id,
            "checklist_id": checklist_id,
            "label": "Universal Adapter",
            "is_checked": False,
        },
    )
    assert upserted_new["label"] == "Universal Adapter"
    assert upserted_new["is_completed"] is False

    _, toggled_by_label = _call_tool(
        client,
        "odysseus_upsert_checklist_item",
        {
            "trip_id": trip_id,
            "checklist_id": checklist_id,
            "label": "  universal adapter ",
            "is_checked": True,
        },
    )
    assert toggled_by_label["id"] == upserted_new["id"]
    assert toggled_by_label["is_completed"] is True

    _, toggled_by_id = _call_tool(
        client,
        "odysseus_upsert_checklist_item",
        {
            "trip_id": trip_id,
            "checklist_id": checklist_id,
            "label": "Type-A Adapter",
            "is_checked": False,
            "item_id": upserted_new["id"],
        },
    )
    assert toggled_by_id["id"] == upserted_new["id"]
    assert toggled_by_id["label"] == "Type-A Adapter"
    assert toggled_by_id["is_completed"] is False

    _, checklists = _call_tool(client, "odysseus_get_checklists", {"trip_id": trip_id})
    assert len(checklists["checklists"][0]["items"]) == 2


def test_mcp_rejects_disallowed_tools_and_domain_errors_without_mutation(
    mcp_env: tuple[TestClient, sessionmaker[Session]],
) -> None:
    """Verify destructive/ShareToken/confirm calls fail cleanly and invalid args return isError."""
    client, session_factory = mcp_env
    seeded = _seed_sample_trip(session_factory)
    trip_id = seeded["trip_id"]

    for forbidden_tool in (
        "odysseus_delete_trip",
        "odysseus_confirm_booking",
        "odysseus_create_share_token",
    ):
        rpc_res = _rpc(
            client,
            "tools/call",
            {"name": forbidden_tool, "arguments": {"trip_id": trip_id}},
        )
        assert rpc_res.get("error") is not None or rpc_res["result"].get("isError") is True

    missing_trip_res, _ = _call_tool(
        client,
        "odysseus_get_trip_overview",
        {"trip_id": str(uuid.uuid4())},
    )
    assert missing_trip_res["result"]["isError"] is True

    bad_date_res, _ = _call_tool(
        client,
        "odysseus_get_day_brief",
        {"trip_id": trip_id, "target_date": "11-04-2027"},
    )
    assert bad_date_res["result"]["isError"] is True

    _, listed = _call_tool(client, "odysseus_list_trips", {})
    assert listed["count"] == 1
