"""Frozen Pydantic schemas for internal Iris inbound email ingestion."""

from typing import Any, Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InboundEmailAttachmentPayload(BaseModel):
    """Base64-encoded email attachment forwarded by Iris HttpConsumerDispatchAdapter."""

    model_config = ConfigDict(frozen=True)

    filename: str = Field(default="attachment", max_length=255)
    content_type: str | None = None
    size_bytes: int | None = Field(default=None, ge=0)
    sha256: str | None = None
    content_base64: str


class InboundEmailWebhookPayload(BaseModel):
    """Webhook payload sent from Iris to POST /integrations/email."""

    model_config = ConfigDict(frozen=True)

    email_id: str | None = None
    message_id: str
    route_target: str | None = None
    from_address: str | None = None
    to_address: str | None = None
    subject: str = ""
    received_at: str | None = None
    text_body: str | None = None
    html_excerpt: str | None = None
    raw_excerpt: str | None = None
    jev_verdict: str | dict[str, Any] | None = None
    attachments: list[InboundEmailAttachmentPayload] = Field(default_factory=list)

    @field_validator("email_id", mode="before")
    @classmethod
    def _coerce_email_id(cls, value: Any) -> Any:
        if isinstance(value, bool):
            raise ValueError("email_id must be a string or integer, not a boolean")
        if isinstance(value, int):
            return str(value)
        return value


class InboundEmailIngestResponse(BaseModel):
    """Idempotent ingestion receipt returned to Iris."""

    model_config = ConfigDict(frozen=True)

    status: Literal["staged", "duplicate"]
    duplicate: bool
    booking_id: uuid.UUID
    consumer_ref: str
    trip_id: uuid.UUID | None
    booking_status: str
    attachments_saved: int
    skipped_attachments: list[str] = Field(default_factory=list)
