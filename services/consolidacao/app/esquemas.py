"""Modelos da API de controle do sistema de consolidação."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class UnidadeConfig(BaseModel):
    id: int = Field(ge=1, le=999)
    nome: str = Field(min_length=1, max_length=60)
    chave_hmac: str = Field(min_length=16, max_length=128)


class ConfigConsolidacao(BaseModel):
    operacao_id: str = Field(min_length=1, max_length=64)
    unidades: list[UnidadeConfig] = Field(min_length=1, max_length=50)
    num_itens: int = Field(default=5, ge=2, le=8)
    duracao_coleta_s: float = Field(ge=0, description="A consolidação só pode ser habilitada depois deste tempo.")
    seed: int | None = None

    @model_validator(mode="after")
    def _ids_unicos(self) -> "ConfigConsolidacao":
        ids = [f.id for f in self.unidades]
        if len(set(ids)) != len(ids):
            raise ValueError("ids de unidade repetidos")
        return self


class ComandoRelogio(BaseModel):
    acao: Literal["pausar", "retomar", "escala"]
    escala: float | None = Field(default=None, gt=0, le=100)
