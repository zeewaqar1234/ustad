"""V2: exam_result (Zee's exam and practice-test results for the Stand box)

Revision ID: c2v2stand03
Revises: b1e7v1evid02
Create Date: 2026-10-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.db

revision: str = 'c2v2stand03'
down_revision: Union[str, Sequence[str], None] = 'b1e7v1evid02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'exam_result',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created', app.db.UTCDateTime(), nullable=False),
        sa.Column('taken', sa.Date(), nullable=False),
        sa.Column('level', sa.String(length=4), nullable=False),
        sa.Column('module', sa.String(length=12), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('teil', sa.Integer(), nullable=True),
        sa.Column('raw', sa.Float(), nullable=True),
        sa.Column('raw_max', sa.Float(), nullable=True),
        sa.Column('points', sa.Float(), nullable=False),
        sa.Column('points_max', sa.Float(), nullable=False),
        sa.Column('note', sa.Text(), nullable=False),
        sa.Column('meta_json', sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_exam_result_taken', 'exam_result', ['taken'])


def downgrade() -> None:
    op.drop_index('ix_exam_result_taken', table_name='exam_result')
    op.drop_table('exam_result')
