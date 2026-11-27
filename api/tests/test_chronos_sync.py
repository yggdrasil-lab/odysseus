"""Unit and PostgreSQL integration tests for Ticket 09 Chronos travel mode and anchor sync."""

from collections.abc import Generator
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
from types import SimpleNamespace
import uuid

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
import httpx
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.adapters import (
    ChronosCommitmentRead,
    ChronosCommitmentUpsert,
    ChronosTravelModeResponse,
    ChronosTravelModeUpsert,
    HttpChronosClientAdapter,
)
from app.config import Settings
from app.db import get_db
from app.dependencies import get_chronos_client_adapter
from app.domain.chronos import project_trip_chronos_anchors
from app.domain.errors import DomainUpstreamError
from app.main import create_app

API_DIR = Path(__file__).resolve().parents[1]


class FakeChronosAdapter:
    """In-memory Chronos stub recording overlay and commitment mutations."""

    def __init__(
        self,
        *,
        existing_commitments: list[ChronosCommitmentRead] | None = None,
        fail_on_method: str | None = None,
    ) -> None:
        self.existing_commitments = list(existing_commitments or [])
        self.fail_on_method = fail_on_method
        self.overlay_calls: list[ChronosTravelModeUpsert] = []
        self.upserted_commitments: list[ChronosCommitmentUpsert] = []
        self.deleted_refs: list[str] = []

    def _maybe_fail(self, method_name: str) -> None:
        if self.fail_on_method == method_name:
            raise DomainUpstreamError(f"Simulated Chronos 503 failure during {method_name}.")

    def upsert_travel_mode(self, payload: ChronosTravelModeUpsert) -> ChronosTravelModeResponse:
        self._maybe_fail("upsert_travel_mode")
        self.overlay_calls.append(payload)
        return ChronosTravelModeResponse(
            id=42,
            external_ref=payload.external_ref,
            label=payload.label,
            start_date=payload.start_date,
            end_date=payload.end_date,
            mode=payload.mode,
            active=payload.active,
        )

    def list_travel_commitments(self, external_ref_prefix: str) -> list[ChronosCommitmentRead]:
        self._maybe_fail("list_travel_commitments")
        return [
            item
            for item in self.existing_commitments
            if item.external_ref and item.external_ref.startswith(external_ref_prefix)
        ]

    def upsert_commitment(self, payload: ChronosCommitmentUpsert) -> ChronosCommitmentRead:
        self._maybe_fail("upsert_commitment")
        self.upserted_commitments.append(payload)
        return ChronosCommitmentRead(
            id=len(self.upserted_commitments),
            external_ref=payload.external_ref,
            title=payload.title,
            target_date=payload.target_date,
            start_minute=payload.start_minute,
            end_minute=payload.end_minute,
            source=payload.source,
        )

    def delete_commitment_by_ref(self, external_ref: str) -> None:
        self._maybe_fail("delete_commitment_by_ref")
        self.deleted_refs.append(external_ref)


@pytest.fixture(scope="module")
def db_session_factory() -> sessionmaker[Session]:
    """Run Alembic migrations against PostgreSQL and return a session factory."""
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        raise RuntimeError(
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL Chronos sync tests."
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

    app = create_app(Settings(environment="development", domain_name="home.example"))

    def override_db() -> Generator[Session, None, None]:
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_db
    yield app, TestClient(app)


def _create_trip(
    client: TestClient,
    *,
    slug: str,
    status: str = "booked",
    start_date: str | None = "2026-12-01",
    end_date: str | None = "2026-12-06",
) -> dict[str, object]:
    response = client.post(
        "/trips",
        json={
            "title": "Alpine Rail Loop",
            "slug": slug,
            "status": status,
            "start_date": start_date,
            "end_date": end_date,
            "home_timezone": "Pacific/Auckland",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_project_trip_chronos_anchors_handles_timezones_and_midnight_clamp() -> None:
    trip = SimpleNamespace(slug="tokyo-loop", home_timezone="Pacific/Auckland")
    seg_flight = SimpleNamespace(
        id=uuid.UUID("11111111-1111-4111-8111-111111111101"),
        origin_label="Tokyo Haneda",
        origin_code="HND",
        destination_label="Sapporo Chitose",
        destination_code="CTS",
        departure_local=datetime(2026, 12, 1, 20, 30),
        departure_tz="Asia/Tokyo",
        arrival_local=datetime(2026, 12, 1, 22, 5),
        arrival_tz="Asia/Tokyo",
        departure_utc=datetime(2026, 12, 1, 11, 30, tzinfo=timezone.utc),
        arrival_utc=datetime(2026, 12, 1, 13, 5, tzinfo=timezone.utc),
        flight_or_service_number="NH79",
        notes="Gate 62",
    )
    seg_lodging = SimpleNamespace(
        id=uuid.UUID("11111111-1111-4111-8111-111111111102"),
        origin_label="Sapporo Station",
        origin_code=None,
        destination_label="Harbor Hotel",
        destination_code=None,
        departure_local=datetime(2026, 12, 2, 15, 0),
        departure_tz="Asia/Tokyo",
        arrival_local=datetime(2026, 12, 3, 10, 0),
        arrival_tz="Asia/Tokyo",
        departure_utc=datetime(2026, 12, 2, 6, 0, tzinfo=timezone.utc),
        arrival_utc=datetime(2026, 12, 3, 1, 0, tzinfo=timezone.utc),
        flight_or_service_number=None,
        notes=None,
    )
    seg_draft = SimpleNamespace(
        id=uuid.UUID("11111111-1111-4111-8111-111111111103"),
        origin_label="A",
        origin_code="AAA",
        destination_label="B",
        destination_code="BBB",
        departure_local=datetime(2026, 12, 2, 9, 0),
        departure_tz="Asia/Tokyo",
        arrival_local=datetime(2026, 12, 2, 10, 0),
        arrival_tz="Asia/Tokyo",
        departure_utc=datetime(2026, 12, 2, 0, 0, tzinfo=timezone.utc),
        arrival_utc=datetime(2026, 12, 2, 1, 0, tzinfo=timezone.utc),
        flight_or_service_number=None,
        notes=None,
    )
    bookings = [
        SimpleNamespace(
            booking_type="flight",
            status="confirmed",
            title="Haneda to Sapporo",
            confirmation_code="CONF77",
            segments=[seg_flight],
        ),
        SimpleNamespace(
            booking_type="lodging",
            status="confirmed",
            title="Harbor Hotel Check-in",
            confirmation_code="HTL88",
            segments=[seg_lodging],
        ),
        SimpleNamespace(
            booking_type="transport",
            status="draft",
            title="Draft Ferry",
            confirmation_code=None,
            segments=[seg_draft],
        ),
    ]
    items = [
        SimpleNamespace(
            id=uuid.UUID("22222222-2222-4222-8222-222222222201"),
            title="Museum Timed Entry",
            status="confirmed",
            sync_to_chronos=True,
            start_local=datetime(2026, 12, 2, 10, 0),
            start_tz="Asia/Tokyo",
            end_local=None,
            end_tz=None,
            start_utc=datetime(2026, 12, 2, 1, 0, tzinfo=timezone.utc),
            end_utc=None,
            place_label="Civic Museum",
            notes="Ticket QR in wallet",
        ),
        SimpleNamespace(
            id=uuid.UUID("22222222-2222-4222-8222-222222222202"),
            title="Unflagged Walk",
            status="planned",
            sync_to_chronos=False,
            start_local=datetime(2026, 12, 2, 12, 0),
            start_tz="Asia/Tokyo",
            end_local=None,
            end_tz=None,
            start_utc=datetime(2026, 12, 2, 3, 0, tzinfo=timezone.utc),
            end_utc=None,
            place_label=None,
            notes=None,
        ),
        SimpleNamespace(
            id=uuid.UUID("22222222-2222-4222-8222-222222222203"),
            title="Skipped Tour",
            status="skipped",
            sync_to_chronos=True,
            start_local=datetime(2026, 12, 2, 14, 0),
            start_tz="Asia/Tokyo",
            end_local=None,
            end_tz=None,
            start_utc=datetime(2026, 12, 2, 5, 0, tzinfo=timezone.utc),
            end_utc=None,
            place_label=None,
            notes=None,
        ),
    ]

    anchors = project_trip_chronos_anchors(trip, bookings, items)  # type: ignore[arg-type]
    assert [a.external_ref for a in anchors] == [
        "odysseus:tokyo-loop:segment:11111111-1111-4111-8111-111111111101",
        "odysseus:tokyo-loop:item:22222222-2222-4222-8222-222222222201",
        "odysseus:tokyo-loop:segment:11111111-1111-4111-8111-111111111102",
    ]

    flight = anchors[0]
    assert flight.target_date == date(2026, 12, 2)
    assert flight.start_minute == 30
    assert flight.end_minute == 125
    assert flight.urgent_quiet_bypass is True
    assert flight.nudge_mode == "boundary"
    assert "2026-12-01 20:30 (Asia/Tokyo)" in flight.notes
    assert "CONF77" in flight.notes

    item = anchors[1]
    assert item.target_date == date(2026, 12, 2)
    assert item.start_minute == 14 * 60
    assert item.end_minute == 15 * 60
    assert item.urgent_quiet_bypass is False
    assert item.nudge_mode == "none"
    assert "2026-12-02 10:00 (Asia/Tokyo)" in item.notes

    lodging = anchors[2]
    assert lodging.target_date == date(2026, 12, 2)
    assert lodging.start_minute == 19 * 60
    assert lodging.end_minute == 1440
    assert lodging.urgent_quiet_bypass is False
    assert lodging.nudge_mode == "none"


def test_chronos_sync_rejects_ineligible_trips_with_422(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    app, client = app_and_client
    fake = FakeChronosAdapter()
    app.dependency_overrides[get_chronos_client_adapter] = lambda: fake

    planning = _create_trip(client, slug="plan-only", status="planning", start_date=None, end_date=None)
    completed = _create_trip(client, slug="done-trip", status="completed")

    bad_create = client.post(
        "/trips",
        json={
            "title": "Bad Create",
            "slug": "bad-create",
            "status": "planning",
            "chronos_sync_enabled": True,
        },
    )
    assert bad_create.status_code == 422

    bad_patch = client.patch(
        f"/trips/{completed['id']}",
        json={"chronos_sync_enabled": True},
    )
    assert bad_patch.status_code == 422

    preview_plan = client.get(f"/trips/{planning['id']}/chronos/preview")
    assert preview_plan.status_code == 200
    assert preview_plan.json()["eligible"] is False
    assert "booked" in preview_plan.json()["ineligible_reason"]

    sync_plan = client.post(f"/trips/{planning['id']}/chronos/sync", json={"enabled": True})
    assert sync_plan.status_code == 422

    sync_completed = client.post(f"/trips/{completed['id']}/chronos/sync", json={"enabled": True})
    assert sync_completed.status_code == 422
    assert fake.overlay_calls == []


def test_chronos_sync_upserts_prunes_stale_and_disables_cleanly(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    app, client = app_and_client
    trip = _create_trip(client, slug="alpine-rail", status="active")
    trip_id = str(trip["id"])

    flight_res = client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "booking_type": "flight",
            "status": "confirmed",
            "title": "Skyline Express Flight",
            "confirmation_code": "ALP123",
            "segments": [
                {
                    "origin_label": "Auckland",
                    "origin_code": "AKL",
                    "destination_label": "Queenstown",
                    "destination_code": "ZQN",
                    "departure_local": "2026-12-01T08:00:00",
                    "departure_tz": "Pacific/Auckland",
                    "arrival_local": "2026-12-01T09:50:00",
                    "arrival_tz": "Pacific/Auckland",
                }
            ],
        },
    )
    assert flight_res.status_code == 201, flight_res.text

    item_res = client.post(
        f"/trips/{trip_id}/itinerary-items",
        json={
            "title": "Gondola Reservation",
            "category": "activity",
            "status": "confirmed",
            "start_local": "2026-12-02T14:00:00",
            "start_tz": "Pacific/Auckland",
            "end_local": "2026-12-02T15:30:00",
            "end_tz": "Pacific/Auckland",
            "sync_to_chronos": True,
        },
    )
    assert item_res.status_code == 201, item_res.text

    fake = FakeChronosAdapter(
        existing_commitments=[
            ChronosCommitmentRead(
                id=99,
                external_ref="odysseus:alpine-rail:item:00000000-0000-0000-0000-000000000999",
            ),
            ChronosCommitmentRead(
                id=100,
                external_ref="odysseus:other-trip:item:00000000-0000-0000-0000-000000000111",
            ),
        ]
    )
    app.dependency_overrides[get_chronos_client_adapter] = lambda: fake

    preview = client.get(f"/trips/{trip_id}/chronos/preview")
    assert preview.status_code == 200
    preview_data = preview.json()
    assert preview_data["eligible"] is True
    assert preview_data["confirmed_segment_count"] == 1
    assert preview_data["synced_item_count"] == 1

    sync_res = client.post(
        f"/trips/{trip_id}/chronos/sync",
        json={"enabled": True, "overlay_mode": "keep_work_blocks"},
    )
    assert sync_res.status_code == 200, sync_res.text
    sync_data = sync_res.json()
    assert sync_data["sync_enabled"] is True
    assert sync_data["overlay_mode"] == "keep_work_blocks"
    assert sync_data["overlay_active"] is True
    assert sync_data["upserted_count"] == 2
    assert sync_data["deleted_count"] == 1
    assert fake.deleted_refs == [
        "odysseus:alpine-rail:item:00000000-0000-0000-0000-000000000999"
    ]
    assert fake.overlay_calls[0].active is True
    assert fake.overlay_calls[0].mode == "keep_work_blocks"

    trip_after_sync = client.get(f"/trips/{trip_id}").json()
    assert trip_after_sync["chronos_sync_enabled"] is True
    assert trip_after_sync["chronos_overlay_mode"] == "keep_work_blocks"

    # Now disable sync: prune all synced refs and deactivate overlay.
    fake.existing_commitments = [
        ChronosCommitmentRead(id=1, external_ref=item.external_ref)
        for item in fake.upserted_commitments
    ]
    fake.deleted_refs.clear()
    disable_res = client.post(
        f"/trips/{trip_id}/chronos/sync",
        json={"enabled": False},
    )
    assert disable_res.status_code == 200, disable_res.text
    disable_data = disable_res.json()
    assert disable_data["sync_enabled"] is False
    assert disable_data["overlay_active"] is False
    assert disable_data["deleted_count"] == 2
    assert len(fake.deleted_refs) == 2
    assert fake.overlay_calls[-1].active is False

    trip_after_disable = client.get(f"/trips/{trip_id}").json()
    assert trip_after_disable["chronos_sync_enabled"] is False


def test_chronos_upstream_failure_returns_502_without_mutating_trip(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    app, client = app_and_client
    trip = _create_trip(client, slug="fail-safe-trip", status="booked")
    trip_id = str(trip["id"])

    fake = FakeChronosAdapter(fail_on_method="upsert_travel_mode")
    app.dependency_overrides[get_chronos_client_adapter] = lambda: fake

    response = client.post(
        f"/trips/{trip_id}/chronos/sync",
        json={"enabled": True, "overlay_mode": "keep_work_blocks"},
    )
    assert response.status_code == 502
    assert "Chronos" in response.json()["detail"]

    persisted = client.get(f"/trips/{trip_id}").json()
    assert persisted["chronos_sync_enabled"] is False
    assert persisted["chronos_overlay_mode"] == "suppress_all_grid_blocks"


def test_http_chronos_client_adapter_roundtrip_and_fail_loud() -> None:
    seen: list[tuple[str, str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.path, str(request.url.query)))
        if request.method == "POST" and request.url.path == "/schedule/travel-mode":
            payload = json.loads(request.content.decode("utf-8"))
            return httpx.Response(200, json={"id": 7, **payload})
        if request.method == "GET" and request.url.path == "/commitments":
            return httpx.Response(200, json=[{"id": 11, "external_ref": "odysseus:demo:item:1"}])
        if request.method == "POST" and request.url.path == "/commitments":
            payload = json.loads(request.content.decode("utf-8"))
            return httpx.Response(200, json={"id": 12, "external_ref": payload["external_ref"]})
        if request.method == "DELETE" and request.url.path == "/commitments/by-ref":
            return httpx.Response(204)
        return httpx.Response(503, json={"detail": "down"})

    adapter = HttpChronosClientAdapter(
        base_url="http://chronos-api:8000",
        transport=httpx.MockTransport(handler),
    )
    overlay = adapter.upsert_travel_mode(
        ChronosTravelModeUpsert(
            external_ref="odysseus:demo",
            label="Demo Trip",
            start_date=date(2026, 12, 1),
            end_date=date(2026, 12, 3),
            mode="suppress_all_grid_blocks",
            active=True,
        )
    )
    assert overlay.id == 7
    assert overlay.active is True
    assert len(adapter.list_travel_commitments("odysseus:demo:")) == 1
    created = adapter.upsert_commitment(
        ChronosCommitmentUpsert(
            title="Flight",
            target_date=date(2026, 12, 1),
            start_minute=60,
            end_minute=180,
            external_ref="odysseus:demo:segment:1",
            nudge_mode="boundary",
            urgent_quiet_bypass=True,
        )
    )
    assert created.id == 12
    adapter.delete_commitment_by_ref("odysseus:demo:item:1")
    assert len(seen) == 4

    unconfigured = HttpChronosClientAdapter(base_url="")
    with pytest.raises(DomainUpstreamError):
        unconfigured.list_travel_commitments("odysseus:demo:")

    failing = HttpChronosClientAdapter(
        base_url="http://chronos-api:8000",
        transport=httpx.MockTransport(lambda _req: httpx.Response(502, text="bad gateway")),
    )
    with pytest.raises(DomainUpstreamError):
        failing.delete_commitment_by_ref("odysseus:demo:item:1")
