"""Frozen Pydantic schemas for capability share tokens and redacted companion views."""

from datetime import date as CalendarDate, datetime, timezone
from decimal import Decimal
import uuid

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.schemas.bookings import BookingSegmentRead, BookingStatus, BookingType
from app.schemas.places import PlaceRead, RouteEstimateRead
from app.schemas.planning import ChecklistRead, ItineraryItemRead, TravelNoteRead
from app.schemas.trips import DayRead, LegRead, TripStatus


class ShareTokenCreate(BaseModel):
    """Payload to issue a new read-only capability share token for a trip."""

    model_config = ConfigDict(frozen=True)

    label: str | None = Field(default=None, max_length=120)
    include_pnrs: bool = False
    include_attachments: bool = False
    include_costs: bool = False
    include_checklists: bool = False
    include_private_notes: bool = False
    expires_at: datetime | None = None


class ShareTokenUpdate(BaseModel):
    """Partial update payload to toggle share visibility flags, label, or expiry."""

    model_config = ConfigDict(frozen=True)

    label: str | None = Field(default=None, max_length=120)
    include_pnrs: bool | None = None
    include_attachments: bool | None = None
    include_costs: bool | None = None
    include_checklists: bool | None = None
    include_private_notes: bool | None = None
    expires_at: datetime | None = None


class ShareTokenRead(BaseModel):
    """Serialized capability share token metadata for trip authors."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    token: str
    label: str | None
    include_pnrs: bool
    include_attachments: bool
    include_costs: bool
    include_checklists: bool
    include_private_notes: bool
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def is_active(self) -> bool:
        """Return True when the token has not been revoked or expired."""
        if self.revoked_at is not None:
            return False
        if self.expires_at is None:
            return True
        expires = (
            self.expires_at.replace(tzinfo=timezone.utc)
            if self.expires_at.tzinfo is None
            else self.expires_at
        )
        return expires > datetime.now(timezone.utc)


class SharedVisibilityRead(BaseModel):
    """Effective redaction flags exposed on a public shared trip view."""

    model_config = ConfigDict(frozen=True)

    include_pnrs: bool
    include_attachments: bool
    include_costs: bool
    include_checklists: bool
    include_private_notes: bool


class SharedTripSummaryRead(BaseModel):
    """Redacted trip summary omitting Immich album and Vault note references."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    title: str
    slug: str
    status: TripStatus
    start_date: CalendarDate | None
    end_date: CalendarDate | None
    home_timezone: str
    budget_nzd: Decimal | None
    summary: str | None
    created_at: datetime
    updated_at: datetime


class SharedBookingRead(BaseModel):
    """Redacted booking omitting email message IDs and gated PNR/cost fields."""

    model_config = ConfigDict(frozen=True)

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
    notes: str | None
    sort_order: int
    segments: list[BookingSegmentRead]
    created_at: datetime
    updated_at: datetime


class SharedAttachmentRead(BaseModel):
    """Redacted attachment metadata with tokenized content URL and no extracted text."""

    model_config = ConfigDict(frozen=True)

    id: uuid.UUID
    booking_id: uuid.UUID | None
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    content_url: str
    created_at: datetime


class SharedTripViewRead(BaseModel):
    """Complete read-only companion trip payload filtered by ShareToken flags."""

    model_config = ConfigDict(frozen=True)

    visibility: SharedVisibilityRead
    trip: SharedTripSummaryRead
    legs: list[LegRead]
    days: list[DayRead]
    itinerary_items: list[ItineraryItemRead]
    checklists: list[ChecklistRead]
    travel_notes: list[TravelNoteRead]
    bookings: list[SharedBookingRead]
    attachments: list[SharedAttachmentRead]
    places: list[PlaceRead]
    route_estimates: list[RouteEstimateRead]
