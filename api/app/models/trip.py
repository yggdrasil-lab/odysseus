"""SQLAlchemy ORM models for trips, legs, and calendar days."""

from datetime import date as CalendarDate, datetime, timezone
from decimal import Decimal
import uuid

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Trip(Base):
    """Top-level travel trip aggregate."""

    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="planning")
    start_date: Mapped[CalendarDate | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[CalendarDate | None] = mapped_column(Date, nullable=True)
    home_timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="Pacific/Auckland"
    )
    budget_nzd: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    immich_album_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vault_note_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    chronos_sync_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    chronos_overlay_mode: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="suppress_all_grid_blocks"
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=text("now()"),
    )

    legs: Mapped[list["Leg"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", passive_deletes=True
    )
    days: Mapped[list["Day"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", passive_deletes=True
    )


class Leg(Base):
    """Trip destination chapter (overlapping Leg date ranges are allowed)."""

    __tablename__ = "legs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    primary_city: Mapped[str] = mapped_column(String(120), nullable=False)
    country_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    base_timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    start_date: Mapped[CalendarDate] = mapped_column(Date, nullable=False)
    end_date: Mapped[CalendarDate] = mapped_column(Date, nullable=False)
    color: Mapped[str] = mapped_column(String(32), nullable=False, server_default="#38bdf8")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=text("now()"),
    )

    trip: Mapped["Trip"] = relationship(back_populates="legs")


class Day(Base):
    """Flat calendar day belonging directly to a trip."""

    __tablename__ = "days"
    __table_args__ = (UniqueConstraint("trip_id", "date", name="uq_days_trip_id_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[CalendarDate] = mapped_column(Date, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=text("now()"),
    )

    trip: Mapped["Trip"] = relationship(back_populates="days")
