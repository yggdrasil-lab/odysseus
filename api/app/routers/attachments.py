"""Thin REST router for PostgreSQL-stored trip attachments and byte-range downloads."""

import mimetypes
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.domain.attachments import MAX_ATTACHMENT_BYTES, parse_byte_range
from app.domain.errors import DomainPayloadTooLargeError
from app.schemas import AttachmentRead
from app.services import attachment_service

router = APIRouter(prefix="/trips/{trip_id}/attachments", tags=["Attachments"])


def _etag_matches(if_none_match: str | None, sha256_hex: str) -> bool:
    if not if_none_match:
        return False
    for raw_tag in if_none_match.split(","):
        cleaned = raw_tag.strip()
        if cleaned == "*":
            return True
        if cleaned.startswith("W/"):
            cleaned = cleaned[2:].strip()
        if cleaned.strip('"') == sha256_hex:
            return True
    return False


def _content_headers(filename: str, sha256_hex: str) -> dict[str, str]:
    return {
        "ETag": f'"{sha256_hex}"',
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
    }


@router.get("", response_model=list[AttachmentRead])
def list_attachments(trip_id: uuid.UUID, db: Session = Depends(get_db)) -> list[AttachmentRead]:
    """List attachment metadata for a trip without binary payload bytes."""
    return [
        AttachmentRead.model_validate(item)
        for item in attachment_service.list_attachments(db, trip_id)
    ]


@router.post("", response_model=AttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    trip_id: uuid.UUID,
    file: UploadFile = File(...),
    booking_id: uuid.UUID | None = Form(default=None),
    db: Session = Depends(get_db),
) -> AttachmentRead:
    """Upload a PDF or image confirmation attachment up to 15 MB."""
    raw_bytes = await file.read(MAX_ATTACHMENT_BYTES + 1)
    if len(raw_bytes) > MAX_ATTACHMENT_BYTES:
        raise DomainPayloadTooLargeError("Attachment exceeds maximum size of 15 MB.")

    filename = file.filename or "attachment"
    mime_type = file.content_type or mimetypes.guess_type(filename)[0]
    attachment = attachment_service.upload_attachment(
        db=db,
        trip_id=trip_id,
        filename=filename,
        mime_type=mime_type,
        raw_bytes=raw_bytes,
        booking_id=booking_id,
    )
    return AttachmentRead.model_validate(attachment)


@router.get("/{attachment_id}/content")
def get_attachment_content(
    trip_id: uuid.UUID,
    attachment_id: uuid.UUID,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    range_header: str | None = Header(default=None, alias="Range"),
    db: Session = Depends(get_db),
) -> Response:
    """Stream attachment bytes with ETag/304, Accept-Ranges, 206, and inline disposition."""
    attachment = attachment_service.get_attachment_content(db, trip_id, attachment_id)
    headers = _content_headers(attachment.filename, attachment.sha256)

    if _etag_matches(if_none_match, attachment.sha256):
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    payload = attachment.content_bytes
    total_size = len(payload)
    if range_header:
        start, end = parse_byte_range(range_header, total_size)
        chunk = payload[start : end + 1]
        range_headers = {
            **headers,
            "Content-Range": f"bytes {start}-{end}/{total_size}",
            "Content-Length": str(len(chunk)),
        }
        return Response(
            content=chunk,
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type=attachment.mime_type,
            headers=range_headers,
        )

    full_headers = {**headers, "Content-Length": str(total_size)}
    return Response(
        content=payload,
        status_code=status.HTTP_200_OK,
        media_type=attachment.mime_type,
        headers=full_headers,
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    trip_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Delete a stored attachment."""
    attachment_service.delete_attachment(db, trip_id, attachment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
