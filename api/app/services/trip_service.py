"""Application service for Trip CRUD and full workspace hydration."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer, selectinload

from app.domain.errors import DomainConflictError
from app.domain.timezones import validate_iana_timezone, validate_slug, validate_trip_dates
from app.models import (
    Attachment,
    Booking,
    Checklist,
    Day,
    ItineraryItem,
    Leg,
    Place,
    RouteEstimate,
    TravelNote,
    Trip,
)
from app.schemas import TripCreate, TripUpdate, TripWorkspaceRead
from app.services.day_provisioning import provision_days_for_range
from app.services.ownership import reject_explicit_nulls, require_trip

REQUIRED_TRIP_UPDATE_FIELDS = (
    "title",
    "slug",
    "status",
    "home_timezone",
    "chronos_sync_enabled",
    "chronos_overlay_mode",
)


def list_trips(db: Session) -> list[Trip]:
    """Return all trips ordered newest-first."""
    return list(db.scalars(select(Trip).order_by(Trip.created_at.desc())))


def create_trip(db: Session, payload: TripCreate) -> Trip:
    """Create a trip, validate slug/timezone/dates, and provision days when dated."""
    validate_slug(payload.slug)
    validate_iana_timezone(payload.home_timezone)
    validate_trip_dates(payload.status, payload.start_date, payload.end_date)

    existing = db.scalar(select(Trip.id).where(Trip.slug == payload.slug))
    if existing is not None:
        raise DomainConflictError(f"Trip slug '{payload.slug}' already exists.")

    trip = Trip(**payload.model_dump())
    db.add(trip)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise DomainConflictError(f"Trip slug '{payload.slug}' already exists.") from exc

    if trip.start_date is not None and trip.end_date is not None:
        provision_days_for_range(db, trip.id, trip.start_date, trip.end_date)

    db.commit()
    db.refresh(trip)
    return trip


def update_trip(db: Session, trip_id: uuid.UUID, payload: TripUpdate) -> Trip:
    """Update a trip, re-validating slug, timezone, and status/date invariants."""
    trip = require_trip(db, trip_id)
    reject_explicit_nulls(payload, REQUIRED_TRIP_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True)

    next_slug = updates.get("slug", trip.slug)
    next_tz = updates.get("home_timezone", trip.home_timezone)
    next_status = updates.get("status", trip.status)
    next_start = updates["start_date"] if "start_date" in updates else trip.start_date
    next_end = updates["end_date"] if "end_date" in updates else trip.end_date

    validate_slug(next_slug)
    validate_iana_timezone(next_tz)
    validate_trip_dates(next_status, next_start, next_end)

    if next_slug != trip.slug:
        conflict = db.scalar(select(Trip.id).where(Trip.slug == next_slug, Trip.id != trip.id))
        if conflict is not None:
            raise DomainConflictError(f"Trip slug '{next_slug}' already exists.")

    for field, value in updates.items():
        setattr(trip, field, value)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise DomainConflictError(f"Trip slug '{next_slug}' already exists.") from exc

    if trip.start_date is not None and trip.end_date is not None:
        provision_days_for_range(db, trip.id, trip.start_date, trip.end_date)

    db.commit()
    db.refresh(trip)
    return trip


def delete_trip(db: Session, trip_id: uuid.UUID) -> None:
    """Delete a trip and cascade to legs, days, items, checklists, and notes."""
    trip = require_trip(db, trip_id)
    db.delete(trip)
    db.commit()


def _load_trip_logistics(
    db: Session,
    trip_id: uuid.UUID,
) -> tuple[list[Booking], list[Attachment], list[Place], list[RouteEstimate]]:
    bookings = list(
        db.scalars(
            select(Booking)
            .where(Booking.trip_id == trip_id)
            .options(selectinload(Booking.segments))
            .order_by(Booking.sort_order, Booking.created_at)
        )
    )
    attachments = list(
        db.scalars(
            select(Attachment)
            .where(Attachment.trip_id == trip_id)
            .options(defer(Attachment.content_bytes))
            .order_by(Attachment.created_at.desc())
        )
    )
    places = list(
        db.scalars(
            select(Place).where(Place.trip_id == trip_id).order_by(Place.created_at)
        )
    )
    route_estimates = list(
        db.scalars(
            select(RouteEstimate)
            .where(RouteEstimate.trip_id == trip_id)
            .order_by(RouteEstimate.created_at)
        )
    )
    return bookings, attachments, places, route_estimates


def get_trip_workspace(db: Session, trip_id: uuid.UUID) -> TripWorkspaceRead:
    """Hydrate complete trip document workspace in one query batch."""
    trip = require_trip(db, trip_id)
    legs = list(
        db.scalars(
            select(Leg)
            .where(Leg.trip_id == trip_id)
            .order_by(Leg.start_date, Leg.sort_order, Leg.created_at)
        )
    )
    days = list(db.scalars(select(Day).where(Day.trip_id == trip_id).order_by(Day.date)))
    itinerary_items = list(
        db.scalars(
            select(ItineraryItem)
            .where(ItineraryItem.trip_id == trip_id)
            .order_by(ItineraryItem.sort_order, ItineraryItem.start_utc, ItineraryItem.created_at)
        )
    )
    checklists = list(
        db.scalars(
            select(Checklist)
            .where(Checklist.trip_id == trip_id)
            .options(selectinload(Checklist.items))
            .order_by(Checklist.sort_order, Checklist.created_at)
        )
    )
    travel_notes = list(
        db.scalars(
            select(TravelNote)
            .where(TravelNote.trip_id == trip_id)
            .order_by(TravelNote.sort_order, TravelNote.created_at)
        )
    )
    bookings, attachments, places, route_estimates = _load_trip_logistics(db, trip_id)
    return TripWorkspaceRead.model_validate(
        {
            "trip": trip,
            "legs": legs,
            "days": days,
            "itinerary_items": itinerary_items,
            "checklists": checklists,
            "travel_notes": travel_notes,
            "bookings": bookings,
            "attachments": attachments,
            "places": places,
            "route_estimates": route_estimates,
        }
    )
