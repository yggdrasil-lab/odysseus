"""FastAPI application entrypoint for Odysseus API."""

from fastapi import APIRouter, FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.config import Settings, settings
from app.domain.errors import (
    DomainConflictError,
    DomainGoneError,
    DomainNotFoundError,
    DomainPayloadTooLargeError,
    DomainRangeNotSatisfiableError,
    DomainRateLimitError,
    DomainUpstreamError,
    DomainValidationError,
)
from app.domain.rate_limit import InMemoryRateLimiter
from app.middleware import McpAuthMiddleware, NoCacheMiddleware, ShareSecurityHeadersMiddleware
from app.routers import (
    attachments,
    bookings,
    budget,
    checklists,
    health,
    itinerary,
    mappacks,
    notes,
    places,
    routes,
    sharing,
    trips,
)

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


def _register_domain_handlers(application: FastAPI) -> None:
    @application.exception_handler(DomainNotFoundError)
    async def _handle_not_found(_request: Request, exc: DomainNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})

    @application.exception_handler(DomainConflictError)
    async def _handle_conflict(_request: Request, exc: DomainConflictError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)})

    @application.exception_handler(DomainPayloadTooLargeError)
    async def _handle_payload_too_large(
        _request: Request, exc: DomainPayloadTooLargeError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            content={"detail": str(exc)},
        )

    @application.exception_handler(DomainRangeNotSatisfiableError)
    async def _handle_range_error(
        _request: Request, exc: DomainRangeNotSatisfiableError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            content={"detail": str(exc)},
            headers={"Content-Range": f"bytes */{exc.total_size}"},
        )

    @application.exception_handler(DomainValidationError)
    async def _handle_validation(_request: Request, exc: DomainValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc)},
        )

    @application.exception_handler(DomainUpstreamError)
    async def _handle_upstream(_request: Request, exc: DomainUpstreamError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"detail": str(exc)},
        )

    @application.exception_handler(DomainGoneError)
    async def _handle_gone(_request: Request, exc: DomainGoneError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_410_GONE,
            content={"detail": str(exc)},
        )

    @application.exception_handler(DomainRateLimitError)
    async def _handle_rate_limit(_request: Request, exc: DomainRateLimitError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": str(exc)},
            headers={"Retry-After": str(exc.retry_after)},
        )


def create_app(app_settings: Settings | None = None) -> FastAPI:
    """Build and configure the Odysseus FastAPI application."""
    resolved_settings = app_settings or settings
    application = FastAPI(title="Odysseus API", version="0.1.0")
    application.state.settings = resolved_settings
    application.state.share_rate_limiter = InMemoryRateLimiter(limit=60, window_seconds=60)
    _register_domain_handlers(application)
    application.include_router(health.router)
    application.include_router(trips.router)
    application.include_router(itinerary.router)
    application.include_router(checklists.router)
    application.include_router(notes.router)
    application.include_router(bookings.router)
    application.include_router(budget.router)
    application.include_router(attachments.router)
    application.include_router(places.router)
    application.include_router(routes.router)
    application.include_router(mappacks.router)
    application.include_router(sharing.author_router)
    application.include_router(sharing.public_router)
    application.include_router(mcp_router)
    application.add_middleware(
        McpAuthMiddleware,
        settings_provider=lambda: resolved_settings,
    )
    application.add_middleware(NoCacheMiddleware)
    application.add_middleware(ShareSecurityHeadersMiddleware)
    return application


app = create_app()
