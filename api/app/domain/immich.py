"""Pure domain grouping for private Immich trip photos."""

from collections.abc import Sequence
from datetime import date
from typing import Literal, Protocol
import uuid

from app.adapters.immich import ImmichAssetRecord
from app.schemas.immich import (
    ImmichDayPhotosRead,
    ImmichPhotoItemRead,
    TripPhotosResponseRead,
)


class DayRecordLike(Protocol):
    """Structural contract for a Trip Day record."""

    id: uuid.UUID
    date: date


def _build_photo_item(
    trip_id: uuid.UUID,
    asset: ImmichAssetRecord,
    local_date: date | None,
    domain_name: str,
) -> ImmichPhotoItemRead:
    cleaned_domain = domain_name.strip()
    web_url = f"https://photos.{cleaned_domain}/photos/{asset.asset_id}" if cleaned_domain else None
    return ImmichPhotoItemRead(
        asset_id=asset.asset_id,
        original_filename=asset.original_filename,
        captured_at=asset.captured_at,
        local_date=local_date,
        thumbnail_url=f"/api/trips/{trip_id}/photos/{asset.asset_id}/thumbnail",
        web_url=web_url,
        thumbhash=asset.thumbhash,
    )


def _resolve_asset_date(asset: ImmichAssetRecord) -> date | None:
    if asset.local_date is not None:
        return asset.local_date
    if asset.captured_at is not None:
        return asset.captured_at.date()
    return None


def _within_date_range(
    candidate: date | None,
    start_date: date | None,
    end_date: date | None,
) -> bool:
    if candidate is None or start_date is None or end_date is None:
        return False
    return start_date <= candidate <= end_date


def group_immich_photos_by_day(
    trip_id: uuid.UUID,
    assets: Sequence[ImmichAssetRecord],
    trip_days: Sequence[DayRecordLike],
    start_date: date | None,
    end_date: date | None,
    domain_name: str,
    source: Literal["album", "date_range"],
) -> TripPhotosResponseRead:
    """Group Immich assets into chronological Day buckets and ungrouped album photos."""
    sorted_days = sorted(trip_days, key=lambda day: day.date)
    day_by_date: dict[date, DayRecordLike] = {day.date: day for day in sorted_days}
    day_buckets: dict[date, list[ImmichPhotoItemRead]] = {day.date: [] for day in sorted_days}
    ungrouped: list[ImmichPhotoItemRead] = []

    for asset in assets:
        asset_date = _resolve_asset_date(asset)
        if source == "date_range" and not _within_date_range(asset_date, start_date, end_date):
            continue
        item = _build_photo_item(trip_id, asset, asset_date, domain_name)
        if asset_date is not None and asset_date in day_by_date:
            day_buckets[asset_date].append(item)
        elif source == "album":
            ungrouped.append(item)
        elif asset_date is not None:
            ungrouped.append(item)

    days_out = [
        ImmichDayPhotosRead(day_id=day.id, date=day.date, photos=day_buckets[day.date])
        for day in sorted_days
        if day_buckets[day.date]
    ]
    total_photos = sum(len(entry.photos) for entry in days_out) + len(ungrouped)
    return TripPhotosResponseRead(
        trip_id=trip_id,
        status="available",
        source=source,
        message=None,
        total_photos=total_photos,
        days=days_out,
        ungrouped_photos=ungrouped,
    )
