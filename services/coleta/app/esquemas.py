"""Modelos da API de controle do sistema de coleta."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class UnidadeConfig(BaseModel):
    id: int = Field(ge=1, le=999)
    nome: str = Field(min_length=1, max_length=60)
    chave_hmac: str = Field(min_length=16, max_length=128)


class Item(BaseModel):
    titulo: str = Field(min_length=1, max_length=80)
    descricao: str = Field(default="", max_length=200)


class ConfigColeta(BaseModel):
    operacao_id: str = Field(min_length=1, max_length=64)
    unidades: list[UnidadeConfig] = Field(min_length=1, max_length=50)
    num_itens: int = Field(default=5, ge=2, le=8)
    participantes_min: int = Field(default=2000, ge=1)
    participantes_max: int = Field(default=5000, ge=1)
    cobertura_min: float = Field(default=0.70, gt=0, le=1)
    cobertura_max: float = Field(default=0.95, gt=0, le=1)
    prob_vazio: float = Field(default=0.03, ge=0, lt=1)
    prob_invalido: float = Field(default=0.02, ge=0, lt=1)
    duracao_s: float = Field(default=300, ge=5, le=7200)
    intervalo_registro_s: float = Field(default=1, gt=0, le=60)
    intervalo_checkpoint_s: float = Field(default=10, gt=0, le=600)
    tamanho_pacote: int = Field(default=500, ge=1, le=100_000)
    timeout_ack_s: float = Field(default=12, gt=0, le=600)
    max_tentativas: int = Field(default=5, ge=1, le=50)
    janela_envio: int = Field(default=4, ge=1, le=64)
    seed: int | None = None
    agentes: bool = False
    lote_agentes: int = Field(default=50, ge=1, le=200)
    itens: list[Item] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def _coerente(self) -> "ConfigColeta":
        if self.participantes_min > self.participantes_max:
            raise ValueError("participantes_min maior que participantes_max")
        if self.cobertura_min > self.cobertura_max:
            raise ValueError("cobertura_min maior que cobertura_max")
        if self.prob_vazio + self.prob_invalido >= 1:
            raise ValueError("prob_vazio + prob_invalido deve ser menor que 1")
        if self.intervalo_registro_s > self.duracao_s:
            raise ValueError("intervalo de registro maior que a duração")
        if self.itens and len(self.itens) != self.num_itens:
            raise ValueError("o catálogo deve ter um item por número de itens")
        ids = [f.id for f in self.unidades]
        if len(set(ids)) != len(ids):
            raise ValueError("ids de unidade repetidos")
        return self


class ComandoRelogio(BaseModel):
    acao: Literal["pausar", "retomar", "escala"]
    escala: float | None = Field(default=None, gt=0, le=100)


class RegistroManual(BaseModel):
    """Registro digitado no terminal; o que não for um item do catálogo nem 'vazio' vira inválido."""

    digitado: str = Field(max_length=20)


class ChaveOpenAI(BaseModel):
    chave: str | None = Field(default=None, max_length=256)


class AlternarModelo(BaseModel):
    modelo: str = Field(max_length=64)
    ativo: bool
