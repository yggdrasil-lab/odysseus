"""Application service for Chronos travel mode overlay and anchor commitment sync."""

from dataclasses import asdict
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.adapters.chronos import (
    ChronosClientAdapter,
    ChronosCommitmentUpsert,
    ChronosOverlayMode,
    ChronosTravelModeUpsert,
)
from app.domain.chronos import (
    ProjectedChronosAnchor,
    check_chronos_sync_eligibility,
    project_trip_chronos_anchors,
    validate_chronos_sync_eligibility,
)
from app.models import Booking, ItineraryItem, Trip
from app.schemas.chronos import (
    ChronosAnchorPreviewRead,
    ChronosPreviewRead,
    ChronosSyncRequest,
    ChronosSyncResultRead,
)
from app.services.ownership import require_trip


def _load_trip_sync_sources(
    db: Session, trip_id: uuid.UUID
) -> tuple[list[Booking], list[ItineraryItem]]:
    bookings = list(
        db.scalars(
            select(Booking)
            .where(Booking.trip_id == trip_id)
            .options(selectinload(Booking.segments))
            .order_by(Booking.sort_order, Booking.created_at)
        )
    )
    items = list(
        db.scalars(
            select(ItineraryItem)
            .where(ItineraryItem.trip_id == trip_id)
            .order_by(ItineraryItem.sort_order, ItineraryItem.start_utc, ItineraryItem.created_at)
        )
    )
    return bookings, items


def _serialize_anchors(anchors: list[ProjectedChronosAnchor]) -> list[ChronosAnchorPreviewRead]:
    return [ChronosAnchorPreviewRead.model_validate(asdict(anchor)) for anchor in anchors]


def _resolve_overlay_mode(trip: Trip, requested: ChronosOverlayMode | None) -> ChronosOverlayMode:
    mode = requested if requested is not None else trip.chronos_overlay_mode
    if mode == "keep_work_blocks":
        return "keep_work_blocks"
    return "suppress_all_grid_blocks"


def _prune_commitments(
    chronos: ChronosClientAdapter,
    prefix: str,
    keep_refs: set[str],
) -> int:
    existing = chronos.list_travel_commitments(prefix)
    deleted = 0
    for record in existing:
        if record.external_ref and record.external_ref.startswith(prefix):
            if record.external_ref not in keep_refs:
                chronos.delete_commitment_by_ref(record.external_ref)
                deleted += 1
    return deleted


def _sync_enabled_trip(
    db: Session,
    trip: Trip,
    overlay_mode: ChronosOverlayMode,
    chronos: ChronosClientAdapter,
) -> tuple[int, int, list[ProjectedChronosAnchor]]:
    validate_chronos_sync_eligibility(trip.status, trip.start_date, trip.end_date)
    bookings, items = _load_trip_sync_sources(db, trip.id)
    anchors = project_trip_chronos_anchors(trip, bookings, items)
    prefix = f"odysseus:{trip.slug}:"

    chronos.upsert_travel_mode(
        ChronosTravelModeUpsert(
            external_ref=f"odysseus:{trip.slug}",
            label=trip.title,
            start_date=trip.start_date,
            end_date=trip.end_date,
            mode=overlay_mode,
            active=True,
        )
    )
    for anchor in anchors:
        chronos.upsert_commitment(
            ChronosCommitmentUpsert(
                title=anchor.title,
                target_date=anchor.target_date,
                start_minute=anchor.start_minute,
                end_minute=anchor.end_minute,
                all_day=False,
                source="travel",
                external_ref=anchor.external_ref,
                nudge_mode=anchor.nudge_mode,
                urgent_quiet_bypass=anchor.urgent_quiet_bypass,
                tentative=False,
                notes=anchor.notes,
                upsert_by_external_ref=True,
            )
        )
    deleted_count = _prune_commitments(chronos, prefix, {a.external_ref for a in anchors})
    return len(anchors), deleted_count, anchors


def _disable_trip_sync(
    trip: Trip,
    overlay_mode: ChronosOverlayMode,
    chronos: ChronosClientAdapter,
) -> int:
    prefix = f"odysseus:{trip.slug}:"
    deleted_count = _prune_commitments(chronos, prefix, set())
    chronos.upsert_travel_mode(
        ChronosTravelModeUpsert(
            external_ref=f"odysseus:{trip.slug}",
            label=trip.title,
            start_date=trip.start_date,
            end_date=trip.end_date,
            mode=overlay_mode,
            active=False,
        )
    )
    return deleted_count


def get_chronos_preview(db: Session, trip_id: uuid.UUID) -> ChronosPreviewRead:
    """Return eligibility state and projected Chronos anchors for a trip."""
    trip = require_trip(db, trip_id)
    bookings, items = _load_trip_sync_sources(db, trip_id)
    eligible, reason = check_chronos_sync_eligibility(trip.status, trip.start_date, trip.end_date)
    anchors = project_trip_chronos_anchors(trip, bookings, items)
    segment_count = sum(1 for a in anchors if a.source_kind == "booking_segment")
    item_count = sum(1 for a in anchors if a.source_kind == "itinerary_item")
    return ChronosPreviewRead(
        trip_id=trip.id,
        trip_slug=trip.slug,
        eligible=eligible,
        ineligible_reason=reason,
        sync_enabled=trip.chronos_sync_enabled,
        overlay_mode=_resolve_overlay_mode(trip, None),
        confirmed_segment_count=segment_count,
        synced_item_count=item_count,
        anchors=_serialize_anchors(anchors),
    )


def sync_trip_to_chronos(
    db: Session,
    trip_id: uuid.UUID,
    payload: ChronosSyncRequest,
    chronos: ChronosClientAdapter,
) -> ChronosSyncResultRead:
    """Synchronize or disable Chronos travel mode overlay and anchor commitments."""
    trip = require_trip(db, trip_id)
    target_enabled = trip.chronos_sync_enabled if payload.enabled is None else payload.enabled
    target_mode = _resolve_overlay_mode(trip, payload.overlay_mode)

    if target_enabled:
        upserted_count, deleted_count, anchors = _sync_enabled_trip(
            db, trip, target_mode, chronos
        )
    else:
        deleted_count = _disable_trip_sync(trip, target_mode, chronos)
        upserted_count = 0
        anchors = []

    trip.chronos_sync_enabled = target_enabled
    trip.chronos_overlay_mode = target_mode
    db.commit()
    db.refresh(trip)

    return ChronosSyncResultRead(
        trip_id=trip.id,
        trip_slug=trip.slug,
        sync_enabled=trip.chronos_sync_enabled,
        overlay_mode=target_mode,
        overlay_active=trip.chronos_sync_enabled,
        upserted_count=upserted_count,
        deleted_count=deleted_count,
        anchors=_serialize_anchors(anchors),
    )
