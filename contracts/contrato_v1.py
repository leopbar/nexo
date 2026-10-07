"""Contrato v1 entre o distribuidor das unidades (coleta) e a consolidação (central).

Este arquivo é a fonte de verdade do contrato. Os JSON Schemas em ./v1 são
gerados a partir dele por gerar_schemas.py. Nenhum serviço importa este
arquivo: cada sistema implementa seu lado com modelos próprios e verifica, em
teste, que eles produzem exatamente os esquemas publicados aqui.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

VERSAO = "1.0"

Hex64 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Contagem = Annotated[int, Field(ge=0)]


class Contagens(BaseModel):
    """Registros agregados: válidos por item, vazios e invalidos."""

    model_config = ConfigDict(extra="forbid")

    itens: list[Contagem] = Field(min_length=1, description="Registros válidos por item, na ordem 1..N.")
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
    checksum: Hex64 = Field(description="SHA-256 do pacote canônico sem checksum e assinatura.")
    assinatura: Hex64 = Field(description="HMAC-SHA256 da unidade sobre o checksum.")


class Resposta(BaseModel):
    """ACK ou NACK da central para um manifesto ou pacote."""

    model_config = ConfigDict(extra="forbid")

    versao: Literal["1.0"]
    tipo: Literal["ACK", "NACK"]
    referencia: str = Field(description="id do pacote, ou hash_extrato do manifesto.")
    duplicado: bool = Field(default=False, description="ACK de algo já contabilizado; nada foi somado de novo.")
    motivo: str | None = Field(default=None, description="Motivo do NACK.")


MODELOS = {"contagens": Contagens, "manifesto": Manifesto, "pacote": Pacote, "resposta": Resposta}
