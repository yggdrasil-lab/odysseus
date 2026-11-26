"""Create bookings, booking_segments, and attachments tables.

Revision ID: 0003_bookings_attachments
Revises: 0002_core_trip_domain
Create Date: 2026-11-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_bookings_attachments"
down_revision: Union[str, None] = "0002_core_trip_domain"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_bookings_table() -> None:
    op.create_table(
        "bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("booking_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("title", sa.String(length=250), nullable=False),
        sa.Column("provider", sa.String(length=160), nullable=True),
        sa.Column("confirmation_code", sa.String(length=120), nullable=True),
        sa.Column("quoted_cost", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("quoted_currency", sa.String(length=8), nullable=True),
        sa.Column("source_reference", sa.String(length=255), nullable=True),
        sa.Column("source_email_message_id", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["trip_id"],
            ["trips.id"],
            name="fk_bookings_trip_id_trips",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_bookings_trip_id", "bookings", ["trip_id"])
    op.create_index(
        "uq_bookings_source_email_message_id",
        "bookings",
        ["source_email_message_id"],
        unique=True,
        postgresql_where=sa.text("source_email_message_id IS NOT NULL"),
    )


def _create_booking_segments_table() -> None:
    op.create_table(
        "booking_segments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("segment_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("carrier", sa.String(length=120), nullable=True),
        sa.Column("flight_or_service_number", sa.String(length=64), nullable=True),
        sa.Column("origin_label", sa.String(length=200), nullable=False),
        sa.Column("origin_code", sa.String(length=16), nullable=True),
        sa.Column("destination_label", sa.String(length=200), nullable=False),
        sa.Column("destination_code", sa.String(length=16), nullable=True),
        sa.Column("departure_local", sa.DateTime(timezone=False), nullable=False),
        sa.Column("departure_tz", sa.String(length=64), nullable=False),
        sa.Column("arrival_local", sa.DateTime(timezone=False), nullable=False),
        sa.Column("arrival_tz", sa.String(length=64), nullable=False),
        sa.Column("departure_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("arrival_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("seat_or_cabin", sa.String(length=64), nullable=True),
        sa.Column("terminal_gate", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_booking_segments_booking_id_bookings",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_booking_segments_booking_id", "booking_segments", ["booking_id"])


def _create_attachments_table() -> None:
    op.create_table(
        "attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("content_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["trip_id"],
            ["trips.id"],
            name="fk_attachments_trip_id_trips",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_attachments_booking_id_bookings",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_attachments_trip_id", "attachments", ["trip_id"])
    op.create_index("ix_attachments_booking_id", "attachments", ["booking_id"])


def upgrade() -> None:
    """Create bookings, booking_segments, and attachments tables."""
    _create_bookings_table()
    _create_booking_segments_table()
    _create_attachments_table()


def downgrade() -> None:
    """Drop bookings, booking_segments, and attachments tables."""
    op.drop_index("ix_attachments_booking_id", table_name="attachments")
    op.drop_index("ix_attachments_trip_id", table_name="attachments")
    op.drop_table("attachments")
    op.drop_index("ix_booking_segments_booking_id", table_name="booking_segments")
    op.drop_table("booking_segments")
    op.drop_index("uq_bookings_source_email_message_id", table_name="bookings")
    op.drop_index("ix_bookings_trip_id", table_name="bookings")
    op.drop_table("bookings")
