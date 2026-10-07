"""Ajustes dos agentes de IA (chave da OpenAI e modelos ativos)

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
    op.create_table(
        "ajustes_agentes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("chave", sa.String(256), nullable=True),
        sa.Column("ativos", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ajustes_agentes")
