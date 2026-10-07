"""O lado da unidade produz exatamente os esquemas publicados em contracts/v1."""

import json
from pathlib import Path

import pytest

from app.contrato import Contagens, Manifesto, Pacote, Resposta

CONTRATOS = Path(__file__).resolve().parents[3] / "contracts" / "v1"


@pytest.mark.parametrize("nome,modelo", [("contagens", Contagens), ("manifesto", Manifesto), ("pacote", Pacote), ("resposta", Resposta)])
def test_esquema_igual_ao_contrato(nome, modelo):
    publicado = json.loads((CONTRATOS / f"{nome}.schema.json").read_text(encoding="utf-8"))
    assert modelo.model_json_schema() == publicado
