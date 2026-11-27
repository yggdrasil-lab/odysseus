"""Internal integration router for Iris inbound email ingestion."""

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_app_settings
from app.schemas import InboundEmailIngestResponse, InboundEmailWebhookPayload
from app.services import email_ingestion_service

router = APIRouter(prefix="/integrations", tags=["Integrations"])


def require_integration_token(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> None:
    """Verify internal Bearer token via constant-time comparison; never trust Authentik headers."""
    expected = get_app_settings(request).integration_token.strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Odysseus integration token is not configured.",
        )

    scheme, _, candidate = (authorization or "").partition(" ")
    cleaned = candidate.strip()
    if (
        scheme.lower() != "bearer"
        or not cleaned
        or not hmac.compare_digest(cleaned, expected)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/email", response_model=InboundEmailIngestResponse)
def ingest_inbound_email(
    payload: InboundEmailWebhookPayload,
    response: Response,
    _: None = Depends(require_integration_token),
    db: Session = Depends(get_db),
) -> InboundEmailIngestResponse:
    """Stage an inbound travel booking and attachments idempotently from Iris."""
    result, created = email_ingestion_service.ingest_inbound_email(db, payload)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return result
