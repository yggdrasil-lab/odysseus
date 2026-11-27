"""Pure deterministic extraction and trip date-matching for inbound travel emails."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
import re
from typing import Any, Protocol
import uuid

from app.schemas.bookings import BookingType
from app.schemas.integrations import InboundEmailWebhookPayload

MAX_TITLE_LEN = 250
MAX_PROVIDER_LEN = 160
MAX_EXCERPT_LEN = 2000

SUBJECT_PREFIX_RE = re.compile(r"^(?:(?:re|fwd|fw)\s*:\s*)+", re.IGNORECASE)
WHITESPACE_RE = re.compile(r"\s+")

BOOKING_TYPE_KEYWORDS: tuple[tuple[BookingType, tuple[str, ...]], ...] = (
    (
        "insurance",
        (
            "travel insurance",
            "policy number",
            "certificate of insurance",
            "world nomads",
            "allianz",
        ),
    ),
    (
        "flight",
        (
            "flight",
            "boarding pass",
            "e-ticket",
            "eticket",
            "airlines",
            "airways",
            "air new zealand",
            "qantas",
            "jetstar",
            "departure gate",
            "baggage",
            "pnr",
        ),
    ),
    (
        "lodging",
        (
            "hotel",
            "check-in",
            "check in",
            "check-out",
            "check out",
            "accommodation",
            "airbnb",
            "booking.com",
            "agoda",
            "hostel",
            "ryokan",
            "room night",
            "marriott",
            "hilton",
            "hyatt",
        ),
    ),
    (
        "transport",
        (
            "ferry",
            "rail",
            "train",
            "shinkansen",
            "jr pass",
            "shuttle",
            "car rental",
            "rental car",
            "interislander",
            "bluebridge",
            "coach",
        ),
    ),
    (
        "activity",
        (
            "tour",
            "museum",
            "admission",
            "excursion",
            "activity",
            "entry pass",
        ),
    ),
)

CONFIRMATION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(?i:confirmation(?:\s+code|\s+number|\s+ref(?:erence)?)?|"
        r"booking\s+(?:code|ref(?:erence)?|number)|"
        r"record\s+locator|pnr|itinerary\s+(?:ref(?:erence)?|number))"
        r"\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,15})\b"
    ),
    re.compile(r"(?i:reference(?:\s+code|\s+number)?)\s*[:#-]\s*([A-Z0-9][A-Z0-9-]{4,15})\b"),
)

CONFIRMATION_STOPWORDS = frozenset(
    {"NUMBER", "CONFIRM", "CONFIRMED", "BOOKING", "DETAILS", "TICKET", "RECEIPT", "TOTAL"}
)

GENERIC_SENDERS = frozenset(
    {"noreply", "no-reply", "donotreply", "do-not-reply", "bookings", "reservations", "support", "info"}
)

DISPLAY_FROM_RE = re.compile(r'^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$')
EMAIL_DOMAIN_RE = re.compile(r"@([A-Za-z0-9.-]+)")

COST_LINE_HINT_RE = re.compile(r"(?i)\b(?:total|amount|paid|price|fare|charge|balance)\b")
CURRENCY_BEFORE_AMOUNT_RE = re.compile(
    r"\b(NZD|AUD|USD|EUR|GBP|JPY|SGD|PHP|CAD|CHF)\s*\$?\s*"
    r"([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\b"
)
DOLLAR_WITH_CURRENCY_RE = re.compile(
    r"\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)"
    r"\s*(NZD|AUD|USD|SGD|CAD)\b"
)

MONTH_MAP: dict[str, int] = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

ISO_DATE_RE = re.compile(r"\b(20[2-3][0-9])-(0?[1-9]|1[0-2])-(0?[1-9]|[12][0-9]|3[01])\b")
SLASH_DATE_RE = re.compile(r"\b(0?[1-9]|[12][0-9]|3[01])/(0?[1-9]|1[0-2])/(20[2-3][0-9])\b")
DMY_MONTH_RE = re.compile(
    r"\b(0?[1-9]|[12][0-9]|3[01])\s+([A-Za-z]{3,9})\s+(20[2-3][0-9])\b"
)
MDY_MONTH_RE = re.compile(
    r"\b([A-Za-z]{3,9})\s+(0?[1-9]|[12][0-9]|3[01]),?\s+(20[2-3][0-9])\b"
)

ELIGIBLE_MATCH_STATUSES = frozenset({"planning", "booked", "active"})


class TripDateCandidate(Protocol):
    """Minimal Trip shape needed for deterministic date matching."""

    id: uuid.UUID
    status: str
    start_date: date | None
    end_date: date | None


@dataclass(frozen=True)
class ExtractedBookingFields:
    """Deterministic booking metadata extracted from an inbound email."""

    title: str
    booking_type: BookingType
    provider: str | None
    confirmation_code: str | None
    quoted_cost: Decimal | None
    quoted_currency: str | None
    extracted_dates: tuple[date, ...]


def sanitize_email_title(subject: str | None) -> str:
    """Strip reply/forward prefixes, collapse whitespace, and bound to 250 chars."""
    raw = (subject or "").strip()
    stripped = SUBJECT_PREFIX_RE.sub("", raw)
    collapsed = WHITESPACE_RE.sub(" ", stripped).strip()
    if not collapsed:
        return "Inbound Travel Booking"
    return collapsed[:MAX_TITLE_LEN]


def classify_booking_type(subject: str, body_text: str) -> BookingType:
    """Classify email text into a canonical Odysseus BookingType using table-driven keywords."""
    haystack = f"{subject}\n{body_text}".lower()
    for booking_type, keywords in BOOKING_TYPE_KEYWORDS:
        if any(keyword in haystack for keyword in keywords):
            return booking_type
    return "activity"


def extract_confirmation_code(text: str) -> str | None:
    """Extract an uppercase booking confirmation/PNR code when preceded by an explicit label."""
    for pattern in CONFIRMATION_PATTERNS:
        for match in pattern.finditer(text):
            candidate = match.group(1).strip("-")
            if candidate in CONFIRMATION_STOPWORDS:
                continue
            if len(candidate) >= 5:
                return candidate[:120]
    return None


def extract_provider(from_address: str | None, subject: str, body_text: str) -> str | None:
    """Extract a clean provider label from sender display name or domain."""
    if from_address:
        display_match = DISPLAY_FROM_RE.match(from_address)
        if display_match:
            display = WHITESPACE_RE.sub(" ", display_match.group(1)).strip()
            if display and display.lower() not in GENERIC_SENDERS:
                return display[:MAX_PROVIDER_LEN]
        domain_match = EMAIL_DOMAIN_RE.search(from_address)
        if domain_match:
            stem = domain_match.group(1).split(".")[0].replace("-", " ").strip()
            if stem and stem.lower() not in GENERIC_SENDERS:
                return stem.title()[:MAX_PROVIDER_LEN]
    _ = (subject, body_text)
    return None


def _parse_decimal(raw_amount: str) -> Decimal | None:
    cleaned = raw_amount.replace(",", "").strip()
    try:
        value = Decimal(cleaned).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None
    return value if value >= Decimal("0.00") else None


def _find_cost_in_segment(segment: str) -> tuple[Decimal | None, str | None]:
    match = CURRENCY_BEFORE_AMOUNT_RE.search(segment)
    if match:
        amount = _parse_decimal(match.group(2))
        if amount is not None:
            return amount, match.group(1).upper()
    dollar_match = DOLLAR_WITH_CURRENCY_RE.search(segment)
    if dollar_match:
        amount = _parse_decimal(dollar_match.group(1))
        if amount is not None:
            return amount, dollar_match.group(2).upper()
    return None, None


def extract_quoted_cost(text: str) -> tuple[Decimal | None, str | None]:
    """Extract quoted cost and ISO currency code, preferring lines with total/fare hints."""
    lines = text.splitlines()
    for line in lines:
        if COST_LINE_HINT_RE.search(line):
            amount, currency = _find_cost_in_segment(line)
            if amount is not None and currency is not None:
                return amount, currency
    return _find_cost_in_segment(text)


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def extract_travel_dates(text: str) -> list[date]:
    """Extract sorted unique calendar dates from ISO, slash, and month-name formats."""
    found: set[date] = set()
    for y_str, m_str, d_str in ISO_DATE_RE.findall(text):
        parsed = _safe_date(int(y_str), int(m_str), int(d_str))
        if parsed is not None:
            found.add(parsed)
    for d_str, m_str, y_str in SLASH_DATE_RE.findall(text):
        parsed = _safe_date(int(y_str), int(m_str), int(d_str))
        if parsed is not None:
            found.add(parsed)
    for d_str, mon_str, y_str in DMY_MONTH_RE.findall(text):
        month = MONTH_MAP.get(mon_str.lower())
        if month is not None:
            parsed = _safe_date(int(y_str), month, int(d_str))
            if parsed is not None:
                found.add(parsed)
    for mon_str, d_str, y_str in MDY_MONTH_RE.findall(text):
        month = MONTH_MAP.get(mon_str.lower())
        if month is not None:
            parsed = _safe_date(int(y_str), month, int(d_str))
            if parsed is not None:
                found.add(parsed)
    return sorted(found)


def match_trip_by_dates(
    trips: Sequence[TripDateCandidate],
    extracted_dates: Sequence[date],
) -> tuple[uuid.UUID | None, str]:
    """Match extracted dates against dated trips; return None on zero or ambiguous matches."""
    if not extracted_dates:
        return None, "no_dates_extracted"

    candidates = [
        trip
        for trip in trips
        if trip.status in ELIGIBLE_MATCH_STATUSES
        and trip.start_date is not None
        and trip.end_date is not None
    ]
    exact = [
        trip
        for trip in candidates
        if any(trip.start_date <= day <= trip.end_date for day in extracted_dates)  # type: ignore[operator]
    ]
    if len(exact) == 1:
        return exact[0].id, "exact_date_match"
    if len(exact) > 1:
        return None, "ambiguous_exact_matches"

    margin = timedelta(days=1)
    near = [
        trip
        for trip in candidates
        if any(
            (trip.start_date - margin) <= day <= (trip.end_date + margin)  # type: ignore[operator]
            for day in extracted_dates
        )
    ]
    if len(near) == 1:
        return near[0].id, "margin_date_match"
    if len(near) > 1:
        return None, "ambiguous_margin_matches"
    return None, "no_matching_trip"


def extract_booking_fields(
    payload: InboundEmailWebhookPayload,
    extracted_pdf_texts: Sequence[str],
) -> ExtractedBookingFields:
    """Combine email body and extracted PDF text to derive deterministic booking fields."""
    body_parts = [
        part.strip()
        for part in (
            payload.text_body or "",
            payload.raw_excerpt or "",
            payload.html_excerpt or "",
            *extracted_pdf_texts,
        )
        if part and part.strip()
    ]
    combined_body = "\n\n".join(body_parts)
    full_text = f"{payload.subject}\n\n{combined_body}".strip()
    quoted_cost, quoted_currency = extract_quoted_cost(full_text)
    return ExtractedBookingFields(
        title=sanitize_email_title(payload.subject),
        booking_type=classify_booking_type(payload.subject, combined_body),
        provider=extract_provider(payload.from_address, payload.subject, combined_body),
        confirmation_code=extract_confirmation_code(full_text),
        quoted_cost=quoted_cost,
        quoted_currency=quoted_currency,
        extracted_dates=tuple(extract_travel_dates(full_text)),
    )


def build_raw_email_snapshot(
    payload: InboundEmailWebhookPayload,
    matched_trip_reason: str,
    skipped_attachments: Sequence[str],
) -> dict[str, Any]:
    """Build compact JSONB metadata snapshot without persisting raw base64 attachment payloads."""
    excerpt_source = payload.text_body or payload.raw_excerpt or payload.html_excerpt or ""
    excerpt = WHITESPACE_RE.sub(" ", excerpt_source).strip()[:MAX_EXCERPT_LEN]
    return {
        "email_id": payload.email_id,
        "message_id": payload.message_id.strip(),
        "route_target": payload.route_target,
        "from_address": payload.from_address,
        "to_address": payload.to_address,
        "subject": payload.subject,
        "received_at": payload.received_at,
        "jev_verdict": payload.jev_verdict,
        "matched_trip_reason": matched_trip_reason,
        "skipped_attachments": list(skipped_attachments),
        "attachment_filenames": [att.filename for att in payload.attachments],
        "excerpt": excerpt or None,
    }
