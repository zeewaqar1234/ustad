"""V0: profile.level_band is NULL until the placement test is taken

Revision ID: a0c1v2zero01
Revises: 165b7859bd8a
Create Date: 2026-10-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a0c1v2zero01'
down_revision: Union[str, Sequence[str], None] = '165b7859bd8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('profile') as batch:
        batch.alter_column('level_band', existing_type=sa.String(length=20), nullable=True)
    # The old default "B1.1" was an assumption: clear it where no placement result backs it.
    op.execute(
        "UPDATE profile SET level_band = NULL "
        "WHERE NOT EXISTS (SELECT 1 FROM placement_result)"
    )


def downgrade() -> None:
    op.execute("UPDATE profile SET level_band = 'B1.1' WHERE level_band IS NULL")
    with op.batch_alter_table('profile') as batch:
        batch.alter_column('level_band', existing_type=sa.String(length=20), nullable=False)
