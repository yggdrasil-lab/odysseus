"""Tests for health probe, NoCacheMiddleware, and McpAuthMiddleware."""

from collections.abc import Generator
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import get_db
from app.main import create_app

API_DIR = Path(__file__).resolve().parents[1]


class _HealthyStubSession:
    def execute(self, _statement: object) -> int:
        return 1


class _FailingStubSession:
    def execute(self, _statement: object) -> None:
        raise RuntimeError("database connection refused")


def _build_client(test_settings: Settings | None = None) -> TestClient:
    app = create_app(test_settings)
    test_db_url = os.environ.get("ODYSSEUS_TEST_DATABASE_URL", "").strip()
    if test_db_url:
        alembic_cfg = Config(str(API_DIR / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(API_DIR / "alembic"))
        alembic_cfg.set_main_option("sqlalchemy.url", test_db_url)
        command.upgrade(alembic_cfg, "head")
        engine = create_engine(test_db_url, pool_pre_ping=True)
        session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

        def override_db() -> Generator[Session, None, None]:
            session = session_factory()
            try:
                yield session
            finally:
                session.close()
    else:
        def override_db() -> Generator[object, None, None]:
            yield _HealthyStubSession()

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def test_health_ok_and_no_cache_headers() -> None:
    """Verify /health returns 200 and NoCacheMiddleware headers are stamped."""
    client = _build_client()
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "odysseus-api"}
    assert response.headers["cache-control"] == "no-store, no-cache, must-revalidate, max-age=0"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["expires"] == "0"


def test_health_returns_503_on_database_error() -> None:
    """Verify /health fails loudly with 503 when database execution fails."""
    app = create_app()

    def failing_db() -> Generator[object, None, None]:
        yield _FailingStubSession()

    app.dependency_overrides[get_db] = failing_db
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 503
    assert "Database connectivity check failed" in response.json()["detail"]


def test_mcp_auth_fails_closed_when_unconfigured_outside_development() -> None:
    """Verify /mcp returns 503 outside development when no MCP token is configured."""
    prod_settings = Settings.model_construct(
        environment="production",
        mcp_token="",
    )
    client = TestClient(create_app(prod_settings))
    response = client.get("/mcp")
    assert response.status_code == 503
    assert response.headers["cache-control"] == "no-store, no-cache, must-revalidate, max-age=0"


def test_mcp_auth_allows_passthrough_in_development_when_unconfigured() -> None:
    """Verify /mcp allows development passthrough only when environment is development."""
    dev_settings = Settings(environment="development", mcp_token="")
    client = TestClient(create_app(dev_settings))
    response = client.get("/mcp")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "odysseus-mcp"}


def test_mcp_auth_rejects_missing_and_invalid_bearer_tokens() -> None:
    """Verify /mcp returns 401 with WWW-Authenticate on missing or wrong Bearer token."""
    configured = Settings(environment="development", mcp_token="synthetic-mcp-secret")
    client = TestClient(create_app(configured))

    missing = client.get("/mcp")
    assert missing.status_code == 401
    assert missing.headers["www-authenticate"] == "Bearer"

    wrong_scheme = client.get("/mcp", headers={"Authorization": "Basic abc123"})
    assert wrong_scheme.status_code == 401

    wrong_token = client.get("/mcp/ping", headers={"Authorization": "Bearer wrong-token"})
    assert wrong_token.status_code == 401


def test_mcp_auth_allows_valid_bearer_token() -> None:
    """Verify /mcp and /mcp/* allow requests presenting the exact Bearer token."""
    configured = Settings(environment="development", mcp_token="synthetic-mcp-secret")
    client = TestClient(create_app(configured))
    headers = {"Authorization": "Bearer synthetic-mcp-secret"}

    root_response = client.post("/mcp", headers=headers)
    assert root_response.status_code == 200
    assert root_response.json() == {"status": "ok", "service": "odysseus-mcp"}

    sub_response = client.get("/mcp/ping", headers=headers)
    assert sub_response.status_code == 200
    assert sub_response.json() == {"status": "ok", "service": "odysseus-mcp"}
