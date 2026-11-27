"""Read-only HTTP client adapter for Plutus trip budget, transactions, and FX rates."""

from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.domain.errors import DomainUpstreamError

PLUTUS_TIMEOUT_SECONDS = 5.0


class PlutusFxRate(BaseModel):
    """Cached FX conversion rate to target currency returned by Plutus."""

    model_config = ConfigDict(frozen=True)

    rate: Decimal = Field(gt=0)
    rate_date: date | None = None
    source: str


class PlutusTransaction(BaseModel):
    """Read-only transaction item returned by Plutus GET /transactions."""

    model_config = ConfigDict(frozen=True)

    id: int | str
    transaction_date: date
    account_name: str
    amount: Decimal
    currency: str
    exchange_rate: Decimal | None = None
    merchant: str | None = None
    category: str | None = None
    raw_description: str | None = None
    tags: list[str] = Field(default_factory=list)


class PlutusTagCategorySummary(BaseModel):
    """Category spend breakdown entry inside a Plutus tag summary."""

    model_config = ConfigDict(frozen=True)

    category: str
    total_spend: Decimal
    transaction_count: int
    percentage: Decimal


class PlutusTagSummary(BaseModel):
    """Aggregated spend summary for a single Plutus tag."""

    model_config = ConfigDict(frozen=True)

    tag: str
    total_spend: Decimal
    transaction_count: int
    first_date: date | None = None
    last_date: date | None = None
    categories: list[PlutusTagCategorySummary] = Field(default_factory=list)


class PlutusClientAdapter(Protocol):
    """Protocol for read-only Plutus financial and FX queries."""

    def get_trip_transactions(self, tag: str) -> list[PlutusTransaction]:
        """Fetch settled transactions tagged for a trip."""

    def get_tag_summary(self, tag: str) -> PlutusTagSummary | None:
        """Fetch aggregate settled spend summary for a trip tag, or None if untagged."""

    def get_fx_rates(self, to_currency: str, currencies: Sequence[str]) -> dict[str, PlutusFxRate]:
        """Fetch cached FX conversion rates into to_currency for requested currencies."""


class HttpPlutusClientAdapter:
    """Strictly GET-only HTTP adapter for Plutus API with fail-loud error handling."""

    def __init__(
        self,
        base_url: str,
        timeout: float = PLUTUS_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.strip().rstrip("/")
        self._timeout = timeout
        self._transport = transport

    def _get_json(self, path: str, params: dict[str, str | int] | None = None) -> object:
        if not self._base_url:
            raise DomainUpstreamError("Plutus API URL is not configured.")
        url = f"{self._base_url}{path}"
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                response = client.get(url, params=params)
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise DomainUpstreamError(f"Plutus request failed ({path}): {exc}") from exc

    def get_trip_transactions(self, tag: str) -> list[PlutusTransaction]:
        """Fetch settled transactions matching trip tag from Plutus."""
        payload = self._get_json("/transactions", params={"tag": tag, "limit": 500})
        if not isinstance(payload, list):
            raise DomainUpstreamError("Plutus /transactions returned non-list payload.")
        try:
            return [PlutusTransaction.model_validate(item) for item in payload]
        except ValidationError as exc:
            raise DomainUpstreamError(f"Plutus /transactions payload invalid: {exc}") from exc

    def get_tag_summary(self, tag: str) -> PlutusTagSummary | None:
        """Fetch all-time tag summary and return the matching tag entry if present."""
        payload = self._get_json("/transactions/summary/tags", params={"period": "all"})
        raw_tags = payload.get("tags") if isinstance(payload, dict) else None
        if not isinstance(raw_tags, list):
            raise DomainUpstreamError("Plutus /transactions/summary/tags returned invalid payload.")
        try:
            summaries = [PlutusTagSummary.model_validate(item) for item in raw_tags]
        except ValidationError as exc:
            raise DomainUpstreamError(
                f"Plutus /transactions/summary/tags payload invalid: {exc}"
            ) from exc
        for summary in summaries:
            if summary.tag == tag:
                return summary
        return None

    def get_fx_rates(self, to_currency: str, currencies: Sequence[str]) -> dict[str, PlutusFxRate]:
        """Fetch FX rates into to_currency for requested source currencies."""
        target = to_currency.strip().upper()
        requested = sorted({code.strip().upper() for code in currencies if code and code.strip()})
        params: dict[str, str | int] = {"to_currency": target}
        if requested:
            params["currencies"] = ",".join(requested)
        payload = self._get_json("/fx/rates", params=params)
        raw_rates = payload.get("rates") if isinstance(payload, dict) else None
        if not isinstance(raw_rates, dict):
            raise DomainUpstreamError("Plutus /fx/rates returned invalid payload.")
        try:
            return {
                str(code).strip().upper(): PlutusFxRate.model_validate(rate_payload)
                for code, rate_payload in raw_rates.items()
            }
        except ValidationError as exc:
            raise DomainUpstreamError(f"Plutus /fx/rates payload invalid: {exc}") from exc
