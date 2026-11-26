"""Pure domain normalization, PDF text extraction, WebP sizing, and Range parsing."""

from dataclasses import dataclass
import hashlib
import io
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
import pdfplumber

from app.domain.errors import (
    DomainPayloadTooLargeError,
    DomainRangeNotSatisfiableError,
    DomainValidationError,
)

MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
MAX_IMAGE_DIMENSION = 1400
WEBP_QUALITY = 75
ALLOWED_ATTACHMENT_MIMES = frozenset(
    {"application/pdf", "image/jpeg", "image/png", "image/webp"}
)
IMAGE_ATTACHMENT_MIMES = frozenset({"image/jpeg", "image/png", "image/webp"})


@dataclass(frozen=True)
class NormalizedAttachment:
    """Validated and normalized attachment ready for PostgreSQL storage."""

    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    content_bytes: bytes
    extracted_text: str | None


def sanitize_filename(filename: str) -> str:
    """Sanitize uploaded filename for safe Content-Disposition headers."""
    leaf = Path(filename or "attachment").name
    cleaned = "".join(ch for ch in leaf if ch >= " " and ch not in {'"', "\\"})
    cleaned = cleaned.strip() or "attachment"
    return cleaned[:255]


def normalize_mime_type(mime_type: str | None) -> str:
    """Strip parameters and validate MIME type against the attachment allowlist."""
    cleaned = (mime_type or "").split(";", 1)[0].strip().lower()
    if cleaned not in ALLOWED_ATTACHMENT_MIMES:
        raise DomainValidationError(f"Unsupported attachment MIME type: {mime_type or 'unknown'}")
    return cleaned


def _extract_pdf_text(raw_bytes: bytes) -> str | None:
    if not raw_bytes.startswith(b"%PDF-"):
        raise DomainValidationError("Invalid PDF attachment: missing %PDF- header.")
    try:
        with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf_doc:
            pages = [(page.extract_text() or "").strip() for page in pdf_doc.pages]
    except Exception as exc:
        raise DomainValidationError("Unable to parse PDF attachment.") from exc
    non_empty = [text for text in pages if text]
    return "\n\n".join(non_empty) if non_empty else None


def _encode_webp(image: Image.Image) -> bytes:
    target = image
    if target.mode not in {"RGB", "RGBA"}:
        target = target.convert("RGBA" if "A" in target.getbands() else "RGB")
    output = io.BytesIO()
    target.save(output, format="WEBP", quality=WEBP_QUALITY)
    return output.getvalue()


def _normalize_image(raw_bytes: bytes, original_mime: str) -> tuple[bytes, str]:
    try:
        with Image.open(io.BytesIO(raw_bytes)) as opened:
            transposed = ImageOps.exif_transpose(opened)
            transposed.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION))
            webp_bytes = _encode_webp(transposed)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise DomainValidationError("Unable to decode image attachment.") from exc

    if len(webp_bytes) < len(raw_bytes):
        return webp_bytes, "image/webp"
    return raw_bytes, original_mime


def normalize_attachment(
    filename: str,
    mime_type: str | None,
    raw_bytes: bytes,
) -> NormalizedAttachment:
    """Enforce 15 MB limit, normalize images/PDFs, and compute sha256 digest."""
    if not raw_bytes:
        raise DomainValidationError("Uploaded attachment must not be empty.")
    if len(raw_bytes) > MAX_ATTACHMENT_BYTES:
        raise DomainPayloadTooLargeError("Attachment exceeds maximum size of 15 MB.")

    safe_name = sanitize_filename(filename)
    validated_mime = normalize_mime_type(mime_type)

    if validated_mime == "application/pdf":
        extracted_text = _extract_pdf_text(raw_bytes)
        stored_bytes, stored_mime = raw_bytes, validated_mime
    else:
        stored_bytes, stored_mime = _normalize_image(raw_bytes, validated_mime)
        extracted_text = None

    digest = hashlib.sha256(stored_bytes).hexdigest()
    return NormalizedAttachment(
        filename=safe_name,
        mime_type=stored_mime,
        size_bytes=len(stored_bytes),
        sha256=digest,
        content_bytes=stored_bytes,
        extracted_text=extracted_text,
    )


def _parse_int_bound(raw: str, total_size: int) -> int:
    if not raw.isdigit():
        raise DomainRangeNotSatisfiableError("Invalid byte range boundary.", total_size)
    return int(raw)


def parse_byte_range(range_header: str, total_size: int) -> tuple[int, int]:
    """Parse RFC 9110 single byte-range header into inclusive (start, end) offsets."""
    if total_size <= 0:
        raise DomainRangeNotSatisfiableError("Empty resource cannot satisfy byte range.", total_size)
    cleaned = range_header.strip()
    if not cleaned.lower().startswith("bytes="):
        raise DomainRangeNotSatisfiableError("Unsupported Range unit.", total_size)
    spec = cleaned[6:].strip()
    if not spec or "," in spec or "-" not in spec:
        raise DomainRangeNotSatisfiableError("Multi-range or malformed Range header.", total_size)

    start_raw, end_raw = spec.split("-", 1)
    start_raw, end_raw = start_raw.strip(), end_raw.strip()

    if not start_raw:
        if not end_raw:
            raise DomainRangeNotSatisfiableError("Empty byte range.", total_size)
        suffix = _parse_int_bound(end_raw, total_size)
        if suffix <= 0:
            raise DomainRangeNotSatisfiableError("Suffix range must be positive.", total_size)
        start = max(0, total_size - suffix)
        return start, total_size - 1

    start = _parse_int_bound(start_raw, total_size)
    if start >= total_size:
        raise DomainRangeNotSatisfiableError("Range start exceeds resource size.", total_size)
    if not end_raw:
        return start, total_size - 1

    end = min(_parse_int_bound(end_raw, total_size), total_size - 1)
    if end < start:
        raise DomainRangeNotSatisfiableError("Range end precedes range start.", total_size)
    return start, end
