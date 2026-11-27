"""Application service for capability share tokens and redacted public views."""

from datetime import datetime, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.errors import DomainNotFoundError
from app.domain.sharing import (
    build_shared_trip_view,
    generate_share_token,
    validate_share_token_active,
)
from app.models import Attachment, Booking, ShareToken
from app.schemas import SharedTripViewRead, ShareTokenCreate, ShareTokenUpdate
from app.services import trip_service
from app.services.ownership import (
    reject_explicit_nulls,
    require_share_token_for_trip,
    require_trip,
)

REQUIRED_SHARE_TOKEN_UPDATE_FIELDS = (
    "include_pnrs",
    "include_attachments",
    "include_costs",
    "include_checklists",
    "include_private_notes",
)


def _normalize_label(label: str | None) -> str | None:
    if label is None:
        return None
    cleaned = label.strip()
    return cleaned or None


def list_share_tokens(db: Session, trip_id: uuid.UUID) -> list[ShareToken]:
    """List all capability share tokens issued for a trip, newest first."""
    require_trip(db, trip_id)
    return list(
        db.scalars(
            select(ShareToken)
            .where(ShareToken.trip_id == trip_id)
            .order_by(ShareToken.created_at.desc())
        )
    )


def create_share_token(
    db: Session,
    trip_id: uuid.UUID,
    payload: ShareTokenCreate,
) -> ShareToken:
    """Issue a new 256-bit capability share token with safe-by-default redaction."""
    require_trip(db, trip_id)
    token_row = ShareToken(
        trip_id=trip_id,
        token=generate_share_token(),
        label=_normalize_label(payload.label),
        include_pnrs=payload.include_pnrs,
        include_attachments=payload.include_attachments,
        include_costs=payload.include_costs,
        include_checklists=payload.include_checklists,
        include_private_notes=payload.include_private_notes,
        expires_at=payload.expires_at,
    )
    db.add(token_row)
    db.commit()
    db.refresh(token_row)
    return token_row


def update_share_token(
    db: Session,
    trip_id: uuid.UUID,
    token_id: uuid.UUID,
    payload: ShareTokenUpdate,
) -> ShareToken:
    """Update visibility toggles, label, or expiry for an existing share token."""
    require_trip(db, trip_id)
    token_row = require_share_token_for_trip(db, trip_id, token_id)
    reject_explicit_nulls(payload, REQUIRED_SHARE_TOKEN_UPDATE_FIELDS)
    updates = payload.model_dump(exclude_unset=True)
    if "label" in updates:
        updates["label"] = _normalize_label(updates["label"])
    for field, value in updates.items():
        setattr(token_row, field, value)
    db.commit()
    db.refresh(token_row)
    return token_row


def rotate_share_token(
    db: Session,
    trip_id: uuid.UUID,
    token_id: uuid.UUID,
) -> ShareToken:
    """Revoke an existing token and issue a fresh token preserving settings."""
    require_trip(db, trip_id)
    old_token = require_share_token_for_trip(db, trip_id, token_id)
    now = datetime.now(timezone.utc)
    if old_token.revoked_at is None:
        old_token.revoked_at = now
    new_token = ShareToken(
        trip_id=old_token.trip_id,
        token=generate_share_token(),
        label=old_token.label,
        include_pnrs=old_token.include_pnrs,
        include_attachments=old_token.include_attachments,
        include_costs=old_token.include_costs,
        include_checklists=old_token.include_checklists,
        include_private_notes=old_token.include_private_notes,
        expires_at=old_token.expires_at,
    )
    db.add(new_token)
    db.commit()
    db.refresh(new_token)
    return new_token


def revoke_share_token(
    db: Session,
    trip_id: uuid.UUID,
    token_id: uuid.UUID,
) -> ShareToken:
    """Immediately revoke a share token without deleting audit metadata."""
    require_trip(db, trip_id)
    token_row = require_share_token_for_trip(db, trip_id, token_id)
    if token_row.revoked_at is None:
        token_row.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(token_row)
    return token_row


def delete_share_token(db: Session, trip_id: uuid.UUID, token_id: uuid.UUID) -> None:
    """Permanently delete a share token belonging to trip_id."""
    require_trip(db, trip_id)
    token_row = require_share_token_for_trip(db, trip_id, token_id)
    db.delete(token_row)
    db.commit()


def _require_active_token_by_value(db: Session, token_str: str) -> ShareToken:
    token_row = db.scalar(select(ShareToken).where(ShareToken.token == token_str))
    if token_row is None:
        raise DomainNotFoundError("Share link not found.")
    validate_share_token_active(token_row)
    return token_row


def get_shared_trip_view(db: Session, token_str: str) -> SharedTripViewRead:
    """Resolve an active share token into a redacted read-only companion trip view."""
    token_row = _require_active_token_by_value(db, token_str)
    workspace = trip_service.get_trip_workspace(db, token_row.trip_id)
    return build_shared_trip_view(workspace, token_row)


def get_shared_attachment(
    db: Session,
    token_str: str,
    attachment_id: uuid.UUID,
) -> Attachment:
    """Resolve an attachment authorized by an active share token with attachments enabled."""
    token_row = _require_active_token_by_value(db, token_str)
    if not token_row.include_attachments:
        raise DomainNotFoundError(f"Attachment {attachment_id} not found.")
    attachment = db.get(Attachment, attachment_id)
    if attachment is None or attachment.trip_id != token_row.trip_id:
        raise DomainNotFoundError(f"Attachment {attachment_id} not found.")
    if attachment.booking_id is not None:
        booking = db.get(Booking, attachment.booking_id)
        if booking is not None and booking.status == "draft":
            raise DomainNotFoundError(f"Attachment {attachment_id} not found.")
    return attachment
