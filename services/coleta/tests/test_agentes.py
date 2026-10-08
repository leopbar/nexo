import json

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import extrato as ext
from app.agentes import Agentes, Catalogo, interpretar_resposta, mascarar, montar_prompt
from app.modelos import Base

CATALOGO = Catalogo(["Telemetria", "Inventário", "Manutenção"], ["", "contagem de estoque", ""])


@pytest.fixture
async def sessoes(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'coleta.db').as_posix()}")
    async with engine.begin() as conexao:
        await conexao.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


def openai_falso(responder):
    """Cliente httpx que responde como a OpenAI; responder(corpo) -> (status, json)."""
    pedidos: list[dict] = []

    def tratar(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "gpt-5-nano"}, {"id": "gpt-4o-mini"}]})
        corpo = json.loads(request.content)
        pedidos.append(corpo)
        status, dados = responder(corpo)
        return httpx.Response(status, json=dados)

    return httpx.AsyncClient(transport=httpx.MockTransport(tratar)), pedidos


def resposta(texto: str, entrada=100, saida=60):
    return 200, {"choices": [{"message": {"content": texto}}], "usage": {"prompt_tokens": entrada, "completion_tokens": saida}}


def test_prompt_curto_com_catalogo_e_classes():
    prompt = montar_prompt(CATALOGO, 50)
    assert "50 participantes" in prompt
    assert "1) Telemetria\n2) Inventário: contagem de estoque\n3) Manutenção" in prompt
    assert "V) Vazio" in prompt and "I) Inválido" in prompt
    assert len(prompt) < 450


def test_interpretar_resposta():
    assert interpretar_resposta("1, 3,V,i, 2", 5, 3) == [1, 3, ext.VAZIO, ext.INVALIDO, 2]
    assert interpretar_resposta("1,9,2,x", 5, 3) == [1, 2]  # fora do catálogo é ignorado
    assert interpretar_resposta("1,1,1,1,1,1", 3, 3) == [1, 1, 1]  # excesso cortado


def test_mascarar_chave():
    assert mascarar("sk-proj-abcdefghijklmnop") == "sk-...mnop"
    assert mascarar(None) is None


async def test_lote_registrado_por_modelo_ativo_com_custo(sessoes):
    cliente, pedidos = openai_falso(lambda _: resposta("1,2,3,V"))
    agentes = Agentes(sessoes, cliente)
    await agentes.definir_chave("sk-teste-1234567890")
    await agentes.alternar("gpt-4.1-nano", False)
    await agentes.alternar("gpt-6-luna", False)

    modelo, registros = await agentes.gerar_lote(CATALOGO, 4)

    assert modelo in {"gpt-5-nano", "gpt-4o-mini"}  # ativos e disponíveis na conta
    assert registros == [1, 2, 3, ext.VAZIO]
    assert pedidos[0]["max_completion_tokens"] < 200
    if modelo == "gpt-5-nano":
        assert pedidos[0]["reasoning_effort"] == "minimal"
    else:
        assert "reasoning_effort" not in pedidos[0]
    estado = agentes.estado()
    assert estado["chamadas"] == 1 and estado["custo_total"] > 0
    assert estado["chave"] == "sk-...7890"


async def test_modelo_desativado_nao_registra(sessoes):
    cliente, pedidos = openai_falso(lambda _: resposta("1"))
    agentes = Agentes(sessoes, cliente, "sk-teste-1234567890")
    for m in list(agentes.ativos):
        await agentes.alternar(m, False)
    await agentes.alternar("gpt-4o-mini", True)

    for _ in range(10):
        await agentes.gerar_lote(CATALOGO, 1)
    assert {p["model"] for p in pedidos} == {"gpt-4o-mini"}

    await agentes.alternar("gpt-4o-mini", False)
    assert await agentes.gerar_lote(CATALOGO, 1) is None


async def test_sobe_esforco_quando_modelo_recusa(sessoes):
    def responder(corpo):
        if corpo.get("reasoning_effort") == "none":
            return 400, {"error": {"message": "Unsupported value: 'none' for reasoning_effort"}}
        return resposta("2")

    cliente, pedidos = openai_falso(responder)
    agentes = Agentes(sessoes, cliente, "sk-teste-1234567890")
    agentes.ativos = {"gpt-6-luna"}

    assert await agentes.gerar_lote(CATALOGO, 1) == ("gpt-6-luna", [2])
    assert [p["reasoning_effort"] for p in pedidos] == ["none", "minimal"]
    await agentes.gerar_lote(CATALOGO, 1)
    assert pedidos[-1]["reasoning_effort"] == "minimal"  # lembra o que funcionou


async def test_falha_da_api_devolve_none_e_registra(sessoes):
    cliente, _ = openai_falso(lambda _: (429, {"error": {"message": "Rate limit"}}))
    agentes = Agentes(sessoes, cliente, "sk-teste-1234567890")
    agentes.ativos = {"gpt-4o-mini"}

    assert await agentes.gerar_lote(CATALOGO, 5) is None
    modelo = next(m for m in agentes.estado()["modelos"] if m["id"] == "gpt-4o-mini")
    assert modelo["falhas"] == 1 and "Rate limit" in modelo["ultimo_erro"]


async def test_chave_e_modelos_persistem(sessoes):
    cliente, _ = openai_falso(lambda _: resposta("1"))
    agentes = Agentes(sessoes, cliente)
    await agentes.definir_chave("sk-teste-1234567890")
    await agentes.alternar("gpt-6-astra", True)

    outro = Agentes(sessoes, cliente)
    await outro.carregar()
    assert outro.chave == "sk-teste-1234567890"
    assert "gpt-6-astra" in outro.ativos
