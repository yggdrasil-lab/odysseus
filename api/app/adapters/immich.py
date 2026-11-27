"""HTTP client adapter for Immich v3.4.2 private photo metadata and thumbnails."""

from datetime import date, datetime, timedelta
import re
from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ConfigDict

from app.domain.errors import (
    DomainNotFoundError,
    DomainUpstreamError,
    DomainValidationError,
)

IMMICH_TIMEOUT = httpx.Timeout(3.0, connect=2.0)
IMMICH_MAX_SEARCH_SIZE = 250
IMMICH_OFFLINE_MESSAGE = "Immich offline (Muspelheim asleep)"
ASSET_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]+$")


def normalize_immich_api_base(base_url: str) -> str:
    """Normalize an Immich base URL so it ends with /api when configured."""
    cleaned = base_url.strip().rstrip("/")
    if not cleaned:
        return ""
    if cleaned.endswith("/api"):
        return cleaned
    return f"{cleaned}/api"


def validate_immich_asset_id(asset_id: str) -> str:
    """Validate an Immich asset ID against strict alphanumeric/hyphen characters."""
    cleaned = asset_id.strip()
    if not cleaned or not ASSET_ID_PATTERN.fullmatch(cleaned):
        raise DomainValidationError("Invalid Immich asset ID.")
    return cleaned


class ImmichAssetRecord(BaseModel):
    """Normalized Immich photo asset metadata record."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    asset_id: str
    original_filename: str | None = None
    captured_at: datetime | None = None
    local_date: date | None = None
    mime_type: str | None = None
    thumbhash: str | None = None


class ImmichThumbnailPayload(BaseModel):
    """Binary thumbnail payload fetched from Immich."""

    model_config = ConfigDict(frozen=True)

    content_bytes: bytes
    media_type: str


class ImmichClientAdapter(Protocol):
    """Protocol for private Immich photo metadata search and thumbnail proxy."""

    def search_album_photos(self, album_id: str, limit: int = 250) -> list[ImmichAssetRecord]:
        """Search IMAGE assets belonging to an Immich album via POST /search/metadata."""

    def search_date_range_photos(
        self,
        start_date: date,
        end_date: date,
        limit: int = 250,
    ) -> list[ImmichAssetRecord]:
        """Search IMAGE assets taken across a padded calendar date range."""

    def fetch_thumbnail(self, asset_id: str) -> ImmichThumbnailPayload:
        """Fetch raw thumbnail bytes for a validated Immich asset ID."""


def _parse_iso_datetime(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        return datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        return None


def _extract_dates(item: dict[str, Any]) -> tuple[date | None, datetime | None]:
    exif = item.get("exifInfo") if isinstance(item.get("exifInfo"), dict) else {}
    candidates = (
        item.get("localDateTime"),
        exif.get("dateTimeOriginal"),
        item.get("fileCreatedAt"),
    )
    local_date: date | None = None
    captured_at: datetime | None = None
    for raw in candidates:
        parsed = _parse_iso_datetime(raw)
        if parsed is None:
            continue
        if captured_at is None:
            captured_at = parsed
        if local_date is None:
            local_date = parsed.date()
    return local_date, captured_at


def _parse_asset_item(item: object) -> ImmichAssetRecord | None:
    if not isinstance(item, dict):
        return None
    raw_id = item.get("id")
    if not isinstance(raw_id, str) or not ASSET_ID_PATTERN.fullmatch(raw_id.strip()):
        return None
    local_date, captured_at = _extract_dates(item)
    filename = item.get("originalFileName")
    mime_type = item.get("originalMimeType")
    thumbhash = item.get("thumbhash")
    return ImmichAssetRecord(
        asset_id=raw_id.strip(),
        original_filename=filename if isinstance(filename, str) else None,
        captured_at=captured_at,
        local_date=local_date,
        mime_type=mime_type if isinstance(mime_type, str) else None,
        thumbhash=thumbhash if isinstance(thumbhash, str) else None,
    )


class HttpImmichClientAdapter:
    """Fail-loud HTTP adapter for Immich v3.4.2 over internal Swarm overlay DNS."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: httpx.Timeout = IMMICH_TIMEOUT,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._api_base = normalize_immich_api_base(base_url)
        self._api_key = api_key.strip()
        self._timeout = timeout
        self._transport = transport

    @property
    def timeout(self) -> httpx.Timeout:
        """Return configured HTTP timeout policy."""
        return self._timeout

    def _require_configured(self) -> None:
        if not self._api_base or not self._api_key:
            raise DomainUpstreamError(IMMICH_OFFLINE_MESSAGE)

    def _post_search(self, payload: dict[str, Any]) -> list[ImmichAssetRecord]:
        self._require_configured()
        url = f"{self._api_base}/search/metadata"
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.post(
                    url,
                    headers={"x-api-key": self._api_key},
                    json=payload,
                )
                response.raise_for_status()
                raw = response.json()
        except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError, ValueError) as exc:
            raise DomainUpstreamError(IMMICH_OFFLINE_MESSAGE) from exc

        if not isinstance(raw, dict):
            raise DomainUpstreamError("Immich search response payload invalid.")
        assets_block = raw.get("assets")
        if not isinstance(assets_block, dict) or not isinstance(assets_block.get("items"), list):
            raise DomainUpstreamError("Immich search response missing assets.items.")

        records: list[ImmichAssetRecord] = []
        for entry in assets_block["items"]:
            parsed = _parse_asset_item(entry)
            if parsed is not None:
                records.append(parsed)
        return records

    def search_album_photos(self, album_id: str, limit: int = 250) -> list[ImmichAssetRecord]:
        """Search IMAGE assets linked to an Immich album via POST /search/metadata."""
        cleaned_album = album_id.strip()
        if not cleaned_album:
            return []
        bounded_size = min(max(limit, 1), IMMICH_MAX_SEARCH_SIZE)
        return self._post_search(
            {
                "albumIds": [cleaned_album],
                "type": "IMAGE",
                "size": bounded_size,
                "page": 1,
            }
        )

    def search_date_range_photos(
        self,
        start_date: date,
        end_date: date,
        limit: int = 250,
    ) -> list[ImmichAssetRecord]:
        """Search IMAGE assets across [start_date - 1d, end_date + 1d] UTC padding."""
        bounded_size = min(max(limit, 1), IMMICH_MAX_SEARCH_SIZE)
        taken_after = f"{(start_date - timedelta(days=1)).isoformat()}T00:00:00Z"
        taken_before = f"{(end_date + timedelta(days=1)).isoformat()}T23:59:59Z"
        return self._post_search(
            {
                "takenAfter": taken_after,
                "takenBefore": taken_before,
                "type": "IMAGE",
                "size": bounded_size,
                "page": 1,
            }
        )

    def fetch_thumbnail(self, asset_id: str) -> ImmichThumbnailPayload:
        """Fetch raw thumbnail bytes for a validated Immich asset ID."""
        cleaned_id = validate_immich_asset_id(asset_id)
        self._require_configured()
        url = f"{self._api_base}/assets/{cleaned_id}/thumbnail?size=thumbnail"
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.get(url, headers={"x-api-key": self._api_key})
                if response.status_code == 404:
                    raise DomainNotFoundError(f"Immich thumbnail '{cleaned_id}' not found.")
                response.raise_for_status()
        except DomainNotFoundError:
            raise
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise DomainNotFoundError(f"Immich thumbnail '{cleaned_id}' not found.") from exc
            raise DomainUpstreamError(IMMICH_OFFLINE_MESSAGE) from exc
        except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError) as exc:
            raise DomainUpstreamError(IMMICH_OFFLINE_MESSAGE) from exc

        raw_type = response.headers.get("content-type", "image/jpeg")
        media_type = raw_type.split(";")[0].strip() or "image/jpeg"
        return ImmichThumbnailPayload(content_bytes=response.content, media_type=media_type)
