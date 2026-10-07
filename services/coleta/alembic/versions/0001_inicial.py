"""Esquema inicial do sistema de coleta

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
        "registros",
        sa.Column("id", ID_GRANDE, primary_key=True, autoincrement=True),
        sa.Column("unidade_id", sa.Integer(), nullable=False),
        sa.Column("segundo", sa.Integer(), nullable=False),
        sa.Column("classe", sa.SmallInteger(), nullable=False),
    )
    op.create_index("ix_registros_unidade_segundo", "registros", ["unidade_id", "segundo", "id"])

    op.create_table(
        "checkpoints",
        sa.Column("id", ID_GRANDE, primary_key=True, autoincrement=True),
        sa.Column("unidade_id", sa.Integer(), nullable=False),
        sa.Column("segundo", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("cobertura", sa.Float(), nullable=False),
        sa.Column("contagens", sa.JSON(), nullable=False),
    )

    op.create_table(
        "extratos",
        sa.Column("unidade_id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("operacao_id", sa.String(64), nullable=False),
        sa.Column("participantes", sa.Integer(), nullable=False),
        sa.Column("total_registros", sa.Integer(), nullable=False),
        sa.Column("total_pacotes", sa.Integer(), nullable=False),
        sa.Column("contagens", sa.JSON(), nullable=False),
        sa.Column("hash", sa.String(64), nullable=False),
        sa.Column("manifesto", sa.JSON(), nullable=False),
    )

    op.create_table(
        "pacotes",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("unidade_id", sa.Integer(), nullable=False),
        sa.Column("lote", sa.Integer(), nullable=False),
        sa.Column("total_lotes", sa.Integer(), nullable=False),
        sa.Column("conteudo", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pendente"),
    )


def downgrade() -> None:
    op.drop_table("pacotes")
    op.drop_table("extratos")
    op.drop_table("checkpoints")
    op.drop_index("ix_registros_unidade_segundo", table_name="registros")
    op.drop_table("registros")
