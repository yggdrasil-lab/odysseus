"""Application services for destination Legs and Trip calendar Days."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.errors import DomainConflictError
from app.domain.timezones import validate_date_range, validate_iana_timezone
from app.models import Day, Leg
from app.schemas import DayCreate, DayUpdate, LegCreate, LegUpdate
from app.services.day_provisioning import provision_days_for_range
from app.services.ownership import (
    reject_explicit_nulls,
    require_day_for_trip,
    require_leg_for_trip,
    require_trip,
)

REQUIRED_LEG_UPDATE_FIELDS = (
    "name",
    "primary_city",
    "base_timezone",
    "start_date",
    "end_date",
    "color",
    "sort_order",
)
REQUIRED_DAY_UPDATE_FIELDS = ("date",)


def list_legs(db: Session, trip_id: uuid.UUID) -> list[Leg]:
    """List legs for a trip ordered chronologically then by sort_order."""
    require_trip(db, trip_id)
    return list(
        db.scalars(
            select(Leg)
            .where(Leg.trip_id == trip_id)
            .order_by(Leg.start_date, Leg.sort_order, Leg.created_at)
        )
    )


def create_leg(db: Session, trip_id: uuid.UUID, payload: LegCreate) -> Leg:
    """Create a destination leg and idempotently provision overlapping Trip days."""
    require_trip(db, trip_id)
    validate_iana_timezone(payload.base_timezone)
    validate_date_range(payload.start_date, payload.end_date, "Leg")

    leg = Leg(trip_id=trip_id, **payload.model_dump())
    db.add(leg)
    db.flush()
    provision_days_for_range(db, trip_id, leg.start_date, leg.end_date)
    db.commit()
    db.refresh(leg)
    return leg


def update_leg(db: Session, trip_id: uuid.UUID, leg_id: uuid.UUID, payload: LegUpdate) -> Leg:
    """Update a destination leg and provision days for any new span."""
    require_trip(db, trip_id)
    leg = require_leg_for_trip(db, trip_id, leg_id)
    reject_explicit_nulls(payload, REQUIRED_LEG_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True)

    next_tz = updates.get("base_timezone", leg.base_timezone)
    next_start = updates.get("start_date", leg.start_date)
    next_end = updates.get("end_date", leg.end_date)
    validate_iana_timezone(next_tz)
    validate_date_range(next_start, next_end, "Leg")

    for field, value in updates.items():
        setattr(leg, field, value)

    db.flush()
    provision_days_for_range(db, trip_id, leg.start_date, leg.end_date)
    db.commit()
    db.refresh(leg)
    return leg


def delete_leg(db: Session, trip_id: uuid.UUID, leg_id: uuid.UUID) -> None:
    """Delete a leg belonging to trip_id."""
    require_trip(db, trip_id)
    leg = require_leg_for_trip(db, trip_id, leg_id)
    db.delete(leg)
    db.commit()


def list_days(db: Session, trip_id: uuid.UUID) -> list[Day]:
    """List all calendar days for a trip ordered chronologically."""
    require_trip(db, trip_id)
    return list(db.scalars(select(Day).where(Day.trip_id == trip_id).order_by(Day.date)))


def create_day(db: Session, trip_id: uuid.UUID, payload: DayCreate) -> Day:
    """Explicitly create a calendar day for trip_id; reject duplicate dates with 409."""
    require_trip(db, trip_id)
    existing = db.scalar(select(Day.id).where(Day.trip_id == trip_id, Day.date == payload.date))
    if existing is not None:
        raise DomainConflictError(f"Day {payload.date.isoformat()} already exists for this trip.")

    day = Day(trip_id=trip_id, **payload.model_dump())
    db.add(day)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainConflictError(f"Day {payload.date.isoformat()} already exists for this trip.") from exc
    db.refresh(day)
    return day


def update_day(db: Session, trip_id: uuid.UUID, day_id: uuid.UUID, payload: DayUpdate) -> Day:
    """Update a trip calendar day."""
    require_trip(db, trip_id)
    day = require_day_for_trip(db, trip_id, day_id)
    reject_explicit_nulls(payload, REQUIRED_DAY_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True)

    next_date = updates.get("date", day.date)
    if next_date != day.date:
        conflict = db.scalar(
            select(Day.id).where(Day.trip_id == trip_id, Day.date == next_date, Day.id != day.id)
        )
        if conflict is not None:
            raise DomainConflictError(f"Day {next_date.isoformat()} already exists for this trip.")

    for field, value in updates.items():
        setattr(day, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainConflictError(f"Day {next_date.isoformat()} already exists for this trip.") from exc
    db.refresh(day)
    return day


def delete_day(db: Session, trip_id: uuid.UUID, day_id: uuid.UUID) -> None:
    """Delete a trip calendar day (scheduled items become unscheduled backlog)."""
    require_trip(db, trip_id)
    day = require_day_for_trip(db, trip_id, day_id)
    db.delete(day)
    db.commit()
