from sqlalchemy import JSON, BigInteger, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

ID_GRANDE = BigInteger().with_variant(Integer(), "sqlite")


class Base(DeclarativeBase):
    pass


class ManifestoRecebido(Base):
    __tablename__ = "manifestos"

    unidade_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    operacao_id: Mapped[str] = mapped_column(String(64))
    conteudo: Mapped[dict] = mapped_column(JSON)
    recebido_em: Mapped[float] = mapped_column(Float)


class PacoteRecebido(Base):
    __tablename__ = "pacotes_recebidos"
    __table_args__ = (UniqueConstraint("unidade_id", "lote", name="uq_pacote_unidade_lote"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    unidade_id: Mapped[int] = mapped_column(Integer)
    lote: Mapped[int] = mapped_column(Integer)
    contagens: Mapped[dict] = mapped_column(JSON)
    recebido_em: Mapped[float] = mapped_column(Float)


class EventoLog(Base):
    __tablename__ = "log_eventos"

    id: Mapped[int] = mapped_column(ID_GRANDE, primary_key=True, autoincrement=True)
    t: Mapped[float] = mapped_column(Float)
    tipo: Mapped[str] = mapped_column(String(24))
    unidade_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mensagem: Mapped[str] = mapped_column(String(500))


class ConsolidacaoFinal(Base):
    __tablename__ = "consolidacao_final"

    operacao_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conteudo: Mapped[dict] = mapped_column(JSON)
