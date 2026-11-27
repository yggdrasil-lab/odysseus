"""Pure ASGI middleware for response cache control and MCP Bearer auth."""

from collections.abc import Callable
import hmac

from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import Settings, settings
from app.domain.sharing import SHARE_SECURITY_HEADERS


def _extract_authorization_header(scope: Scope) -> str:
    for name, value in scope.get("headers", []):
        if name.lower() == b"authorization":
            return value.decode("latin-1")
    return ""


class NoCacheMiddleware:
    """Stamp every HTTP response with strict no-store headers for PWA freshness."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_no_cache(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
                headers["Pragma"] = "no-cache"
                headers["Expires"] = "0"
            await send(message)

        await self.app(scope, receive, send_with_no_cache)


class ShareSecurityHeadersMiddleware:
    """Stamp strict noindex, no-referrer, and no-store headers on all /share/* responses."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        if path != "/share" and not path.startswith("/share/"):
            await self.app(scope, receive, send)
            return

        async def send_with_share_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for header_name, header_value in SHARE_SECURITY_HEADERS.items():
                    headers[header_name] = header_value
            await send(message)

        await self.app(scope, receive, send_with_share_headers)


class McpAuthMiddleware:
    """Pure ASGI Bearer auth guard for /mcp and /mcp/*; fails closed outside development."""

    def __init__(
        self,
        app: ASGIApp,
        settings_provider: Callable[[], Settings] | None = None,
    ) -> None:
        self.app = app
        self._get_settings = settings_provider or (lambda: settings)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        if path != "/mcp" and not path.startswith("/mcp/"):
            await self.app(scope, receive, send)
            return

        current = self._get_settings()
        expected = current.mcp_token.strip()
        if not expected:
            if current.environment.strip().lower() != "development":
                response = JSONResponse(
                    {"detail": "Odysseus MCP token is not configured."},
                    status_code=503,
                )
                await response(scope, receive, send)
                return
            await self.app(scope, receive, send)
            return

        scheme, _, candidate = _extract_authorization_header(scope).partition(" ")
        cleaned = candidate.strip()
        if (
            scheme.lower() != "bearer"
            or not cleaned
            or not hmac.compare_digest(cleaned, expected)
        ):
            response = JSONResponse(
                {"detail": "Invalid or missing Bearer token."},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
