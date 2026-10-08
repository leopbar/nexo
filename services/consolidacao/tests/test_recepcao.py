"""Recepção na central: fase, validação, idempotência, verificação e consolidação final."""

import hashlib
import hmac
import json

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.esquemas import ConfigConsolidacao, UnidadeConfig
from app.modelos import Base
from app.motor import ComandoInvalido, Fase, SistemaConsolidacao

CHAVE = "chave-da-unidade-1-xyz"
OPERACAO = "operacao-teste"


def _canon(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _assinar(mensagem: str) -> str:
    return hmac.new(CHAVE.encode(), mensagem.encode(), hashlib.sha256).hexdigest()


def _extrato(lotes):
    """Monta manifesto e pacotes como a unidade faria (implementação de teste, independente)."""
    pacotes = []
    for n, c in enumerate(lotes, start=1):
        corpo = {"versao": "1.0", "id": f"p-{n}", "operacao_id": OPERACAO, "unidade_id": 1, "lote": n, "total_lotes": len(lotes), "contagens": c}
        checksum = hashlib.sha256(_canon(corpo)).hexdigest()
        pacotes.append({**corpo, "checksum": checksum, "assinatura": _assinar(checksum)})
    totais = {"itens": [sum(c["itens"][i] for c in lotes) for i in range(2)], "vazios": sum(c["vazios"] for c in lotes), "invalidos": sum(c["invalidos"] for c in lotes)}
    corpo = {
        "versao": "1.0",
        "operacao_id": OPERACAO,
        "unidade_id": 1,
        "total_pacotes": len(lotes),
        "total_registros": sum(totais["itens"]) + totais["vazios"] + totais["invalidos"],
        "totais": totais,
        "hash_extrato": hashlib.sha256(_canon({"operacao_id": OPERACAO, "unidade_id": 1, "lotes": lotes})).hexdigest(),
    }
    manifesto = {**corpo, "assinatura": _assinar(hashlib.sha256(_canon(corpo)).hexdigest())}
    return manifesto, pacotes


LOTES = [{"itens": [300, 190], "vazios": 6, "invalidos": 4}, {"itens": [100, 120], "vazios": 2, "invalidos": 1}]


def _bytes(obj) -> bytes:
    return json.dumps(obj).encode()


@pytest.fixture
async def sistema(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'consolidacao.db'}")
    async with engine.begin() as conexao:
        await conexao.run_sync(Base.metadata.create_all)
    s = SistemaConsolidacao(async_sessionmaker(engine, expire_on_commit=False))
    await s.configurar(ConfigConsolidacao(operacao_id=OPERACAO, unidades=[UnidadeConfig(id=1, nome="Aurora", chave_hmac=CHAVE)], num_itens=2, duracao_coleta_s=0))
    yield s
    await engine.dispose()


async def test_recusa_pacotes_enquanto_coleta_aberta(sistema):
    sistema.config.duracao_coleta_s = 300
    await sistema.iniciar()
    manifesto, _ = _extrato(LOTES)
    status, resposta = await sistema.receber_manifesto(_bytes(manifesto), {})
    assert status == 503 and resposta.tipo == "NACK"
    with pytest.raises(ComandoInvalido):
        await sistema.habilitar()


async def test_fluxo_completo_com_duplicado_e_corrupcao(sistema):
    await sistema.iniciar()
    await sistema.habilitar()
    manifesto, pacotes = _extrato(LOTES)

    _, r = await sistema.receber_pacote(_bytes(pacotes[0]), {})
    assert r.tipo == "NACK" and r.motivo == "manifesto ausente"

    _, r = await sistema.receber_manifesto(_bytes(manifesto), {})
    assert r.tipo == "ACK" and r.referencia == manifesto["hash_extrato"]

    corrompido = _bytes(pacotes[0]).replace(b"300", b"301")
    _, r = await sistema.receber_pacote(corrompido, {})
    assert r.tipo == "NACK" and r.motivo == "checksum inválido"

    _, r = await sistema.receber_pacote(_bytes(pacotes[0]), {})
    assert r.tipo == "ACK" and not r.duplicado
    _, r = await sistema.receber_pacote(_bytes(pacotes[0]), {})
    assert r.tipo == "ACK" and r.duplicado
    assert sistema.consolidado["itens"] == [300, 190]  # duplicado não somou

    _, r = await sistema.receber_pacote(_bytes(pacotes[1]), {})
    assert r.tipo == "ACK"
    assert sistema.unidades[1].status == "validada"
    assert sistema.fase == Fase.CONSOLIDACAO_FINAL
    assert sistema.consolidacao_final["predominante"] == 1
    assert sistema.consolidacao_final["totais"]["itens"] == [400, 310]
    assert sistema.percentual_processado() == 1.0


async def test_assinatura_de_outra_chave_e_rejeitada(sistema):
    await sistema.iniciar()
    await sistema.habilitar()
    manifesto, _ = _extrato(LOTES)
    manifesto["assinatura"] = "0" * 64
    _, r = await sistema.receber_manifesto(_bytes(manifesto), {})
    assert r.tipo == "NACK" and r.motivo == "assinatura inválida"


async def test_json_ilegivel_gera_nack(sistema):
    await sistema.iniciar()
    await sistema.habilitar()
    _, r = await sistema.receber_pacote(b'{"versao": "1.0", "lote": 01', {"x-pacote-id": "p-9", "x-unidade": "1"})
    assert r.tipo == "NACK" and r.referencia == "p-9"
