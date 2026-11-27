"""SQLAlchemy ORM models for bookings, segments, and binary attachments."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
import uuid

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Booking(Base):
    """Travel reservation (flight, lodging, transport, activity, or insurance)."""

    __tablename__ = "bookings"
    __table_args__ = (
        Index(
            "uq_bookings_source_email_message_id",
            "source_email_message_id",
            unique=True,
            postgresql_where=text("source_email_message_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    booking_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="draft")
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(160), nullable=True)
    confirmation_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    quoted_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    quoted_currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_email_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_email_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
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

    segments: Mapped[list["BookingSegment"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="BookingSegment.segment_order, BookingSegment.departure_utc, BookingSegment.created_at",
    )
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="booking",
        passive_deletes=True,
    )


class BookingSegment(Base):
    """Individual flight or transit leg within a booking."""

    __tablename__ = "booking_segments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    segment_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    carrier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    flight_or_service_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    origin_label: Mapped[str] = mapped_column(String(200), nullable=False)
    origin_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    destination_label: Mapped[str] = mapped_column(String(200), nullable=False)
    destination_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    departure_local: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    departure_tz: Mapped[str] = mapped_column(String(64), nullable=False)
    arrival_local: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    arrival_tz: Mapped[str] = mapped_column(String(64), nullable=False)
    departure_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    arrival_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    seat_or_cabin: Mapped[str | None] = mapped_column(String(64), nullable=True)
    terminal_gate: Mapped[str | None] = mapped_column(String(64), nullable=True)
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

    booking: Mapped["Booking"] = relationship(back_populates="segments")


class Attachment(Base):
    """Binary PDF/image confirmation document stored in PostgreSQL."""

    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    content_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=text("now()")
    )

    booking: Mapped["Booking | None"] = relationship(back_populates="attachments")
