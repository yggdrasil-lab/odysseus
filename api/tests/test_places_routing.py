"""Containerized PostgreSQL integration tests for Wave 3 places, SSRF, and routing."""

from collections.abc import Generator
import os
from pathlib import Path
import socket
import uuid

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import httpx
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.adapters import (
    GoogleUrlResolverAdapter,
    PlaceSearchCandidate,
    ResolvedUrlPlace,
    RoadRouteResult,
)
from app.config import Settings
from app.db import get_db
from app.dependencies import (
    get_geocoder_adapter,
    get_routing_adapter,
    get_url_resolver_adapter,
)
from app.domain.errors import DomainUpstreamError, DomainValidationError
from app.main import create_app

API_DIR = Path(__file__).resolve().parents[1]


class FakeGeocoder:
    """In-memory Photon geocoder stub."""

    def search(self, query: str, limit: int = 8) -> list[PlaceSearchCandidate]:
        return [
            PlaceSearchCandidate(
                name=f"{query} Central",
                latitude=-36.8435,
                longitude=174.7662,
                address="12 Harbour Quay, Auckland, New Zealand",
                osm_id="W:123456",
                category_hint="lodging",
            )
        ]


class FakeUrlResolver:
    """In-memory Google Maps URL resolver stub."""

    def resolve_google_maps_url(self, url: str) -> ResolvedUrlPlace:
        return ResolvedUrlPlace(
            resolved_url="https://www.google.com/maps/place/Harbour+View+Hotel/@-36.8435,174.7662,17z",
            latitude=-36.8435,
            longitude=174.7662,
            suggested_name="Harbour View Hotel",
            google_place_id="ChIJOdysseusTestPlace01",
        )


class FakeRoutingAdapter:
    """Configurable OSRM stub supporting success or upstream timeout failure."""

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail

    def route(
        self,
        from_lat: float,
        from_lon: float,
        to_lat: float,
        to_lon: float,
        travel_mode: str,
    ) -> RoadRouteResult:
        if self.fail:
            raise DomainUpstreamError("OSRM simulated timeout")
        return RoadRouteResult(
            distance_meters=2400,
            duration_minutes=9,
            geometry_geojson={
                "type": "LineString",
                "coordinates": [[from_lon, from_lat], [to_lon, to_lat]],
            },
        )


@pytest.fixture(scope="module")
def db_session_factory() -> sessionmaker[Session]:
    """Run Alembic migrations against PostgreSQL and return a session factory."""
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        raise RuntimeError(
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL places/routing tests."
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
) -> Generator[tuple[object, TestClient], None, None]:
    """Yield FastAPI app and TestClient backed by clean PostgreSQL tables."""
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


def _create_dated_trip(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/trips",
        json={
            "title": "Harbour Circuit",
            "slug": f"harbour-circuit-{uuid.uuid4().hex[:6]}",
            "status": "booked",
            "start_date": "2026-12-10",
            "end_date": "2026-12-12",
            "home_timezone": "Pacific/Auckland",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_places_crud_itinerary_link_and_photon_search(
    app_and_client: tuple[object, TestClient],
) -> None:
    """Verify place CRUD, stateless Photon search, itinerary linkage, and cross-trip guard."""
    app, client = app_and_client
    app.dependency_overrides[get_geocoder_adapter] = lambda: FakeGeocoder()

    trip_a = _create_dated_trip(client)
    trip_b = _create_dated_trip(client)
    day_a = client.get(f"/trips/{trip_a['id']}/days").json()[0]

    search_resp = client.get(f"/trips/{trip_a['id']}/places/search?q=Harbour")
    assert search_resp.status_code == 200
    assert len(search_resp.json()) == 1
    assert search_resp.json()[0]["osm_id"] == "W:123456"
    assert client.get(f"/trips/{trip_a['id']}/places").json() == []

    place_a = client.post(
        f"/trips/{trip_a['id']}/places",
        json={
            "name": "Harbour View Hotel",
            "category": "lodging",
            "latitude": -36.8435,
            "longitude": 174.7662,
            "osm_id": "W:123456",
            "is_backlog": False,
        },
    )
    assert place_a.status_code == 201, place_a.text
    place_id = place_a.json()["id"]

    item_resp = client.post(
        f"/trips/{trip_a['id']}/itinerary-items",
        json={
            "day_id": day_a["id"],
            "title": "Check into Harbour View Hotel",
            "category": "lodging",
            "place_id": place_id,
        },
    )
    assert item_resp.status_code == 201, item_resp.text
    assert item_resp.json()["place_id"] == place_id

    cross_trip_item = client.post(
        f"/trips/{trip_b['id']}/itinerary-items",
        json={"title": "Cross Trip Place Ref", "place_id": place_id},
    )
    assert cross_trip_item.status_code == 422

    patched = client.patch(
        f"/trips/{trip_a['id']}/places/{place_id}",
        json={"is_backlog": True, "notes": "Waterfront entrance"},
    )
    assert patched.status_code == 200
    assert patched.json()["is_backlog"] is True

    deleted = client.delete(f"/trips/{trip_a['id']}/places/{place_id}")
    assert deleted.status_code == 204
    items_after = client.get(f"/trips/{trip_a['id']}/itinerary-items").json()
    assert items_after[0]["place_id"] is None


def test_google_maps_ssrf_allowlist_and_redirect_hops(
    app_and_client: tuple[object, TestClient],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify strict Google Maps SSRF allowlist, DNS private IP check, and redirect validation."""
    app, client = app_and_client
    trip = _create_dated_trip(client)

    bad_url = client.post(
        f"/trips/{trip['id']}/places/resolve-url",
        json={"url": "https://evil.example.com/maps/@-36.84,174.76,15z"},
    )
    assert bad_url.status_code == 422

    def fake_public_getaddrinfo(
        host: str, port: object, type: int = 0
    ) -> list[tuple[object, ...]]:
        if host == "internal.google.com":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 443))]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("142.250.70.14", 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_public_getaddrinfo)

    hop_calls: list[str] = []

    def ssrf_redirect_handler(request: httpx.Request) -> httpx.Response:
        hop_calls.append(str(request.url))
        if request.url.host == "maps.app.goo.gl" and request.url.path == "/evil-hop":
            return httpx.Response(302, headers={"Location": "http://127.0.0.1/latest/meta-data"})
        if request.url.host == "maps.app.goo.gl" and request.url.path == "/valid-hop":
            target = (
                "https://www.google.com/maps/place/Harbour+View+Hotel/"
                "@-36.8435,174.7662,17z/data=!3m1!1sChIJOdysseusTestPlace01!3d-36.8435!4d174.7662"
            )
            return httpx.Response(302, headers={"Location": target})
        return httpx.Response(200)

    resolver = GoogleUrlResolverAdapter(transport=httpx.MockTransport(ssrf_redirect_handler))

    with pytest.raises(DomainValidationError):
        resolver.resolve_google_maps_url("https://maps.app.goo.gl/evil-hop")
    assert hop_calls == ["https://maps.app.goo.gl/evil-hop"]

    with pytest.raises(DomainValidationError):
        resolver.resolve_google_maps_url("https://www.google.com/search?q=not-maps")

    with pytest.raises(DomainValidationError):
        resolver.resolve_google_maps_url("https://127.0.0.1/maps?q=1,2")

    with pytest.raises(DomainValidationError):
        resolver.resolve_google_maps_url("http://maps.google.com/?q=1,2")
    # Note: internal private DNS check via google subdomain test
    with pytest.raises(DomainValidationError):
        from app.adapters.geocoder import _assert_public_dns

        _assert_public_dns("internal.google.com")

    resolved = resolver.resolve_google_maps_url("https://maps.app.goo.gl/valid-hop")
    assert resolved.latitude == -36.8435
    assert resolved.longitude == 174.7662
    assert resolved.suggested_name == "Harbour View Hotel"
    assert resolved.google_place_id == "ChIJOdysseusTestPlace01"
    assert set(resolved.model_dump().keys()) == {
        "resolved_url",
        "latitude",
        "longitude",
        "suggested_name",
        "google_place_id",
    }

    app.dependency_overrides[get_url_resolver_adapter] = lambda: FakeUrlResolver()
    endpoint_resp = client.post(
        f"/trips/{trip['id']}/places/resolve-url",
        json={"url": "https://maps.app.goo.gl/valid-hop"},
    )
    assert endpoint_resp.status_code == 200
    assert endpoint_resp.json()["google_place_id"] == "ChIJOdysseusTestPlace01"


def test_day_routes_compute_osrm_fallback_and_manual_override(
    app_and_client: tuple[object, TestClient],
) -> None:
    """Verify OSRM route compute, explicit geodesic fallback warning, and manual override preservation."""
    app, client = app_and_client
    trip = _create_dated_trip(client)
    trip_id = trip["id"]
    day = client.get(f"/trips/{trip_id}/days").json()[0]

    place_a = client.post(
        f"/trips/{trip_id}/places",
        json={"name": "Harbour View Hotel", "category": "lodging", "latitude": -36.8435, "longitude": 174.7662},
    ).json()
    place_b = client.post(
        f"/trips/{trip_id}/places",
        json={"name": "Ferry Terminal", "category": "transit", "latitude": -36.8422, "longitude": 174.7675},
    ).json()
    place_c = client.post(
        f"/trips/{trip_id}/places",
        json={"name": "Sky Tower", "category": "activity", "latitude": -36.8485, "longitude": 174.7633},
    ).json()

    for idx, place in enumerate((place_a, place_b, place_c)):
        resp = client.post(
            f"/trips/{trip_id}/itinerary-items",
            json={
                "day_id": day["id"],
                "title": f"Stop {idx + 1}",
                "place_id": place["id"],
                "sort_order": idx,
            },
        )
        assert resp.status_code == 201

    app.dependency_overrides[get_routing_adapter] = lambda: FakeRoutingAdapter(fail=False)
    osrm_resp = client.post(
        f"/trips/{trip_id}/days/{day['id']}/routes/compute",
        json={"travel_mode": "drive"},
    )
    assert osrm_resp.status_code == 200, osrm_resp.text
    osrm_body = osrm_resp.json()
    assert osrm_body["fallback_used"] is False
    assert osrm_body["warning"] is None
    assert len(osrm_body["routes"]) == 2
    assert osrm_body["routes"][0]["source"] == "osrm"

    first_route_id = osrm_body["routes"][0]["id"]
    manual_resp = client.patch(
        f"/trips/{trip_id}/routes/{first_route_id}",
        json={"distance_meters": 5200, "duration_minutes": 18, "travel_mode": "transit"},
    )
    assert manual_resp.status_code == 200
    assert manual_resp.json()["source"] == "manual"
    assert manual_resp.json()["manual_override"] is True

    app.dependency_overrides[get_routing_adapter] = lambda: FakeRoutingAdapter(fail=True)
    fallback_resp = client.post(
        f"/trips/{trip_id}/days/{day['id']}/routes/compute",
        json={"travel_mode": "drive"},
    )
    assert fallback_resp.status_code == 200, fallback_resp.text
    fallback_body = fallback_resp.json()
    assert fallback_body["fallback_used"] is True
    assert fallback_body["warning"]
    assert fallback_body["routes"][0]["source"] == "manual"
    assert fallback_body["routes"][0]["duration_minutes"] == 18
    assert fallback_body["routes"][1]["source"] == "geodesic"
    assert fallback_body["routes"][1]["geometry_geojson"]["type"] == "LineString"

    workspace = client.get(f"/trips/{trip_id}/workspace").json()
    assert len(workspace["places"]) == 3
    assert len(workspace["route_estimates"]) == 2
