"""V1: evidence_event, activity_log, day_log.other_done; drop the unused session table

Revision ID: b1e7v1evid02
Revises: a0c1v2zero01
Create Date: 2026-10-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.orm import Session

import app.db

revision: str = 'b1e7v1evid02'
down_revision: Union[str, Sequence[str], None] = 'a0c1v2zero01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'evidence_event',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ts', app.db.UTCDateTime(), nullable=False),
        sa.Column('skill', sa.String(length=12), nullable=False),
        sa.Column('source', sa.String(length=16), nullable=False),
        sa.Column('source_ref', sa.String(length=60), nullable=False),
        sa.Column('pattern_code', sa.String(length=40), nullable=True),
        sa.Column('tag', sa.String(length=30), nullable=True),
        sa.Column('outcome', sa.String(length=8), nullable=False),
        sa.Column('severity', sa.Integer(), nullable=True),
        sa.Column('orig', sa.Text(), nullable=False),
        sa.Column('fix', sa.Text(), nullable=True),
        sa.Column('meta_json', sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_evidence_tag_ts', 'evidence_event', ['tag', 'ts'])
    op.create_index('ix_evidence_pattern_ts', 'evidence_event', ['pattern_code', 'ts'])
    op.create_index('ix_evidence_skill_ts', 'evidence_event', ['skill', 'ts'])
    op.create_table(
        'activity_log',
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('skill', sa.String(length=12), nullable=False),
        sa.Column('seconds', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('date', 'skill'),
    )
    with op.batch_alter_table('day_log') as batch:
        batch.add_column(sa.Column('other_done', sa.Boolean(), nullable=False, server_default=sa.false()))

    from app.services import backfill

    db = Session(bind=op.get_bind())
    backfill.run(db)
    db.flush()

    # Nothing reads the `session` table (L12): drop it and attempt.session_id.
    with op.batch_alter_table('attempt') as batch:
        batch.drop_column('session_id')
    # Nothing writes it; keep it if a hand-made row exists (never delete user data).
    if op.get_bind().execute(sa.text("SELECT COUNT(*) FROM session")).scalar() == 0:
        op.drop_table('session')


def downgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table('session'):
        op.create_table(
        'session',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('started', app.db.UTCDateTime(), nullable=False),
        sa.Column('ended', app.db.UTCDateTime(), nullable=True),
        sa.Column('active_s', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('attempt') as batch:
        batch.add_column(sa.Column('session_id', sa.Integer(), nullable=True))
        batch.create_foreign_key('fk_attempt_session', 'session', ['session_id'], ['id'])
    with op.batch_alter_table('day_log') as batch:
        batch.drop_column('other_done')
    op.drop_table('activity_log')
    op.drop_index('ix_evidence_skill_ts', table_name='evidence_event')
    op.drop_index('ix_evidence_pattern_ts', table_name='evidence_event')
    op.drop_index('ix_evidence_tag_ts', table_name='evidence_event')
    op.drop_table('evidence_event')
