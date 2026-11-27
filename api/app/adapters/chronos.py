"""HTTP client adapter for Chronos travel mode overlays and anchor commitments."""

from datetime import date
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from app.domain.errors import DomainUpstreamError

CHRONOS_TIMEOUT_SECONDS = 5.0
ChronosOverlayMode = Literal["suppress_all_grid_blocks", "keep_work_blocks"]
ChronosNudgeMode = Literal["none", "boundary"]


class ChronosTravelModeUpsert(BaseModel):
    """Payload for Chronos POST /schedule/travel-mode."""

    model_config = ConfigDict(frozen=True)

    external_ref: str
    label: str
    start_date: date | None = None
    end_date: date | None = None
    mode: ChronosOverlayMode
    active: bool


class ChronosTravelModeResponse(BaseModel):
    """Response returned by Chronos POST /schedule/travel-mode."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    id: int | None = None
    external_ref: str
    label: str
    start_date: date | None = None
    end_date: date | None = None
    mode: str
    active: bool


class ChronosCommitmentRead(BaseModel):
    """Travel commitment record returned by Chronos /commitments."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    id: int | str
    external_ref: str | None = None
    title: str | None = None
    target_date: date | None = None
    start_minute: int | None = None
    end_minute: int | None = None
    source: str | None = None


class ChronosCommitmentUpsert(BaseModel):
    """Payload for Chronos POST /commitments."""

    model_config = ConfigDict(frozen=True)

    title: str
    target_date: date
    start_minute: int
    end_minute: int
    all_day: bool = False
    source: Literal["travel"] = "travel"
    external_ref: str
    nudge_mode: ChronosNudgeMode
    urgent_quiet_bypass: bool
    tentative: bool = False
    notes: str | None = None
    upsert_by_external_ref: bool = True


class ChronosClientAdapter(Protocol):
    """Protocol for Chronos travel mode overlay and commitment synchronization."""

    def upsert_travel_mode(self, payload: ChronosTravelModeUpsert) -> ChronosTravelModeResponse:
        """Create, update, or deactivate a trip travel mode overlay in Chronos."""

    def list_travel_commitments(self, external_ref_prefix: str) -> list[ChronosCommitmentRead]:
        """List existing travel commitments matching an external_ref prefix."""

    def upsert_commitment(self, payload: ChronosCommitmentUpsert) -> ChronosCommitmentRead:
        """Upsert a single travel anchor commitment in Chronos."""

    def delete_commitment_by_ref(self, external_ref: str) -> None:
        """Delete a travel commitment in Chronos by external_ref."""


class HttpChronosClientAdapter:
    """Fail-loud HTTP adapter for Chronos API over internal Swarm overlay DNS."""

    def __init__(
        self,
        base_url: str,
        timeout: float = CHRONOS_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.strip().rstrip("/")
        self._timeout = timeout
        self._transport = transport

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json_body: dict[str, object] | None = None,
        expect_empty: bool = False,
    ) -> object:
        if not self._base_url:
            raise DomainUpstreamError("Chronos API URL is not configured.")
        url = f"{self._base_url}{path}"
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.request(method, url, params=params, json=json_body)
                response.raise_for_status()
                if expect_empty or response.status_code == 204 or not response.content:
                    return None
                return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise DomainUpstreamError(f"Chronos request failed ({method} {path}): {exc}") from exc

    def upsert_travel_mode(self, payload: ChronosTravelModeUpsert) -> ChronosTravelModeResponse:
        """Upsert or deactivate a trip travel mode overlay in Chronos."""
        raw = self._request_json(
            "POST",
            "/schedule/travel-mode",
            json_body=payload.model_dump(mode="json"),
        )
        try:
            return ChronosTravelModeResponse.model_validate(raw)
        except ValidationError as exc:
            raise DomainUpstreamError(
                f"Chronos /schedule/travel-mode payload invalid: {exc}"
            ) from exc

    def list_travel_commitments(self, external_ref_prefix: str) -> list[ChronosCommitmentRead]:
        """List existing travel commitments matching external_ref_prefix."""
        raw = self._request_json(
            "GET",
            "/commitments",
            params={"source": "travel", "external_ref_prefix": external_ref_prefix},
        )
        if not isinstance(raw, list):
            raise DomainUpstreamError("Chronos /commitments returned non-list payload.")
        try:
            return [ChronosCommitmentRead.model_validate(item) for item in raw]
        except ValidationError as exc:
            raise DomainUpstreamError(f"Chronos /commitments payload invalid: {exc}") from exc

    def upsert_commitment(self, payload: ChronosCommitmentUpsert) -> ChronosCommitmentRead:
        """Upsert a single travel anchor commitment in Chronos."""
        raw = self._request_json(
            "POST",
            "/commitments",
            json_body=payload.model_dump(mode="json"),
        )
        try:
            return ChronosCommitmentRead.model_validate(raw)
        except ValidationError as exc:
            raise DomainUpstreamError(f"Chronos POST /commitments payload invalid: {exc}") from exc

    def delete_commitment_by_ref(self, external_ref: str) -> None:
        """Delete a travel commitment by external_ref in Chronos."""
        self._request_json(
            "DELETE",
            "/commitments/by-ref",
            params={"source": "travel", "external_ref": external_ref},
            expect_empty=True,
        )
