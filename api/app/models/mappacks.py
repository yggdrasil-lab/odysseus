"""SQLAlchemy ORM model for per-leg offline PMTiles map packs."""

from datetime import datetime, timezone
import uuid

from sqlalchemy import DateTime, Double, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MapPack(Base):
    """Extracted .pmtiles regional map pack stored on disk and indexed in PostgreSQL."""

    __tablename__ = "map_packs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    leg_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("legs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="ready")
    bbox_west: Mapped[float] = mapped_column(Double, nullable=False)
    bbox_south: Mapped[float] = mapped_column(Double, nullable=False)
    bbox_east: Mapped[float] = mapped_column(Double, nullable=False)
    bbox_north: Mapped[float] = mapped_column(Double, nullable=False)
    max_zoom: Mapped[int] = mapped_column(Integer, nullable=False, server_default="14")
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=text("now()"),
    )
