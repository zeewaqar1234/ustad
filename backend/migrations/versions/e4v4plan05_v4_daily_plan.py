"""V4: daily_plan (the planner's one row per day)

Revision ID: e4v4plan05
Revises: d3v2void04
Create Date: 2026-10-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.db

revision: str = 'e4v4plan05'
down_revision: Union[str, Sequence[str], None] = 'd3v2void04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'daily_plan',
        sa.Column('date', sa.Date(), primary_key=True),
        sa.Column('created', app.db.UTCDateTime(), nullable=False),
        sa.Column('plan_json', sa.JSON(), nullable=False),
        sa.Column('data_json', sa.JSON(), nullable=False),
        sa.Column('why', sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('daily_plan')
