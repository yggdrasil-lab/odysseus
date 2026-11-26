"""Frozen Pydantic schemas for bookings, segments, and binary attachments."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.domain.bookings import compute_day_offset, compute_projected_arrival_date

BookingType = Literal["flight", "lodging", "transport", "activity", "insurance"]
BookingStatus = Literal["draft", "pending", "confirmed", "cancelled"]


class BookingSegmentCreate(BaseModel):
    """Payload to create or replace a segment inside a booking."""

    model_config = ConfigDict(frozen=True)

    segment_order: int = 0
    carrier: str | None = Field(default=None, max_length=120)
    flight_or_service_number: str | None = Field(default=None, max_length=64)
    origin_label: str = Field(min_length=1, max_length=200)
    origin_code: str | None = Field(default=None, max_length=16)
    destination_label: str = Field(min_length=1, max_length=200)
    destination_code: str | None = Field(default=None, max_length=16)
    departure_local: datetime
    departure_tz: str = Field(min_length=1, max_length=64)
    arrival_local: datetime
    arrival_tz: str = Field(min_length=1, max_length=64)
    seat_or_cabin: str | None = Field(default=None, max_length=64)
    terminal_gate: str | None = Field(default=None, max_length=64)
    notes: str | None = None


class BookingSegmentRead(BaseModel):
    """Serialized booking segment with UTC bounds and cross-dateline indicators."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    segment_order: int
    carrier: str | None
    flight_or_service_number: str | None
    origin_label: str
    origin_code: str | None
    destination_label: str
    destination_code: str | None
    departure_local: datetime
    departure_tz: str
    arrival_local: datetime
    arrival_tz: str
    departure_utc: datetime
    arrival_utc: datetime
    seat_or_cabin: str | None
    terminal_gate: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def day_offset(self) -> int:
        """Local calendar day offset between arrival and departure."""
        return compute_day_offset(self.departure_local, self.arrival_local)

    @computed_field
    @property
    def projected_arrival_date(self) -> date | None:
        """Arrival local date when arrival occurs on a later local calendar day."""
        return compute_projected_arrival_date(self.departure_local, self.arrival_local)


class BookingCreate(BaseModel):
    """Payload to create a booking with optional ordered flight/transit segments."""

    model_config = ConfigDict(frozen=True)

    booking_type: BookingType
    status: BookingStatus = "draft"
    title: str = Field(min_length=1, max_length=250)
    provider: str | None = Field(default=None, max_length=160)
    confirmation_code: str | None = Field(default=None, max_length=120)
    quoted_cost: Decimal | None = Field(default=None, ge=0)
    quoted_currency: str | None = Field(default=None, max_length=8)
    source_reference: str | None = Field(default=None, max_length=255)
    source_email_message_id: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    sort_order: int = 0
    segments: list[BookingSegmentCreate] = Field(default_factory=list)


class BookingUpdate(BaseModel):
    """Partial update payload for a booking with optional atomic segment replacement."""

    model_config = ConfigDict(frozen=True)

    booking_type: BookingType | None = None
    status: BookingStatus | None = None
    title: str | None = Field(default=None, min_length=1, max_length=250)
    provider: str | None = Field(default=None, max_length=160)
    confirmation_code: str | None = Field(default=None, max_length=120)
    quoted_cost: Decimal | None = Field(default=None, ge=0)
    quoted_currency: str | None = Field(default=None, max_length=8)
    source_reference: str | None = Field(default=None, max_length=255)
    source_email_message_id: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    sort_order: int | None = None
    segments: list[BookingSegmentCreate] | None = None


class BookingRead(BaseModel):
    """Serialized booking representation with nested segments."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID | None
    booking_type: BookingType
    status: BookingStatus
    title: str
    provider: str | None
    confirmation_code: str | None
    quoted_cost: Decimal | None
    quoted_currency: str | None
    source_reference: str | None
    source_email_message_id: str | None
    notes: str | None
    sort_order: int
    segments: list[BookingSegmentRead]
    created_at: datetime
    updated_at: datetime


class AttachmentRead(BaseModel):
    """Metadata representation of a stored attachment without binary payload bytes."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    booking_id: uuid.UUID | None
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    extracted_text: str | None
    created_at: datetime
