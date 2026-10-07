from typing import Literal

from pydantic import BaseModel, Field, model_validator


class UnidadeTransporte(BaseModel):
    id: int = Field(ge=1, le=999)
    latencia_base_s: float = Field(gt=0, le=120, description="Comprimento da tubulação, em segundos por pacote.")


class ConfigTransporte(BaseModel):
    operacao_id: str = Field(min_length=1, max_length=64)
    unidades: list[UnidadeTransporte] = Field(min_length=1, max_length=50)
    jitter_s: float = Field(default=0.5, ge=0, le=10, description="Variação aleatória (±) por pacote.")
    taxa_perda: float = Field(default=0.05, ge=0, le=1)
    taxa_corrupcao: float = Field(default=0.02, ge=0, le=1)
    taxa_atraso_extremo: float = Field(default=0.02, ge=0, le=1)
    atraso_extremo_min_s: float = Field(default=13, ge=0)
    atraso_extremo_max_s: float = Field(default=18, ge=0)
    eventos_offline: int = Field(default=1, ge=0, le=50)
    duracao_offline_min_s: float = Field(default=5, ge=0)
    duracao_offline_max_s: float = Field(default=10, ge=0)
    fator_retorno: float = Field(default=0.05, gt=0, le=1, description="Latência do ACK/NACK como fração da latência base.")
    seed: int | None = None

    @model_validator(mode="after")
    def _coerente(self) -> "ConfigTransporte":
        if self.taxa_perda + self.taxa_corrupcao + self.taxa_atraso_extremo > 1:
            raise ValueError("a soma das taxas de falha não pode passar de 1")
        if self.atraso_extremo_min_s > self.atraso_extremo_max_s:
            raise ValueError("atraso extremo mínimo maior que o máximo")
        if self.duracao_offline_min_s > self.duracao_offline_max_s:
            raise ValueError("duração offline mínima maior que a máxima")
        return self


class ComandoRelogio(BaseModel):
    acao: Literal["pausar", "retomar", "escala"]
    escala: float | None = Field(default=None, gt=0, le=100)
