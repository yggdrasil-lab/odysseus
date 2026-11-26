"""Create core trip, leg, day, itinerary, checklist, and note tables.

Revision ID: 0002_core_trip_domain
Revises: 0001_bootstrap
Create Date: 2026-11-27 08:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002_core_trip_domain"
down_revision: Union[str, None] = "0001_bootstrap"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_trips_and_legs() -> None:
    op.create_table(
        "trips",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="planning"),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column(
            "home_timezone",
            sa.String(length=64),
            nullable=False,
            server_default="Pacific/Auckland",
        ),
        sa.Column("budget_nzd", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("immich_album_id", sa.String(length=128), nullable=True),
        sa.Column("vault_note_path", sa.String(length=500), nullable=True),
        sa.Column(
            "chronos_sync_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "chronos_overlay_mode",
            sa.String(length=64),
            nullable=False,
            server_default="suppress_all_grid_blocks",
        ),
        sa.Column("summary", sa.Text(), nullable=True),
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
        sa.UniqueConstraint("slug", name="uq_trips_slug"),
    )
    op.create_index("ix_trips_slug", "trips", ["slug"], unique=True)

    op.create_table(
        "legs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("primary_city", sa.String(length=120), nullable=False),
        sa.Column("country_code", sa.String(length=16), nullable=True),
        sa.Column("base_timezone", sa.String(length=64), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("color", sa.String(length=32), nullable=False, server_default="#38bdf8"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
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
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_legs_trip_id", "legs", ["trip_id"])


def _create_days_and_itinerary() -> None:
    op.create_table(
        "days",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
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
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("trip_id", "date", name="uq_days_trip_id_date"),
    )
    op.create_index("ix_days_trip_id", "days", ["trip_id"])

    op.create_table(
        "itinerary_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=250), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="activity"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="idea"),
        sa.Column("start_local", sa.DateTime(timezone=False), nullable=True),
        sa.Column("start_tz", sa.String(length=64), nullable=True),
        sa.Column("end_local", sa.DateTime(timezone=False), nullable=True),
        sa.Column("end_tz", sa.String(length=64), nullable=True),
        sa.Column("start_utc", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_utc", sa.DateTime(timezone=True), nullable=True),
        sa.Column("place_label", sa.String(length=200), nullable=True),
        sa.Column(
            "sync_to_chronos",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
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
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["day_id"], ["days.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_itinerary_items_trip_id", "itinerary_items", ["trip_id"])
    op.create_index("ix_itinerary_items_day_id", "itinerary_items", ["day_id"])


def _create_checklists() -> None:
    op.create_table(
        "checklists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("list_type", sa.String(length=32), nullable=False, server_default="packing"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_checklists_trip_id", "checklists", ["trip_id"])

    op.create_table(
        "checklist_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("checklist_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leg_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("label", sa.String(length=250), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["checklist_id"], ["checklists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["leg_id"], ["legs.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_checklist_items_checklist_id", "checklist_items", ["checklist_id"])


def _create_travel_notes() -> None:
    op.create_table(
        "travel_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leg_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("day_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["leg_id"], ["legs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["day_id"], ["days.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_travel_notes_trip_id", "travel_notes", ["trip_id"])


def upgrade() -> None:
    """Create core Odysseus travel planning tables."""
    _create_trips_and_legs()
    _create_days_and_itinerary()
    _create_checklists()
    _create_travel_notes()


def downgrade() -> None:
    """Drop core Odysseus travel planning tables in reverse dependency order."""
    op.drop_index("ix_travel_notes_trip_id", table_name="travel_notes")
    op.drop_table("travel_notes")
    op.drop_index("ix_checklist_items_checklist_id", table_name="checklist_items")
    op.drop_table("checklist_items")
    op.drop_index("ix_checklists_trip_id", table_name="checklists")
    op.drop_table("checklists")
    op.drop_index("ix_itinerary_items_day_id", table_name="itinerary_items")
    op.drop_index("ix_itinerary_items_trip_id", table_name="itinerary_items")
    op.drop_table("itinerary_items")
    op.drop_index("ix_days_trip_id", table_name="days")
    op.drop_table("days")
    op.drop_index("ix_legs_trip_id", table_name="legs")
    op.drop_table("legs")
    op.drop_index("ix_trips_slug", table_name="trips")
    op.drop_table("trips")
