"""Lado da central no contrato v1 (ver contracts/README.md).

Modelos próprios deste sistema; o teste test_contrato garante que produzem
exatamente os JSON Schemas publicados em contracts/v1.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

VERSAO = "1.0"

Hex64 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Contagem = Annotated[int, Field(ge=0)]


class Contagens(BaseModel):
    """Registros agregados: classificados por item, vazios e inválidos."""

    model_config = ConfigDict(extra="forbid")

    itens: list[Contagem] = Field(min_length=1, description="Registros classificados por item, na ordem 1..N.")
    vazios: Contagem
    invalidos: Contagem


class Manifesto(BaseModel):
    """Enviado antes dos pacotes: diz à central exatamente o que esperar da unidade."""

    model_config = ConfigDict(extra="forbid")

    versao: Literal["1.0"]
    operacao_id: str = Field(min_length=1, max_length=64)
    unidade_id: int = Field(ge=1)
    total_pacotes: int = Field(ge=1)
    total_registros: int = Field(ge=0)
    totais: Contagens
    hash_extrato: Hex64 = Field(description="SHA-256 do extrato canônico (ver README).")
    assinatura: Hex64 = Field(description="HMAC-SHA256 da unidade sobre o SHA-256 do manifesto sem este campo.")


class Transformacao(BaseModel):
    """Reclassificação de um pacote feita pelo Prisma no caminho até a central.

    O pacote mantém as contagens e a assinatura originais da unidade; este bloco traz as
    contagens efetivas, assinadas pelo Prisma. O total, os vazios e os inválidos não mudam.
    """

    model_config = ConfigDict(extra="forbid")

    origem: Literal["prisma"]
    pacote_id: str = Field(min_length=1, max_length=64)
    checksum_original: Hex64 = Field(description="checksum do pacote original da unidade.")
    item_alvo: int = Field(ge=1, description="Item que recebeu os registros reclassificados.")
    percentual: float = Field(gt=0, le=100, description="Percentual dos registros de outros itens reclassificados.")
    contagens: Contagens = Field(description="Contagens efetivas depois da reclassificação.")
    assinatura: Hex64 = Field(description="HMAC-SHA256 do Prisma sobre o SHA-256 deste bloco sem a assinatura.")


class Pacote(BaseModel):
    """Um lote do extrato de terminal: só contagens agregadas, nunca registros individuais."""

    model_config = ConfigDict(extra="forbid")

    versao: Literal["1.0"]
    id: str = Field(min_length=1, max_length=64, description="Identificador único e estável do lote (idempotência).")
    operacao_id: str = Field(min_length=1, max_length=64)
    unidade_id: int = Field(ge=1)
    lote: int = Field(ge=1)
    total_lotes: int = Field(ge=1)
    contagens: Contagens
    checksum: Hex64 = Field(description="SHA-256 do pacote canônico sem checksum, assinatura e transformacao.")
    assinatura: Hex64 = Field(description="HMAC-SHA256 da unidade sobre o checksum.")
    transformacao: Transformacao | None = Field(default=None, description="Presente só quando o Prisma reclassificou o lote; fica fora do checksum.")


class Resposta(BaseModel):
    """ACK ou NACK da central para um manifesto ou pacote."""

    model_config = ConfigDict(extra="forbid")

    versao: Literal["1.0"]
    tipo: Literal["ACK", "NACK"]
    referencia: str = Field(description="id do pacote, ou hash_extrato do manifesto.")
    duplicado: bool = Field(default=False, description="ACK de algo já contabilizado; nada foi somado de novo.")
    motivo: str | None = Field(default=None, description="Motivo do NACK.")
