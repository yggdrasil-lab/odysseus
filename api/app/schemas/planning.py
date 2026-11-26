"""Frozen Pydantic schemas for itinerary items, checklists, notes, and workspace."""

from datetime import date, datetime
from typing import Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.bookings import AttachmentRead, BookingRead
from app.schemas.places import PlaceRead, RouteEstimateRead
from app.schemas.trips import DayRead, LegRead, TripRead

ItemCategory = Literal["activity", "food", "transit", "lodging", "flight", "other"]
ItemStatus = Literal["idea", "planned", "confirmed", "done", "skipped"]
ChecklistType = Literal["packing", "prep", "shopping", "custom"]


class ItineraryItemCreate(BaseModel):
    """Payload to create a scheduled or backlog itinerary item."""

    model_config = ConfigDict(frozen=True)

    day_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=250)
    category: ItemCategory = "activity"
    status: ItemStatus = "idea"
    start_local: datetime | None = None
    start_tz: str | None = Field(default=None, max_length=64)
    end_local: datetime | None = None
    end_tz: str | None = Field(default=None, max_length=64)
    place_label: str | None = Field(default=None, max_length=200)
    place_id: uuid.UUID | None = None
    sync_to_chronos: bool = False
    sort_order: int = 0
    notes: str | None = None


class ItineraryItemUpdate(BaseModel):
    """Partial update payload for an itinerary item."""

    model_config = ConfigDict(frozen=True)

    day_id: uuid.UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=250)
    category: ItemCategory | None = None
    status: ItemStatus | None = None
    start_local: datetime | None = None
    start_tz: str | None = Field(default=None, max_length=64)
    end_local: datetime | None = None
    end_tz: str | None = Field(default=None, max_length=64)
    place_label: str | None = Field(default=None, max_length=200)
    place_id: uuid.UUID | None = None
    sync_to_chronos: bool | None = None
    sort_order: int | None = None
    notes: str | None = None


class ItineraryItemRead(BaseModel):
    """Serialized itinerary item representation."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    day_id: uuid.UUID | None
    title: str
    category: ItemCategory
    status: ItemStatus
    start_local: datetime | None
    start_tz: str | None
    end_local: datetime | None
    end_tz: str | None
    start_utc: datetime | None
    end_utc: datetime | None
    place_label: str | None
    place_id: uuid.UUID | None
    sync_to_chronos: bool
    sort_order: int
    notes: str | None
    created_at: datetime
    updated_at: datetime


class ChecklistItemCreate(BaseModel):
    """Payload to add an item to a checklist."""

    model_config = ConfigDict(frozen=True)

    leg_id: uuid.UUID | None = None
    label: str = Field(min_length=1, max_length=250)
    is_completed: bool = False
    due_date: date | None = None
    note: str | None = None
    sort_order: int = 0


class ChecklistItemUpdate(BaseModel):
    """Partial update payload for a checklist item."""

    model_config = ConfigDict(frozen=True)

    leg_id: uuid.UUID | None = None
    label: str | None = Field(default=None, min_length=1, max_length=250)
    is_completed: bool | None = None
    due_date: date | None = None
    note: str | None = None
    sort_order: int | None = None


class ChecklistItemRead(BaseModel):
    """Serialized checklist item representation."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    checklist_id: uuid.UUID
    leg_id: uuid.UUID | None
    label: str
    is_completed: bool
    due_date: date | None
    note: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class ChecklistCreate(BaseModel):
    """Payload to create a typed checklist for a trip."""

    model_config = ConfigDict(frozen=True)

    title: str = Field(min_length=1, max_length=200)
    list_type: ChecklistType = "packing"
    sort_order: int = 0


class ChecklistUpdate(BaseModel):
    """Partial update payload for a trip checklist."""

    model_config = ConfigDict(frozen=True)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    list_type: ChecklistType | None = None
    sort_order: int | None = None


class ChecklistRead(BaseModel):
    """Serialized checklist with nested ordered items."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    title: str
    list_type: ChecklistType
    sort_order: int
    items: list[ChecklistItemRead]
    created_at: datetime
    updated_at: datetime


class TravelNoteCreate(BaseModel):
    """Payload to create a travel note scoped to trip, leg, or day."""

    model_config = ConfigDict(frozen=True)

    leg_id: uuid.UUID | None = None
    day_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    is_private: bool = False
    sort_order: int = 0


class TravelNoteUpdate(BaseModel):
    """Partial update payload for a travel note."""

    model_config = ConfigDict(frozen=True)

    leg_id: uuid.UUID | None = None
    day_id: uuid.UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, min_length=1)
    is_private: bool | None = None
    sort_order: int | None = None


class TravelNoteRead(BaseModel):
    """Serialized travel note representation."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: uuid.UUID
    trip_id: uuid.UUID
    leg_id: uuid.UUID | None
    day_id: uuid.UUID | None
    title: str
    body: str
    is_private: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class TripWorkspaceRead(BaseModel):
    """Full workspace payload hydrated for a trip document."""

    model_config = ConfigDict(frozen=True)

    trip: TripRead
    legs: list[LegRead]
    days: list[DayRead]
    itinerary_items: list[ItineraryItemRead]
    checklists: list[ChecklistRead]
    travel_notes: list[TravelNoteRead]
    bookings: list[BookingRead]
    attachments: list[AttachmentRead]
    places: list[PlaceRead]
    route_estimates: list[RouteEstimateRead]
