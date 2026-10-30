"""V2: exam_result.voided (soft delete for typos and duplicates)

Revision ID: d3v2void04
Revises: c2v2stand03
Create Date: 2026-10-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd3v2void04'
down_revision: Union[str, Sequence[str], None] = 'c2v2stand03'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('exam_result') as batch:
        batch.add_column(sa.Column('voided', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table('exam_result') as batch:
        batch.drop_column('voided')
