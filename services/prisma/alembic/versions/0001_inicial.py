"""Esquema inicial do Prisma

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

ID_GRANDE = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "ajustes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("ativo", sa.Boolean(), nullable=False),
        sa.Column("item_alvo", sa.Integer(), nullable=True),
        sa.Column("percentual", sa.Float(), nullable=False),
        sa.Column("escopo", sa.String(16), nullable=False),
        sa.Column("unidades", sa.JSON(), nullable=False),
    )
    op.create_table(
        "passagens",
        sa.Column("id", ID_GRANDE, primary_key=True, autoincrement=True),
        sa.Column("registrado_em", sa.Float(), nullable=False),
        sa.Column("operacao_id", sa.String(64), nullable=True),
        sa.Column("pacote_id", sa.String(64), nullable=True),
        sa.Column("unidade_id", sa.Integer(), nullable=True),
        sa.Column("lote", sa.Integer(), nullable=True),
        sa.Column("decisao", sa.String(16), nullable=False),
        sa.Column("motivo", sa.String(120), nullable=True),
        sa.Column("item_alvo", sa.Integer(), nullable=True),
        sa.Column("percentual", sa.Float(), nullable=True),
        sa.Column("original", sa.JSON(), nullable=True),
        sa.Column("efetivo", sa.JSON(), nullable=True),
        sa.Column("movidos", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_passagens_pacote_id", "passagens", ["pacote_id"])


def downgrade() -> None:
    op.drop_index("ix_passagens_pacote_id", table_name="passagens")
    op.drop_table("passagens")
    op.drop_table("ajustes")
