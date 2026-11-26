"""FastAPI application entrypoint for Odysseus API."""

from fastapi import APIRouter, FastAPI

from app.config import Settings, settings
from app.middleware import McpAuthMiddleware, NoCacheMiddleware
from app.routers import health

mcp_router = APIRouter(prefix="/mcp", tags=["MCP"])


@mcp_router.get("")
@mcp_router.post("")
def mcp_bootstrap_status() -> dict[str, str]:
    """Bootstrap placeholder endpoint guarded by McpAuthMiddleware."""
    return {"status": "ok", "service": "odysseus-mcp"}


@mcp_router.get("/ping")
def mcp_ping() -> dict[str, str]:
    """Authenticated MCP connectivity check for sub-path validation."""
    return {"status": "ok", "service": "odysseus-mcp"}


def create_app(app_settings: Settings | None = None) -> FastAPI:
    """Build and configure the Odysseus FastAPI application."""
    resolved_settings = app_settings or settings
    application = FastAPI(title="Odysseus API", version="0.1.0")
    application.include_router(health.router)
    application.include_router(mcp_router)
    application.add_middleware(
        McpAuthMiddleware,
        settings_provider=lambda: resolved_settings,
    )
    application.add_middleware(NoCacheMiddleware)
    return application


app = create_app()
