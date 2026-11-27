"""Thin REST routers for capability share token CRUD and public companion views."""

import uuid

from fastapi import APIRouter, Depends, Header, Request, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_share_rate_limiter
from app.domain.rate_limit import InMemoryRateLimiter, extract_client_ip
from app.routers.attachments import build_attachment_response
from app.schemas import (
    SharedTripViewRead,
    ShareTokenCreate,
    ShareTokenRead,
    ShareTokenUpdate,
)
from app.services import share_service

author_router = APIRouter(prefix="/trips/{trip_id}/share-tokens", tags=["ShareTokens"])
public_router = APIRouter(prefix="/share", tags=["Share"])


@author_router.get("", response_model=list[ShareTokenRead])
def list_share_tokens(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[ShareTokenRead]:
    """List capability share tokens for a trip."""
    return [
        ShareTokenRead.model_validate(item)
        for item in share_service.list_share_tokens(db, trip_id)
    ]


@author_router.post("", response_model=ShareTokenRead, status_code=status.HTTP_201_CREATED)
def create_share_token(
    trip_id: uuid.UUID,
    payload: ShareTokenCreate,
    db: Session = Depends(get_db),
) -> ShareTokenRead:
    """Issue a new capability share token with safe-by-default redaction."""
    token_row = share_service.create_share_token(db, trip_id, payload)
    return ShareTokenRead.model_validate(token_row)


@author_router.patch("/{token_id}", response_model=ShareTokenRead)
def update_share_token(
    trip_id: uuid.UUID,
    token_id: uuid.UUID,
    payload: ShareTokenUpdate,
    db: Session = Depends(get_db),
) -> ShareTokenRead:
    """Update visibility toggles, label, or expiry on an existing share token."""
    token_row = share_service.update_share_token(db, trip_id, token_id, payload)
    return ShareTokenRead.model_validate(token_row)


@author_router.post("/{token_id}/rotate", response_model=ShareTokenRead)
def rotate_share_token(
    trip_id: uuid.UUID,
    token_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> ShareTokenRead:
    """Revoke an existing token and return a newly minted replacement token."""
    token_row = share_service.rotate_share_token(db, trip_id, token_id)
    return ShareTokenRead.model_validate(token_row)


@author_router.post("/{token_id}/revoke", response_model=ShareTokenRead)
def revoke_share_token(
    trip_id: uuid.UUID,
    token_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> ShareTokenRead:
    """Revoke an existing capability share token."""
    token_row = share_service.revoke_share_token(db, trip_id, token_id)
    return ShareTokenRead.model_validate(token_row)


@author_router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_share_token(
    trip_id: uuid.UUID,
    token_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete a capability share token."""
    share_service.delete_share_token(db, trip_id, token_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.get("/{token}", response_model=SharedTripViewRead)
def get_shared_trip_view(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
    rate_limiter: InMemoryRateLimiter = Depends(get_share_rate_limiter),
) -> SharedTripViewRead:
    """Return redacted read-only companion trip view for an active capability token."""
    rate_limiter.check(extract_client_ip(request))
    return share_service.get_shared_trip_view(db, token)


@public_router.get("/{token}/attachments/{attachment_id}/content")
def get_shared_attachment_content(
    token: str,
    attachment_id: uuid.UUID,
    request: Request,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    range_header: str | None = Header(default=None, alias="Range"),
    db: Session = Depends(get_db),
    rate_limiter: InMemoryRateLimiter = Depends(get_share_rate_limiter),
) -> Response:
    """Stream an attachment authorized by an active share token with ETag/Range support."""
    rate_limiter.check(extract_client_ip(request))
    attachment = share_service.get_shared_attachment(db, token, attachment_id)
    return build_attachment_response(attachment, if_none_match, range_header)
