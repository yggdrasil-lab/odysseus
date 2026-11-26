"""Idempotent Day provisioning across Trip and Leg date ranges."""

from datetime import date
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.domain.timezones import iter_date_range
from app.models import Day


def provision_days_for_range(
    db: Session,
    trip_id: uuid.UUID,
    start_date: date,
    end_date: date,
) -> list[Day]:
    """Ensure Day rows exist for [start_date, end_date] using ON CONFLICT DO NOTHING."""
    calendar_dates = iter_date_range(start_date, end_date)
    rows = [{"id": uuid.uuid4(), "trip_id": trip_id, "date": day_date} for day_date in calendar_dates]
    stmt = pg_insert(Day).values(rows).on_conflict_do_nothing(constraint="uq_days_trip_id_date")
    db.execute(stmt)
    db.flush()
    return list(
        db.scalars(
            select(Day)
            .where(Day.trip_id == trip_id, Day.date >= start_date, Day.date <= end_date)
            .order_by(Day.date)
        )
    )
