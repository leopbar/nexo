from sqlalchemy import JSON, BigInteger, Boolean, Float, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

ID_GRANDE = BigInteger().with_variant(Integer(), "sqlite")


class Base(DeclarativeBase):
    pass


class AjusteSalvo(Base):
    """Linha única com os ajustes do Prisma; sobrevive a reinícios."""

    __tablename__ = "ajustes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    ativo: Mapped[bool] = mapped_column(Boolean)
    item_alvo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    percentual: Mapped[float] = mapped_column(Float)
    escopo: Mapped[str] = mapped_column(String(16))
    unidades: Mapped[list] = mapped_column(JSON)


class Passagem(Base):
    """Rastro de cada pacote que atravessou o Prisma, reclassificado ou não."""

    __tablename__ = "passagens"

    id: Mapped[int] = mapped_column(ID_GRANDE, primary_key=True, autoincrement=True)
    registrado_em: Mapped[float] = mapped_column(Float)
    operacao_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pacote_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    unidade_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lote: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decisao: Mapped[str] = mapped_column(String(16))  # reclassificado | intacto | reenvio
    motivo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    item_alvo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    percentual: Mapped[float | None] = mapped_column(Float, nullable=True)
    original: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    efetivo: Mapped[dict | None] = mapped_column(JSON(none_as_null=True), nullable=True)
    movidos: Mapped[int] = mapped_column(Integer, default=0)
