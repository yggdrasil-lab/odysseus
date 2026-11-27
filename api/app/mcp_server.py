"""Bearer-authenticated MCP endpoint for Odysseus mounted at POST /mcp."""

from __future__ import annotations

from collections.abc import Callable, Iterator
import contextlib
from datetime import date, datetime
from typing import Any
import uuid

from fastapi import FastAPI
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.orm import Session
from starlette.applications import Starlette
from starlette.routing import Route

from app.db import get_db
from app.domain.errors import DomainConflictError, DomainNotFoundError, DomainValidationError
from app.domain.markdown_export import render_trip_markdown
from app.domain.timezones import ALL_TRIP_STATUSES
from app.schemas import (
    ChecklistItemRead,
    ChecklistRead,
    ItineraryItemCreate,
    ItineraryItemRead,
    PlaceCreate,
    PlaceRead,
    TravelNoteCreate,
    TravelNoteRead,
)
from app.services import (
    checklist_note_service,
    day_brief_service,
    itinerary_service,
    place_service,
    trip_service,
)

SessionOpener = Callable[[], contextlib.AbstractContextManager[Session]]


@contextlib.contextmanager
def _tool_errors() -> Iterator[None]:
    """Translate domain, validation, and parsing errors into MCP ToolError."""
    try:
        yield
    except (
        DomainNotFoundError,
        DomainValidationError,
        DomainConflictError,
        PydanticValidationError,
        ValueError,
    ) as exc:
        raise ToolError(str(exc)) from exc


def _parse_uuid(raw: str, field_name: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw.strip())
    except (ValueError, AttributeError) as exc:
        raise ToolError(f"{field_name} must be a valid UUID, got {raw!r}.") from exc


def _parse_optional_uuid(raw: str | None, field_name: str) -> uuid.UUID | None:
    if raw is None or not raw.strip():
        return None
    return _parse_uuid(raw, field_name)


def _parse_required_date(raw: str, field_name: str) -> date:
    cleaned = raw.strip()
    if not cleaned:
        raise ToolError(f"{field_name} is required in YYYY-MM-DD format.")
    try:
        return date.fromisoformat(cleaned)
    except ValueError as exc:
        raise ToolError(f"{field_name} must be YYYY-MM-DD, got {raw!r}.") from exc


def _parse_optional_datetime(raw: str | None, field_name: str) -> datetime | None:
    if raw is None or not raw.strip():
        return None
    try:
        return datetime.fromisoformat(raw.strip())
    except ValueError as exc:
        raise ToolError(f"{field_name} must be ISO-8601 datetime, got {raw!r}.") from exc


def _serialize_trip_row(trip: Any) -> dict[str, Any]:
    return {
        "id": str(trip.id),
        "title": trip.title,
        "slug": trip.slug,
        "status": trip.status,
        "start_date": trip.start_date.isoformat() if trip.start_date else None,
        "end_date": trip.end_date.isoformat() if trip.end_date else None,
        "home_timezone": trip.home_timezone,
        "budget_nzd": str(trip.budget_nzd) if trip.budget_nzd is not None else None,
        "vault_note_path": trip.vault_note_path,
        "summary": trip.summary,
    }


def _register_trip_read_tools(server: MCPServer, open_session: SessionOpener) -> None:
    @server.tool(
        name="odysseus_list_trips",
        description="List Odysseus trips ordered newest-first, optionally filtered by status.",
    )
    def odysseus_list_trips(status: str | None = None) -> dict[str, Any]:
        with _tool_errors():
            cleaned_status = status.strip() if status is not None and status.strip() else None
            if cleaned_status is not None and cleaned_status not in ALL_TRIP_STATUSES:
                allowed = ", ".join(sorted(ALL_TRIP_STATUSES))
                raise ToolError(f"status must be one of [{allowed}], got {status!r}.")
            with open_session() as db:
                trips = trip_service.list_trips(db)
            if cleaned_status is not None:
                trips = [trip for trip in trips if trip.status == cleaned_status]
            serialized = [_serialize_trip_row(trip) for trip in trips]
            return {"count": len(serialized), "trips": serialized}

    @server.tool(
        name="odysseus_get_trip_overview",
        description="Get trip overview, legs, day count, booking summaries, and checklist progress.",
    )
    def odysseus_get_trip_overview(trip_id: str) -> dict[str, Any]:
        with _tool_errors():
            parsed_trip_id = _parse_uuid(trip_id, "trip_id")
            with open_session() as db:
                workspace = trip_service.get_trip_workspace(db, parsed_trip_id)
            return day_brief_service.build_trip_overview(workspace)

    @server.tool(
        name="odysseus_get_day_brief",
        description="Get a single-day trip brief with active legs, itinerary items, and flight/transit segments.",
    )
    def odysseus_get_day_brief(trip_id: str, target_date: str) -> dict[str, Any]:
        with _tool_errors():
            parsed_trip_id = _parse_uuid(trip_id, "trip_id")
            parsed_date = _parse_required_date(target_date, "target_date")
            with open_session() as db:
                workspace = trip_service.get_trip_workspace(db, parsed_trip_id)
            return day_brief_service.build_day_brief(workspace, parsed_date)


def _register_planning_read_tools(server: MCPServer, open_session: SessionOpener) -> None:
    @server.tool(
        name="odysseus_get_checklists",
        description="Get all typed checklists and items for a trip.",
    )
    def odysseus_get_checklists(trip_id: str) -> dict[str, Any]:
        with _tool_errors():
            parsed_trip_id = _parse_uuid(trip_id, "trip_id")
            with open_session() as db:
                checklists = checklist_note_service.list_checklists(db, parsed_trip_id)
            serialized = [
                ChecklistRead.model_validate(checklist).model_dump(mode="json")
                for checklist in checklists
            ]
            return {"trip_id": str(parsed_trip_id), "checklists": serialized}

    @server.tool(
        name="odysseus_export_trip_markdown",
        description="Render a one-way Obsidian Vault Markdown snapshot for a trip.",
    )
    def odysseus_export_trip_markdown(trip_id: str) -> dict[str, Any]:
        with _tool_errors():
            parsed_trip_id = _parse_uuid(trip_id, "trip_id")
            with open_session() as db:
                workspace = trip_service.get_trip_workspace(db, parsed_trip_id)
            markdown = render_trip_markdown(workspace)
            return {
                "trip_id": str(parsed_trip_id),
                "slug": workspace.trip.slug,
                "markdown": markdown,
            }


def _register_add_place_tool(server: MCPServer, open_session: SessionOpener) -> None:
    @server.tool(
        name="odysseus_add_place",
        description="Add a validated place pin or backlog candidate to a trip.",
    )
    def odysseus_add_place(
        trip_id: str,
        name: str,
        latitude: float,
        longitude: float,
        category: str = "other",
        address: str | None = None,
        notes: str | None = None,
        external_map_url: str | None = None,
        google_place_id: str | None = None,
        osm_id: str | None = None,
        is_backlog: bool = False,
    ) -> dict[str, Any]:
        with _tool_errors():
            parsed_trip_id = _parse_uuid(trip_id, "trip_id")
            payload = PlaceCreate(
                name=name,
                category=category,  # type: ignore[arg-type]
                latitude=latitude,
                longitude=longitude,
                address=address,
                notes=notes,
                external_map_url=external_map_url,
                google_place_id=google_place_id,
                osm_id=osm_id,
                is_backlog=is_backlog,
            )
            with open_session() as db:
                created = place_service.create_place(db, parsed_trip_id, payload)
            return PlaceRead.model_validate(created).model_dump(mode="json")


def _register_add_itinerary_item_tool(
    server: MCPServer,
    open_session: SessionOpener,
) -> None:
    @server.tool(
        name="odysseus_add_itinerary_item",
        description="Add a scheduled or backlog itinerary item to a trip.",
    )
    def odysseus_add_itinerary_item(
        trip_id: str,
        title: str,
        day_id: str | None = None,
        category: str = "activity",
        status: str = "idea",
        start_local: str | None = None,
        start_tz: str | None = None,
        end_local: str | None = None,
        end_tz: str | None = None,
        place_label: str | None = None,
        place_id: str | None = None,
        sync_to_chronos: bool = False,
        sort_order: int = 0,
        notes: str | None = None,
    ) -> dict[str, Any]:
        with _tool_errors():
            parsed_trip_id = _parse_uuid(trip_id, "trip_id")
            payload = ItineraryItemCreate(
                day_id=_parse_optional_uuid(day_id, "day_id"),
                title=title,
                category=category,  # type: ignore[arg-type]
                status=status,  # type: ignore[arg-type]
                start_local=_parse_optional_datetime(start_local, "start_local"),
                start_tz=start_tz,
                end_local=_parse_optional_datetime(end_local, "end_local"),
                end_tz=end_tz,
                place_label=place_label,
                place_id=_parse_optional_uuid(place_id, "place_id"),
                sync_to_chronos=sync_to_chronos,
                sort_order=sort_order,
                notes=notes,
            )
            with open_session() as db:
                created = itinerary_service.create_itinerary_item(db, parsed_trip_id, payload)
            return ItineraryItemRead.model_validate(created).model_dump(mode="json")


def _register_add_travel_note_tool(server: MCPServer, open_session: SessionOpener) -> None:
    @server.tool(
        name="odysseus_add_travel_note",
        description="Add a travel note scoped to a trip, optional leg, or optional day.",
    )
    def odysseus_add_travel_note(
        trip_id: str,
        title: str,
        body: str,
        leg_id: str | None = None,
        day_id: str | None = None,
        is_private: bool = False,
        sort_order: int = 0,
    ) -> dict[str, Any]:
        with _tool_errors():
            parsed_trip_id = _parse_uuid(trip_id, "trip_id")
            payload = TravelNoteCreate(
                leg_id=_parse_optional_uuid(leg_id, "leg_id"),
                day_id=_parse_optional_uuid(day_id, "day_id"),
                title=title,
                body=body,
                is_private=is_private,
                sort_order=sort_order,
            )
            with open_session() as db:
                created = checklist_note_service.create_note(db, parsed_trip_id, payload)
            return TravelNoteRead.model_validate(created).model_dump(mode="json")


def _register_upsert_checklist_tool(server: MCPServer, open_session: SessionOpener) -> None:
    @server.tool(
        name="odysseus_upsert_checklist_item",
        description="Create or toggle a checklist item by item_id or case-insensitive label.",
    )
    def odysseus_upsert_checklist_item(
        trip_id: str,
        checklist_id: str,
        label: str,
        is_checked: bool = False,
        item_id: str | None = None,
        sort_order: int | None = None,
    ) -> dict[str, Any]:
        with _tool_errors():
            parsed_trip_id = _parse_uuid(trip_id, "trip_id")
            parsed_checklist_id = _parse_uuid(checklist_id, "checklist_id")
            parsed_item_id = _parse_optional_uuid(item_id, "item_id")
            with open_session() as db:
                item = checklist_note_service.upsert_checklist_item(
                    db,
                    parsed_trip_id,
                    parsed_checklist_id,
                    label=label,
                    is_checked=is_checked,
                    item_id=parsed_item_id,
                    sort_order=sort_order,
                )
            return ChecklistItemRead.model_validate(item).model_dump(mode="json")


def build_mcp_server(open_session: SessionOpener) -> MCPServer:
    """Construct the Odysseus MCPServer exposing strictly the 9 scoped tools."""
    server = MCPServer(
        name="odysseus",
        version="0.1.0",
        instructions=(
            "Odysseus personal travel planner. Read trip overviews, day briefs, "
            "checklists, and Markdown exports; add places, itinerary items, travel "
            "notes, and checklist item updates. Destructive deletes, booking "
            "confirmations, ShareTokens, and Immich actions are excluded."
        ),
    )
    _register_trip_read_tools(server, open_session)
    _register_planning_read_tools(server, open_session)
    _register_add_place_tool(server, open_session)
    _register_add_itinerary_item_tool(server, open_session)
    _register_add_travel_note_tool(server, open_session)
    _register_upsert_checklist_tool(server, open_session)
    return server


class _RebuildableApp:
    """ASGI shim that (re)creates the SDK sub-app for each lifespan startup."""

    def __init__(self, server: MCPServer) -> None:
        self._server = server
        self.app: Starlette | None = None

    def build(self) -> Starlette:
        return self._server.streamable_http_app(
            streamable_http_path="/mcp",
            stateless_http=True,
            json_response=True,
            transport_security=TransportSecuritySettings(
                enable_dns_rebinding_protection=False
            ),
        )

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if self.app is None:
            raise RuntimeError("MCP sub-app is not running; lifespan did not start")
        await self.app(scope, receive, send)


def install_mcp(app: FastAPI) -> None:
    """Attach the Odysseus MCP server route and chain lifespan without duplicating auth."""

    @contextlib.contextmanager
    def _open_session() -> Iterator[Session]:
        provider = app.dependency_overrides.get(get_db, get_db)
        gen = provider()
        db = next(gen)
        try:
            yield db
        finally:
            gen.close()

    server = build_mcp_server(_open_session)
    holder = _RebuildableApp(server)
    app.router.routes.append(Route("/mcp", endpoint=holder))

    original_lifespan = app.router.lifespan_context

    @contextlib.asynccontextmanager
    async def lifespan(app_: FastAPI):
        sub_app = holder.build()
        holder.app = sub_app
        async with contextlib.AsyncExitStack() as stack:
            if original_lifespan is not None:
                await stack.enter_async_context(original_lifespan(app_))
            await stack.enter_async_context(sub_app.router.lifespan_context(app_))
            yield
        holder.app = None

    app.router.lifespan_context = lifespan
