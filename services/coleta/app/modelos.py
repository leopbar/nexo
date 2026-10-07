from sqlalchemy import JSON, BigInteger, Float, Index, Integer, SmallInteger, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

ID_GRANDE = BigInteger().with_variant(Integer(), "sqlite")


class Base(DeclarativeBase):
    pass


class Registro(Base):
    """Um registro registrado no terminal. classe: 1..N item, 0 vazio, -1 invalido."""

    __tablename__ = "registros"
    __table_args__ = (Index("ix_registros_unidade_segundo", "unidade_id", "segundo", "id"),)

    id: Mapped[int] = mapped_column(ID_GRANDE, primary_key=True, autoincrement=True)
    unidade_id: Mapped[int] = mapped_column(Integer)
    segundo: Mapped[int] = mapped_column(Integer)
    classe: Mapped[int] = mapped_column(SmallInteger)


class Checkpoint(Base):
    __tablename__ = "checkpoints"

    id: Mapped[int] = mapped_column(ID_GRANDE, primary_key=True, autoincrement=True)
    unidade_id: Mapped[int] = mapped_column(Integer)
    segundo: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    cobertura: Mapped[float] = mapped_column(Float)
    contagens: Mapped[dict] = mapped_column(JSON)


class Extrato(Base):
    __tablename__ = "extratos"

    unidade_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    operacao_id: Mapped[str] = mapped_column(String(64))
    participantes: Mapped[int] = mapped_column(Integer)
    total_registros: Mapped[int] = mapped_column(Integer)
    total_pacotes: Mapped[int] = mapped_column(Integer)
    contagens: Mapped[dict] = mapped_column(JSON)
    hash: Mapped[str] = mapped_column(String(64))
    manifesto: Mapped[dict] = mapped_column(JSON)


class PacoteGerado(Base):
    __tablename__ = "pacotes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    unidade_id: Mapped[int] = mapped_column(Integer)
    lote: Mapped[int] = mapped_column(Integer)
    total_lotes: Mapped[int] = mapped_column(Integer)
    conteudo: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default="pendente", server_default="pendente")
