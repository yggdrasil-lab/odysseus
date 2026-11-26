"""ORM models package ensuring Base.metadata registers all tables on import."""

from app.models.bookings import Attachment, Booking, BookingSegment
from app.models.places import Place, RouteEstimate
from app.models.planning import Checklist, ChecklistItem, ItineraryItem, TravelNote
from app.models.trip import Day, Leg, Trip

__all__ = [
    "Attachment",
    "Booking",
    "BookingSegment",
    "Checklist",
    "ChecklistItem",
    "Day",
    "ItineraryItem",
    "Leg",
    "Place",
    "RouteEstimate",
    "TravelNote",
    "Trip",
]
