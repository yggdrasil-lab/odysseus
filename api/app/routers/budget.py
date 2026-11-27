"""Thin REST router for read-only trip budget and Plutus FX/actuals linkage."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.adapters import PlutusClientAdapter
from app.config import Settings
from app.db import get_db
from app.dependencies import get_app_settings, get_plutus_client_adapter
from app.schemas import TripBudgetSummaryRead
from app.services import budget_service

router = APIRouter(prefix="/trips/{trip_id}/budget", tags=["Budget"])


@router.get("", response_model=TripBudgetSummaryRead)
def get_trip_budget(
    trip_id: uuid.UUID,
    db: Session = Depends(get_db),
    plutus: PlutusClientAdapter = Depends(get_plutus_client_adapter),
    app_settings: Settings = Depends(get_app_settings),
) -> TripBudgetSummaryRead:
    """Return planned booking rollups alongside read-only Plutus settled spend and FX rates."""
    return budget_service.get_trip_budget_summary(
        db=db,
        trip_id=trip_id,
        plutus=plutus,
        domain_name=app_settings.domain_name,
    )
