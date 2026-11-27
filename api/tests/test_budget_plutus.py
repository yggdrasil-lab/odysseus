"""Unit and PostgreSQL integration tests for Ticket 08 read-only Plutus trip budget."""

from collections.abc import Generator, Sequence
from datetime import date
from decimal import Decimal
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
    HttpPlutusClientAdapter,
    PlutusFxRate,
    PlutusTagCategorySummary,
    PlutusTagSummary,
    PlutusTransaction,
)
from app.config import Settings
from app.db import get_db
from app.dependencies import get_plutus_client_adapter
from app.domain.budget import (
    build_midas_deep_link,
    compute_planned_bookings_rollup,
    compute_transaction_nzd,
)
from app.domain.errors import DomainUpstreamError
from app.main import create_app

API_DIR = Path(__file__).resolve().parents[1]


class FakePlutusAdapter:
    """Configurable read-only Plutus stub for budget endpoint integration tests."""

    def __init__(
        self,
        *,
        fx_rates: dict[str, PlutusFxRate] | None = None,
        tag_summary: PlutusTagSummary | None = None,
        transactions: list[PlutusTransaction] | None = None,
        fail_message: str | None = None,
    ) -> None:
        self.fx_rates = fx_rates or {}
        self.tag_summary = tag_summary
        self.transactions = transactions or []
        self.fail_message = fail_message
        self.requested_currencies: list[str] = []

    def get_fx_rates(self, to_currency: str, currencies: Sequence[str]) -> dict[str, PlutusFxRate]:
        assert to_currency == "NZD"
        self.requested_currencies = list(currencies)
        if self.fail_message:
            raise DomainUpstreamError(self.fail_message)
        return dict(self.fx_rates)

    def get_tag_summary(self, tag: str) -> PlutusTagSummary | None:
        if self.fail_message:
            raise DomainUpstreamError(self.fail_message)
        if self.tag_summary is not None and self.tag_summary.tag == tag:
            return self.tag_summary
        return None

    def get_trip_transactions(self, tag: str) -> list[PlutusTransaction]:
        if self.fail_message:
            raise DomainUpstreamError(self.fail_message)
        return [tx for tx in self.transactions if tag in tx.tags]


@pytest.fixture(scope="module")
def db_session_factory() -> sessionmaker[Session]:
    """Run Alembic migrations against PostgreSQL and return a session factory."""
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        raise RuntimeError(
            "ODYSSEUS_TEST_DATABASE_URL is required for PostgreSQL budget integration tests."
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
    budget_nzd: str | None = "6000.00",
) -> dict[str, object]:
    response = client.post(
        "/trips",
        json={
            "title": "Pacific Loop",
            "slug": slug,
            "status": "booked",
            "start_date": "2026-12-01",
            "end_date": "2026-12-08",
            "home_timezone": "Pacific/Auckland",
            "budget_nzd": budget_nzd,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_booking(
    client: TestClient,
    trip_id: str,
    *,
    title: str,
    booking_type: str = "lodging",
    status: str = "confirmed",
    quoted_cost: str | None = None,
    quoted_currency: str | None = None,
) -> dict[str, object]:
    response = client.post(
        f"/trips/{trip_id}/bookings",
        json={
            "booking_type": booking_type,
            "status": status,
            "title": title,
            "quoted_cost": quoted_cost,
            "quoted_currency": quoted_currency,
            "segments": [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _sample_booking(
    title: str,
    booking_type: str,
    status: str,
    quoted_cost: Decimal | None,
    quoted_currency: str | None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        title=title,
        booking_type=booking_type,
        status=status,
        quoted_cost=quoted_cost,
        quoted_currency=quoted_currency,
    )


def _plutus_mock_response(request: httpx.Request) -> httpx.Response:
    assert request.method == "GET"
    if request.url.path == "/transactions":
        return httpx.Response(
            200,
            json=[
                {
                    "id": 11,
                    "transaction_date": "2026-11-26",
                    "account_name": "Everyday Card",
                    "amount": -42.5,
                    "currency": "SGD",
                    "exchange_rate": 1.285,
                    "merchant": "Merlion Noodle House",
                    "category": "Dining",
                    "raw_description": "MERLION NOODLE SG",
                    "tags": ["trip:pacific-loop"],
                }
            ],
        )
    if request.url.path == "/transactions/summary/tags":
        return httpx.Response(
            200,
            json={
                "period": "all",
                "total_tagged_spend": 54.61,
                "tags": [
                    {
                        "tag": "trip:other-trip",
                        "total_spend": 10.0,
                        "transaction_count": 1,
                        "categories": [],
                    },
                    {
                        "tag": "trip:pacific-loop",
                        "total_spend": 54.61,
                        "transaction_count": 1,
                        "categories": [
                            {
                                "category": "Dining",
                                "total_spend": 54.61,
                                "transaction_count": 1,
                                "percentage": 100.0,
                            }
                        ],
                    },
                ],
            },
        )
    if request.url.path == "/fx/rates":
        return httpx.Response(
            200,
            json={
                "to_currency": "NZD",
                "rates": {
                    "NZD": {"rate": 1.0, "rate_date": None, "source": "identity"},
                    "SGD": {"rate": 1.285, "rate_date": "2026-11-26", "source": "frankfurter"},
                },
            },
        )
    return httpx.Response(404)


def _build_rich_fake_plutus(tag: str) -> FakePlutusAdapter:
    return FakePlutusAdapter(
        fx_rates={
            "NZD": PlutusFxRate(rate=Decimal("1.0"), rate_date=None, source="identity"),
            "SGD": PlutusFxRate(rate=Decimal("1.285"), rate_date=date(2026, 11, 26), source="frankfurter"),
            "PHP": PlutusFxRate(rate=Decimal("0.030"), rate_date=date(2026, 11, 26), source="frankfurter"),
        },
        tag_summary=PlutusTagSummary(
            tag=tag,
            total_spend=Decimal("2600.00"),
            transaction_count=2,
            first_date=date(2026, 11, 20),
            last_date=date(2026, 11, 22),
            categories=[
                PlutusTagCategorySummary(
                    category="Flights",
                    total_spend=Decimal("1500.00"),
                    transaction_count=1,
                    percentage=Decimal("57.69"),
                ),
                PlutusTagCategorySummary(
                    category="Dining",
                    total_spend=Decimal("1100.00"),
                    transaction_count=1,
                    percentage=Decimal("42.31"),
                ),
            ],
        ),
        transactions=[
            PlutusTransaction(
                id=101,
                transaction_date=date(2026, 11, 20),
                account_name="Everyday Checking",
                amount=Decimal("-1500.00"),
                currency="NZD",
                merchant="Pacific Air",
                category="Flights",
                raw_description="PACIFIC AIR AKL-SIN",
                tags=[tag],
            ),
            PlutusTransaction(
                id=102,
                transaction_date=date(2026, 11, 22),
                account_name="Multi-Currency Card",
                amount=Decimal("-856.03"),
                currency="SGD",
                exchange_rate=Decimal("1.285"),
                merchant="Hawker Market",
                category="Dining",
                raw_description="HAWKER MARKET SG",
                tags=[tag],
            ),
        ],
    )


def test_planned_bookings_rollup_and_missing_fx() -> None:
    """Verify NZD/FX conversion, cancelled exclusion, and explicit missing FX tracking."""
    bookings = [
        _sample_booking("AKL Flight", "flight", "confirmed", Decimal("1250.00"), "NZD"),
        _sample_booking("Marina Bay Stay", "lodging", "pending", Decimal("400.00"), "sgd"),
        _sample_booking("Cancelled Shuttle", "transport", "cancelled", Decimal("999.00"), "SGD"),
        _sample_booking("Unpriced Note Booking", "activity", "draft", None, None),
    ]
    rates = {
        "SGD": PlutusFxRate(rate=Decimal("1.285"), rate_date=date(2026, 11, 26), source="frankfurter")
    }
    rollup = compute_planned_bookings_rollup(bookings, rates)
    assert len(rollup.items) == 2
    assert rollup.missing_fx_currencies == []
    assert rollup.planned_nzd == Decimal("1764.00")

    missing_rollup = compute_planned_bookings_rollup(bookings, {})
    assert missing_rollup.missing_fx_currencies == ["SGD"]
    assert missing_rollup.planned_nzd is None
    assert missing_rollup.items[0].nzd_amount == Decimal("1250.00")
    assert missing_rollup.items[1].nzd_amount is None


def test_transaction_nzd_and_midas_deep_link() -> None:
    """Verify transaction NZD calculation and Midas tag deep-link formatting."""
    tx_nzd = PlutusTransaction(
        id=1,
        transaction_date=date(2026, 11, 20),
        account_name="Checking",
        amount=Decimal("-84.50"),
        currency="NZD",
        tags=["trip:pacific-loop"],
    )
    tx_fx = PlutusTransaction(
        id=2,
        transaction_date=date(2026, 11, 21),
        account_name="Travel Card",
        amount=Decimal("-100.00"),
        currency="SGD",
        exchange_rate=Decimal("1.285"),
        tags=["trip:pacific-loop"],
    )
    tx_no_fx = PlutusTransaction(
        id=3,
        transaction_date=date(2026, 11, 22),
        account_name="Travel Card",
        amount=Decimal("-500.00"),
        currency="PHP",
        exchange_rate=None,
        tags=["trip:pacific-loop"],
    )
    assert compute_transaction_nzd(tx_nzd) == Decimal("84.50")
    assert compute_transaction_nzd(tx_fx) == Decimal("128.50")
    assert compute_transaction_nzd(tx_no_fx) is None
    assert build_midas_deep_link(" home.example ", "pacific-loop") == (
        "https://midas.home.example/?tag=trip:pacific-loop"
    )
    assert build_midas_deep_link("   ", "pacific-loop") is None


def test_http_plutus_adapter_get_success() -> None:
    """Verify HttpPlutusClientAdapter parses GET responses for transactions, tags, and FX."""
    adapter = HttpPlutusClientAdapter(
        base_url="http://plutus-api:8000",
        transport=httpx.MockTransport(_plutus_mock_response),
    )
    txs = adapter.get_trip_transactions("trip:pacific-loop")
    assert len(txs) == 1 and txs[0].merchant == "Merlion Noodle House"
    matched_summary = adapter.get_tag_summary("trip:pacific-loop")
    assert matched_summary is not None and matched_summary.total_spend == Decimal("54.61")
    assert adapter.get_tag_summary("trip:missing-tag") is None
    rates = adapter.get_fx_rates("NZD", ["SGD", "NZD"])
    assert rates["SGD"].rate == Decimal("1.285")


def test_http_plutus_adapter_fail_loud_errors() -> None:
    """Verify empty URL, timeout, non-2xx, and malformed payloads raise DomainUpstreamError."""
    empty_adapter = HttpPlutusClientAdapter(base_url="  ")
    with pytest.raises(DomainUpstreamError, match="not configured"):
        empty_adapter.get_fx_rates("NZD", ["SGD"])

    def timeout_handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out")

    timeout_adapter = HttpPlutusClientAdapter(
        base_url="http://plutus-api:8000",
        transport=httpx.MockTransport(timeout_handler),
    )
    with pytest.raises(DomainUpstreamError, match="request failed"):
        timeout_adapter.get_trip_transactions("trip:pacific-loop")

    bad_status_adapter = HttpPlutusClientAdapter(
        base_url="http://plutus-api:8000",
        transport=httpx.MockTransport(lambda _r: httpx.Response(503, text="unavailable")),
    )
    with pytest.raises(DomainUpstreamError, match="request failed"):
        bad_status_adapter.get_tag_summary("trip:pacific-loop")

    bad_json_adapter = HttpPlutusClientAdapter(
        base_url="http://plutus-api:8000",
        transport=httpx.MockTransport(lambda _r: httpx.Response(200, content=b"{invalid-json")),
    )
    with pytest.raises(DomainUpstreamError, match="request failed"):
        bad_json_adapter.get_fx_rates("NZD", ["SGD"])

    wrong_shape_adapter = HttpPlutusClientAdapter(
        base_url="http://plutus-api:8000",
        transport=httpx.MockTransport(
            lambda _r: httpx.Response(200, content=json.dumps({"unexpected": True}).encode())
        ),
    )
    with pytest.raises(DomainUpstreamError, match="non-list payload"):
        wrong_shape_adapter.get_trip_transactions("trip:pacific-loop")


def test_budget_endpoint_multicurrency_actuals_and_category_breakdown(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    """Verify multi-currency booking FX rollup, Plutus actuals, variance, and Midas link."""
    app, client = app_and_client
    slug = f"pacific-loop-{uuid.uuid4().hex[:6]}"
    trip_id = str(_create_trip(client, slug=slug, budget_nzd="5000.00")["id"])

    _create_booking(
        client, trip_id, title="Auckland Departure Flight", booking_type="flight",
        status="confirmed", quoted_cost="1500.00", quoted_currency="NZD",
    )
    _create_booking(
        client, trip_id, title="Harbourfront Hotel", booking_type="lodging",
        status="confirmed", quoted_cost="500.00", quoted_currency="SGD",
    )
    _create_booking(
        client, trip_id, title="Clark Resort Deposit", booking_type="lodging",
        status="pending", quoted_cost="10000.00", quoted_currency="PHP",
    )
    _create_booking(
        client, trip_id, title="Cancelled Bay Cruise", booking_type="activity",
        status="cancelled", quoted_cost="300.00", quoted_currency="SGD",
    )

    tag = f"trip:{slug}"
    fake_plutus = _build_rich_fake_plutus(tag)
    app.dependency_overrides[get_plutus_client_adapter] = lambda: fake_plutus

    response = client.get(f"/trips/{trip_id}/budget")
    assert response.status_code == 200, response.text
    body = response.json()

    assert fake_plutus.requested_currencies == ["NZD", "PHP", "SGD"]
    assert body["trip_slug"] == slug
    assert body["plutus_tag"] == tag
    assert body["plutus_available"] is True
    assert body["midas_url"] == f"https://midas.home.example/?tag={tag}"
    assert body["missing_fx_currencies"] == []
    assert body["budget_nzd"] == "5000.00"
    assert body["planned_nzd"] == "2442.50"
    assert body["actual_settled_nzd"] == "2600.00"
    assert body["remaining_budget_nzd"] == "2400.00"
    assert body["variance_nzd"] == "157.50"
    assert len(body["planned_bookings"]) == 3
    assert [cat["category"] for cat in body["category_breakdown"]] == ["Flights", "Dining"]
    assert [tx["nzd_amount"] for tx in body["transactions"]] == ["1500.00", "1100.00"]


def test_budget_endpoint_missing_fx_and_zero_tag_spend(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    """Verify missing FX rate disables planned_nzd while zero Plutus spend returns 0.00."""
    app, client = app_and_client
    slug = f"cebu-only-{uuid.uuid4().hex[:6]}"
    trip_id = str(_create_trip(client, slug=slug, budget_nzd="3000.00")["id"])
    _create_booking(
        client, trip_id, title="Clark Shuttle", booking_type="transport",
        status="confirmed", quoted_cost="2500.00", quoted_currency="PHP",
    )

    fake_plutus = FakePlutusAdapter(
        fx_rates={"NZD": PlutusFxRate(rate=Decimal("1.0"), rate_date=None, source="identity")},
        tag_summary=None,
        transactions=[],
    )
    app.dependency_overrides[get_plutus_client_adapter] = lambda: fake_plutus

    response = client.get(f"/trips/{trip_id}/budget")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["plutus_available"] is True
    assert body["actual_settled_nzd"] == "0.00"
    assert body["remaining_budget_nzd"] == "3000.00"
    assert body["missing_fx_currencies"] == ["PHP"]
    assert body["planned_nzd"] is None
    assert body["variance_nzd"] is None
    assert body["planned_bookings"][0]["nzd_amount"] is None


def test_budget_endpoint_empty_url_surfaces_unavailable(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    """Verify empty PLUTUS_API_URL returns plutus_available=False and actual_settled_nzd=None."""
    _app, client = app_and_client
    slug = f"outage-check-{uuid.uuid4().hex[:6]}"
    trip_id = str(_create_trip(client, slug=slug, budget_nzd="4000.00")["id"])
    _create_booking(
        client, trip_id, title="NZD Domestic Leg", booking_type="flight",
        status="confirmed", quoted_cost="420.00", quoted_currency="NZD",
    )
    _create_booking(
        client, trip_id, title="Singapore Stay", booking_type="lodging",
        status="confirmed", quoted_cost="300.00", quoted_currency="SGD",
    )

    response = client.get(f"/trips/{trip_id}/budget")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["plutus_available"] is False
    assert "not configured" in (body["plutus_error"] or "")
    assert body["actual_settled_nzd"] is None
    assert body["remaining_budget_nzd"] is None
    assert body["variance_nzd"] is None
    assert body["transactions"] == []
    assert body["category_breakdown"] == []
    assert body["fx_rates"] == {}
    assert body["budget_nzd"] == "4000.00"
    assert body["midas_url"] == f"https://midas.home.example/?tag=trip:{slug}"
    assert body["missing_fx_currencies"] == ["SGD"]
    assert body["planned_nzd"] is None
    assert body["planned_bookings"][0]["nzd_amount"] == "420.00"
    assert body["planned_bookings"][1]["nzd_amount"] is None


def test_budget_endpoint_upstream_error_preserves_nzd_planned(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    """Verify upstream outage still rolls up NZD quotes while keeping actual_settled_nzd=None."""
    app, client = app_and_client
    app.dependency_overrides[get_plutus_client_adapter] = (
        lambda: FakePlutusAdapter(fail_message="Plutus upstream 503")
    )
    trip_id = str(_create_trip(client, slug=f"nzd-only-{uuid.uuid4().hex[:6]}", budget_nzd="1500.00")["id"])
    _create_booking(
        client, trip_id, title="Local Ferry", booking_type="transport",
        status="confirmed", quoted_cost="180.00", quoted_currency="NZD",
    )

    response = client.get(f"/trips/{trip_id}/budget")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["plutus_available"] is False
    assert body["plutus_error"] == "Plutus upstream 503"
    assert body["actual_settled_nzd"] is None
    assert body["planned_nzd"] == "180.00"
    assert body["missing_fx_currencies"] == []


def test_budget_endpoint_returns_404_for_missing_trip(
    app_and_client: tuple[FastAPI, TestClient],
) -> None:
    """Verify unknown trip ID returns 404 before querying Plutus."""
    _app, client = app_and_client
    response = client.get(f"/trips/{uuid.uuid4()}/budget")
    assert response.status_code == 404
