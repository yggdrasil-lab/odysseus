"""Create places, route_estimates, and itinerary_items.place_id link.

Revision ID: 0004_places_routing
Revises: 0003_bookings_attachments
Create Date: 2026-11-27 10:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0004_places_routing"
down_revision: Union[str, None] = "0003_bookings_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_places_table() -> None:
    op.create_table(
        "places",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=250), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="other"),
        sa.Column("latitude", sa.Double(), nullable=False),
        sa.Column("longitude", sa.Double(), nullable=False),
        sa.Column("address", sa.String(length=400), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("external_map_url", sa.String(length=1000), nullable=True),
        sa.Column("google_place_id", sa.String(length=160), nullable=True),
        sa.Column("osm_id", sa.String(length=80), nullable=True),
        sa.Column("is_backlog", sa.Boolean(), nullable=False, server_default=sa.text("false")),
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
            name="fk_places_trip_id_trips",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_places_trip_id", "places", ["trip_id"])


def _alter_itinerary_items_add_place() -> None:
    op.add_column(
        "itinerary_items",
        sa.Column("place_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_itinerary_items_place_id_places",
        "itinerary_items",
        "places",
        ["place_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_itinerary_items_place_id", "itinerary_items", ["place_id"])


def _create_route_estimates_table() -> None:
    op.create_table(
        "route_estimates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_place_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_place_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("travel_mode", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("distance_meters", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("geometry_geojson", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "manual_override",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
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
            name="fk_route_estimates_trip_id_trips",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["day_id"],
            ["days.id"],
            name="fk_route_estimates_day_id_days",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["from_place_id"],
            ["places.id"],
            name="fk_route_estimates_from_place_id_places",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["to_place_id"],
            ["places.id"],
            name="fk_route_estimates_to_place_id_places",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "day_id",
            "from_place_id",
            "to_place_id",
            name="uq_route_estimates_day_from_to",
        ),
    )
    op.create_index("ix_route_estimates_trip_id", "route_estimates", ["trip_id"])
    op.create_index("ix_route_estimates_day_id", "route_estimates", ["day_id"])


def upgrade() -> None:
    """Create places, link itinerary_items.place_id, and create route_estimates."""
    _create_places_table()
    _alter_itinerary_items_add_place()
    _create_route_estimates_table()


def downgrade() -> None:
    """Drop route_estimates, itinerary_items.place_id, and places."""
    op.drop_index("ix_route_estimates_day_id", table_name="route_estimates")
    op.drop_index("ix_route_estimates_trip_id", table_name="route_estimates")
    op.drop_table("route_estimates")
    op.drop_index("ix_itinerary_items_place_id", table_name="itinerary_items")
    op.drop_constraint("fk_itinerary_items_place_id_places", "itinerary_items", type_="foreignkey")
    op.drop_column("itinerary_items", "place_id")
    op.drop_index("ix_places_trip_id", table_name="places")
    op.drop_table("places")
