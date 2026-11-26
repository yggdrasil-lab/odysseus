"""Bootstrap Odysseus Alembic baseline revision.

Revision ID: 0001_bootstrap
Revises:
Create Date: 2026-11-26 09:00:00.000000

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "0001_bootstrap"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Establish baseline Alembic migration head for Odysseus."""


def downgrade() -> None:
    """Revert baseline Alembic migration head."""
