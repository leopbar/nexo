import asyncio
import json
import tempfile
from pathlib import Path

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.agentes import Agentes
from app.esquemas import ConfigColeta
from app.modelos import Base, Registro
from app.motor import ComandoInvalido, Fase, SistemaColeta


def config(**extra) -> ConfigColeta:
    return ConfigColeta(
        operacao_id="teste",
        unidades=[{"id": 1, "nome": "A", "chave_hmac": "x" * 32}, {"id": 2, "nome": "B", "chave_hmac": "y" * 32}],
        num_itens=3,
        participantes_min=120,
        participantes_max=180,
        duracao_s=5,
        intervalo_registro_s=1,
        intervalo_checkpoint_s=2,
        seed=1,
        agentes=True,
        lote_agentes=50,
        itens=[{"titulo": "Um"}, {"titulo": "Dois"}, {"titulo": "Três"}],
        **extra,
    )


async def montar(responder):
    arquivo = Path(tempfile.mkdtemp()) / "coleta.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{arquivo.as_posix()}")
    async with engine.begin() as conexao:
        await conexao.run_sync(Base.metadata.create_all)
    sessoes = async_sessionmaker(engine, expire_on_commit=False)
    pedidos: list[dict] = []

    async def tratar(request: httpx.Request) -> httpx.Response:
        corpo = json.loads(request.content)
        pedidos.append(corpo)
        resposta = responder(corpo)
        return await resposta if asyncio.iscoroutine(resposta) else resposta

    cliente = httpx.AsyncClient(transport=httpx.MockTransport(tratar))
    agentes = Agentes(sessoes, cliente, "sk-teste-1234567890")
    agentes.ativos = {"gpt-4o-mini"}
    return SistemaColeta(sessoes, cliente, "http://transporte", agentes), sessoes, pedidos


def sempre(texto: str):
    return lambda _: httpx.Response(200, json={"choices": [{"message": {"content": texto}}], "usage": {"prompt_tokens": 100, "completion_tokens": 100}})


async def registrar_ate_fechar(sistema: SistemaColeta):
    sistema.relogio.definir_escala(100)
    await sistema.configurar(config())
    await sistema.iniciar()
    while sistema.fase != Fase.FECHADA:
        await sistema.relogio.dormir(0.5)


async def test_todos_os_participantes_registram_em_lotes():
    sistema, sessoes, pedidos = await montar(sempre(",".join(["2"] * 50)))
    await registrar_ate_fechar(sistema)

    previstos = sum(u.registros_previstos for u in sistema.terminais.values())
    async with sessoes() as sessao:
        gravados = (await sessao.execute(select(func.count()).select_from(Registro))).scalar_one()
    assert gravados == previstos
    assert all(n <= 50 for n in (int(p["messages"][0]["content"].split()[2]) for p in pedidos))
    for terminal in sistema.terminais.values():
        assert terminal.contagens["itens"][1] == terminal.registros_previstos  # tudo veio do modelo
        assert terminal.manifesto["totais"] == terminal.contagens


async def test_falha_do_modelo_cai_na_amostragem():
    sistema, sessoes, _ = await montar(lambda _: httpx.Response(500, json={"error": {"message": "fora do ar"}}))
    await registrar_ate_fechar(sistema)
    previstos = sum(u.registros_previstos for u in sistema.terminais.values())
    assert sum(sum(u.contagens["itens"]) + u.contagens["vazios"] + u.contagens["invalidos"] for u in sistema.terminais.values()) == previstos
    assert sistema.agentes.estado()["falhas"] > 0


async def test_configurar_recusa_sem_modelo_ativo():
    sistema, _, _ = await montar(sempre("1"))
    sistema.agentes.ativos = set()
    try:
        await sistema.configurar(config())
    except ComandoInvalido as erro:
        assert "nenhum modelo" in str(erro)
    else:
        raise AssertionError("deveria recusar")


async def test_fila_continua_registrando_depois_do_fechamento():
    async def lento(_):
        await asyncio.sleep(0.4)  # resposta da IA bem mais lenta que a coleta acelerada
        return sempre(",".join(["1"] * 50))(None)

    sistema, _, _ = await montar(lento)
    andamentos: list[dict] = []
    publicar = sistema.hub.publicar
    sistema.hub.publicar = lambda tipo, dados=None: (andamentos.append(dados) if tipo == "andamento" else None, publicar(tipo, dados))
    await registrar_ate_fechar(sistema)

    depois = [p for p in andamentos if p["entrada_fechada"]]
    assert len(depois) >= 2  # o andamento continuou saindo com os entrada fechada
    filas = [sum(f["fila"] for f in p["unidades"]) for p in depois]
    assert filas[0] > 0 and filas == sorted(filas, reverse=True)
    assert all(not f["aberta"] for p in depois for f in p["unidades"])
    assert sum(f["fila"] for f in andamentos[-1]["unidades"]) == 0
    assert all(u.aguardando == 0 for u in sistema.terminais.values())
    assert all(u.contagens["itens"][0] == u.registros_previstos for u in sistema.terminais.values())
