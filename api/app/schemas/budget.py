"""Frozen Pydantic schemas for trip budget rollups and Plutus FX/actuals."""

from datetime import date
from decimal import Decimal
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.bookings import BookingStatus, BookingType


class BudgetFxRateRead(BaseModel):
    """FX conversion rate entry surfaced in the trip budget response."""

    model_config = ConfigDict(frozen=True)

    rate: Decimal
    rate_date: date | None = None
    source: str


class PlannedBookingCostRead(BaseModel):
    """Serialized planned booking quote and NZD conversion status."""

    model_config = ConfigDict(frozen=True)

    booking_id: uuid.UUID
    title: str
    booking_type: BookingType | str
    status: BookingStatus | str
    quoted_cost: Decimal
    quoted_currency: str
    fx_rate: Decimal | None = None
    nzd_amount: Decimal | None = None


class BudgetCategoryActualRead(BaseModel):
    """Category breakdown entry from Plutus trip tag spend summary."""

    model_config = ConfigDict(frozen=True)

    category: str
    total_spend_nzd: Decimal
    transaction_count: int
    percentage: Decimal


class SettledTransactionRead(BaseModel):
    """Read-only Plutus transaction linked to the trip tag."""

    model_config = ConfigDict(frozen=True)

    id: int | str
    transaction_date: date
    account_name: str
    amount: Decimal
    currency: str
    exchange_rate: Decimal | None = None
    nzd_amount: Decimal | None = None
    merchant: str | None = None
    category: str | None = None
    raw_description: str | None = None
    tags: list[str] = Field(default_factory=list)


class TripBudgetSummaryRead(BaseModel):
    """Aggregated trip budget combining local booking quotes and Plutus actuals."""

    model_config = ConfigDict(frozen=True)

    trip_id: uuid.UUID
    trip_slug: str
    plutus_tag: str
    budget_nzd: Decimal | None
    planned_nzd: Decimal | None
    actual_settled_nzd: Decimal | None
    remaining_budget_nzd: Decimal | None
    variance_nzd: Decimal | None
    plutus_available: bool
    plutus_error: str | None
    midas_url: str | None
    missing_fx_currencies: list[str]
    fx_rates: dict[str, BudgetFxRateRead]
    planned_bookings: list[PlannedBookingCostRead]
    category_breakdown: list[BudgetCategoryActualRead]
    transactions: list[SettledTransactionRead]
