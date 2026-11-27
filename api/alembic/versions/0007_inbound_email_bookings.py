"""Allow nullable attachment trip_id and store raw inbound email metadata on bookings.

Revision ID: 0007_inbound_email_bookings
Revises: 0006_share_tokens
Create Date: 2026-11-27 18:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0007_inbound_email_bookings"
down_revision: Union[str, None] = "0006_share_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Allow unassigned inbound attachments and add raw_email_payload JSONB column."""
    op.alter_column(
        "attachments",
        "trip_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.add_column(
        "bookings",
        sa.Column("raw_email_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    """Drop raw_email_payload and restore non-nullable attachments.trip_id."""
    op.drop_column("bookings", "raw_email_payload")
    op.execute("DELETE FROM attachments WHERE trip_id IS NULL")
    op.alter_column(
        "attachments",
        "trip_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
