"""Create share_tokens table for read-only companion trip sharing.

Revision ID: 0006_share_tokens
Revises: 0005_offline_mappacks
Create Date: 2026-11-27 14:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0006_share_tokens"
down_revision: Union[str, None] = "0005_offline_mappacks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create share_tokens table and indexes."""
    op.create_table(
        "share_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trip_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column(
            "include_pnrs",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "include_attachments",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "include_costs",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "include_checklists",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "include_private_notes",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
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
            name="fk_share_tokens_trip_id_trips",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_share_tokens_trip_id", "share_tokens", ["trip_id"])
    op.create_index("uq_share_tokens_token", "share_tokens", ["token"], unique=True)


def downgrade() -> None:
    """Drop share_tokens table and indexes."""
    op.drop_index("uq_share_tokens_token", table_name="share_tokens")
    op.drop_index("ix_share_tokens_trip_id", table_name="share_tokens")
    op.drop_table("share_tokens")
