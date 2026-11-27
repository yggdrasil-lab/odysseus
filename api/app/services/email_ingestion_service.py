"""Application service for idempotent inbound email ingestion from Iris."""

import base64
import binascii
import mimetypes
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.domain.attachments import (
    ALLOWED_ATTACHMENT_MIMES,
    MAX_ATTACHMENT_BYTES,
    NormalizedAttachment,
    normalize_attachment,
    sanitize_filename,
)
from app.domain.email_ingestion import (
    ExtractedBookingFields,
    build_raw_email_snapshot,
    extract_booking_fields,
    match_trip_by_dates,
)
from app.domain.errors import DomainPayloadTooLargeError, DomainValidationError
from app.models import Attachment, Booking, Trip
from app.schemas.integrations import (
    InboundEmailAttachmentPayload,
    InboundEmailIngestResponse,
    InboundEmailWebhookPayload,
)


def _resolve_supported_mime(content_type: str | None, filename: str) -> str | None:
    cleaned = (content_type or "").split(";", 1)[0].strip().lower()
    if not cleaned or cleaned == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(filename)
        cleaned = (guessed or "").lower()
    return cleaned if cleaned in ALLOWED_ATTACHMENT_MIMES else None


def _decode_attachment_bytes(att: InboundEmailAttachmentPayload) -> bytes:
    try:
        return base64.b64decode(att.content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise DomainValidationError(
            f"Invalid base64 payload for attachment '{att.filename}'."
        ) from exc


def _process_attachments(
    attachments: list[InboundEmailAttachmentPayload],
) -> tuple[list[NormalizedAttachment], list[str]]:
    saved: list[NormalizedAttachment] = []
    skipped: list[str] = []
    for att in attachments:
        supported_mime = _resolve_supported_mime(att.content_type, att.filename)
        if supported_mime is None:
            continue
        raw_bytes = _decode_attachment_bytes(att)
        safe_name = sanitize_filename(att.filename)
        if len(raw_bytes) > MAX_ATTACHMENT_BYTES or not raw_bytes:
            skipped.append(safe_name)
            continue
        try:
            saved.append(normalize_attachment(safe_name, supported_mime, raw_bytes))
        except DomainPayloadTooLargeError:
            skipped.append(safe_name)
    return saved, skipped


def _build_booking_notes(
    payload: InboundEmailWebhookPayload,
    skipped_attachments: list[str],
) -> str | None:
    parts: list[str] = []
    if payload.from_address:
        parts.append(f"From: {payload.from_address.strip()}")
    if skipped_attachments:
        parts.append(
            f"Skipped oversized attachments (>15 MB): {', '.join(skipped_attachments)}"
        )
    return " | ".join(parts) if parts else None


def _find_existing_by_message_id(db: Session, message_id: str) -> Booking | None:
    return db.scalar(
        select(Booking)
        .where(Booking.source_email_message_id == message_id)
        .options(selectinload(Booking.attachments))
    )


def _build_duplicate_response(existing: Booking) -> InboundEmailIngestResponse:
    return InboundEmailIngestResponse(
        status="duplicate",
        duplicate=True,
        booking_id=existing.id,
        consumer_ref=f"booking:{existing.id}",
        trip_id=existing.trip_id,
        booking_status=existing.status,
        attachments_saved=len(existing.attachments),
        skipped_attachments=[],
    )


def _build_staged_booking(
    payload: InboundEmailWebhookPayload,
    message_id: str,
    fields: ExtractedBookingFields,
    matched_trip_id: uuid.UUID | None,
    match_reason: str,
    normalized_attachments: list[NormalizedAttachment],
    skipped_attachments: list[str],
) -> Booking:
    source_ref = payload.email_id.strip()[:255] if payload.email_id else None
    booking = Booking(
        trip_id=matched_trip_id,
        booking_type=fields.booking_type,
        status="draft",
        title=fields.title,
        provider=fields.provider,
        confirmation_code=fields.confirmation_code,
        quoted_cost=fields.quoted_cost,
        quoted_currency=fields.quoted_currency,
        source_reference=source_ref or None,
        source_email_message_id=message_id,
        raw_email_payload=build_raw_email_snapshot(payload, match_reason, skipped_attachments),
        notes=_build_booking_notes(payload, skipped_attachments),
    )
    for item in normalized_attachments:
        booking.attachments.append(
            Attachment(
                trip_id=matched_trip_id,
                filename=item.filename,
                mime_type=item.mime_type,
                size_bytes=item.size_bytes,
                sha256=item.sha256,
                content_bytes=item.content_bytes,
                extracted_text=item.extracted_text,
            )
        )
    return booking


def _persist_staged_booking(
    db: Session,
    booking: Booking,
    message_id: str,
    attachments_saved: int,
    skipped_attachments: list[str],
) -> tuple[InboundEmailIngestResponse, bool]:
    db.add(booking)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced = _find_existing_by_message_id(db, message_id)
        if raced is not None:
            return _build_duplicate_response(raced), False
        raise
    db.refresh(booking)
    return (
        InboundEmailIngestResponse(
            status="staged",
            duplicate=False,
            booking_id=booking.id,
            consumer_ref=f"booking:{booking.id}",
            trip_id=booking.trip_id,
            booking_status=booking.status,
            attachments_saved=attachments_saved,
            skipped_attachments=skipped_attachments,
        ),
        True,
    )


def ingest_inbound_email(
    db: Session,
    payload: InboundEmailWebhookPayload,
) -> tuple[InboundEmailIngestResponse, bool]:
    """Ingest an inbound Iris email idempotently, staging a draft booking and attachments."""
    message_id = payload.message_id.strip()
    if not message_id:
        raise DomainValidationError("Inbound email message_id must not be empty.")
    if len(message_id) > 255:
        raise DomainValidationError("Inbound email message_id exceeds 255 characters.")

    existing = _find_existing_by_message_id(db, message_id)
    if existing is not None:
        return _build_duplicate_response(existing), False

    normalized_attachments, skipped_attachments = _process_attachments(payload.attachments)
    pdf_texts = [item.extracted_text for item in normalized_attachments if item.extracted_text]
    fields = extract_booking_fields(payload, pdf_texts)
    trips = list(db.scalars(select(Trip)))
    matched_trip_id, match_reason = match_trip_by_dates(trips, fields.extracted_dates)

    booking = _build_staged_booking(
        payload,
        message_id,
        fields,
        matched_trip_id,
        match_reason,
        normalized_attachments,
        skipped_attachments,
    )
    return _persist_staged_booking(
        db,
        booking,
        message_id,
        len(normalized_attachments),
        skipped_attachments,
    )
