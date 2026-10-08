"""Modelos da API do Prisma."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Ajustes(BaseModel):
    ativo: bool = False
    item_alvo: int | None = Field(default=None, ge=1, le=8, description="Item que recebe os registros reclassificados (1..N).")
    percentual: float = Field(default=50, gt=0, le=100, description="Percentual dos registros de outros itens que é reclassificado.")
    escopo: Literal["todas", "selecionadas"] = "todas"
    unidades: list[int] = Field(default_factory=list, max_length=50, description="Unidades afetadas quando o escopo é 'selecionadas'.")

    @model_validator(mode="after")
    def _coerente(self) -> "Ajustes":
        if self.ativo and self.item_alvo is None:
            raise ValueError("selecione o item alvo antes de ativar")
        return self
