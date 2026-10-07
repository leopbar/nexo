"""Esquema inicial do sistema de consolidação

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
        "manifestos",
        sa.Column("unidade_id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("operacao_id", sa.String(64), nullable=False),
        sa.Column("conteudo", sa.JSON(), nullable=False),
        sa.Column("recebido_em", sa.Float(), nullable=False),
    )
    op.create_table(
        "pacotes_recebidos",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("unidade_id", sa.Integer(), nullable=False),
        sa.Column("lote", sa.Integer(), nullable=False),
        sa.Column("contagens", sa.JSON(), nullable=False),
        sa.Column("recebido_em", sa.Float(), nullable=False),
        sa.UniqueConstraint("unidade_id", "lote", name="uq_pacote_unidade_lote"),
    )
    op.create_table(
        "log_eventos",
        sa.Column("id", ID_GRANDE, primary_key=True, autoincrement=True),
        sa.Column("t", sa.Float(), nullable=False),
        sa.Column("tipo", sa.String(24), nullable=False),
        sa.Column("unidade_id", sa.Integer(), nullable=True),
        sa.Column("mensagem", sa.String(500), nullable=False),
    )
    op.create_table(
        "consolidacao_final",
        sa.Column("operacao_id", sa.String(64), primary_key=True),
        sa.Column("conteudo", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("consolidacao_final")
    op.drop_table("log_eventos")
    op.drop_table("pacotes_recebidos")
    op.drop_table("manifestos")
