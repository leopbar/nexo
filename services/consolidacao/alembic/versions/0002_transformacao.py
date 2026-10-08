"""Contagens efetivas e transformação do Prisma nos pacotes recebidos

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pacotes_recebidos", sa.Column("contagens_efetivas", sa.JSON(), nullable=True))
    op.add_column("pacotes_recebidos", sa.Column("transformacao", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("pacotes_recebidos", "transformacao")
    op.drop_column("pacotes_recebidos", "contagens_efetivas")
