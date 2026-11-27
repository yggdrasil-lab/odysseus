"""Create map_packs table for per-leg offline PMTiles archives.

Revision ID: 0005_offline_mappacks
Revises: 0004_places_routing
Create Date: 2026-11-27 11:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005_offline_mappacks"
down_revision: Union[str, None] = "0004_places_routing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create map_packs table and indexes."""
    op.create_table(
        "map_packs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leg_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ready"),
        sa.Column("bbox_west", sa.Double(), nullable=False),
        sa.Column("bbox_south", sa.Double(), nullable=False),
        sa.Column("bbox_east", sa.Double(), nullable=False),
        sa.Column("bbox_north", sa.Double(), nullable=False),
        sa.Column("max_zoom", sa.Integer(), nullable=False, server_default="14"),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
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
            name="fk_map_packs_trip_id_trips",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["leg_id"],
            ["legs.id"],
            name="fk_map_packs_leg_id_legs",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_map_packs_trip_id", "map_packs", ["trip_id"])
    op.create_index("ix_map_packs_leg_id", "map_packs", ["leg_id"])


def downgrade() -> None:
    """Drop map_packs table and indexes."""
    op.drop_index("ix_map_packs_leg_id", table_name="map_packs")
    op.drop_index("ix_map_packs_trip_id", table_name="map_packs")
    op.drop_table("map_packs")
