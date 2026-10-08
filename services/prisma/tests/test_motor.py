import hashlib
import hmac
import json

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.esquemas import Ajustes
from app.modelos import Base, Passagem
from app.motor import SistemaPrisma

CHAVE = "chave-do-prisma"


def pacote(n: int, unidade: int = 1, operacao: str = "op-1", itens=(40, 30, 31)) -> dict:
    return {
        "versao": "1.0",
        "id": f"{operacao}-{unidade}-{n}",
        "operacao_id": operacao,
        "unidade_id": unidade,
        "lote": n,
        "total_lotes": 9,
        "contagens": {"itens": list(itens), "vazios": 5, "invalidos": 2},
        "checksum": "c" * 64,
        "assinatura": "d" * 64,
    }


def em_bytes(p: dict) -> bytes:
    return json.dumps(p).encode()


@pytest.fixture
async def prisma(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'prisma.db').as_posix()}")
    async with engine.begin() as conexao:
        await conexao.run_sync(Base.metadata.create_all)
    sistema = SistemaPrisma(async_sessionmaker(engine, expire_on_commit=False), CHAVE)
    yield sistema
    await engine.dispose()


async def test_desligado_deixa_passar_intacto(prisma):
    corpo = em_bytes(pacote(1))
    saida, decisao = await prisma.transformar(corpo)
    assert (saida, decisao) == (corpo, "intacto")
    assert prisma.historico[-1]["motivo"] == "Prisma desligado"


async def test_ligado_reclassifica_e_assina(prisma):
    await prisma.definir_ajustes(Ajustes(ativo=True, item_alvo=1, percentual=50))
    original = pacote(1)
    saida, decisao = await prisma.transformar(em_bytes(original))
    entregue = json.loads(saida)
    assert decisao == "reclassificado"
    assert entregue["contagens"] == original["contagens"]  # o original da unidade segue junto
    bloco = entregue["transformacao"]
    assert bloco["contagens"] == {"itens": [40 + 15 + 15, 15, 16], "vazios": 5, "invalidos": 2}
    corpo = {k: v for k, v in bloco.items() if k != "assinatura"}
    digest = hashlib.sha256(json.dumps(corpo, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    assert bloco["assinatura"] == hmac.new(CHAVE.encode(), digest.encode(), hashlib.sha256).hexdigest()
    assert (bloco["pacote_id"], bloco["checksum_original"]) == (original["id"], original["checksum"])


async def test_reenvio_recebe_a_mesma_saida_mesmo_depois_de_desligar(prisma):
    await prisma.definir_ajustes(Ajustes(ativo=True, item_alvo=2, percentual=50))
    primeira, _ = await prisma.transformar(em_bytes(pacote(1)))
    await prisma.definir_ajustes(Ajustes(ativo=False, item_alvo=2))
    segunda, decisao = await prisma.transformar(em_bytes(pacote(1)))
    assert segunda == primeira and decisao == "reenvio"
    assert prisma.estatisticas["reclassificados"] == 1 and prisma.estatisticas["reenvios"] == 1


async def test_escopo_por_unidade(prisma):
    await prisma.definir_ajustes(Ajustes(ativo=True, item_alvo=1, escopo="selecionadas", unidades=[2]))
    _, fora = await prisma.transformar(em_bytes(pacote(1, unidade=1)))
    _, dentro = await prisma.transformar(em_bytes(pacote(1, unidade=2)))
    assert (fora, dentro) == ("intacto", "reclassificado")


async def test_nova_operacao_zera_estatisticas_e_restos(prisma):
    await prisma.definir_ajustes(Ajustes(ativo=True, item_alvo=1))
    await prisma.transformar(em_bytes(pacote(1, itens=(0, 1, 1))))
    assert prisma.restos
    await prisma.transformar(em_bytes(pacote(1, operacao="op-2")))
    assert prisma.estatisticas["recebidos"] == 1 and prisma.operacao_id == "op-2"


async def test_estatisticas_e_rastro_no_banco(prisma):
    await prisma.definir_ajustes(Ajustes(ativo=True, item_alvo=3, percentual=50))
    for n in range(1, 5):
        await prisma.transformar(em_bytes(pacote(n)))
    e = prisma.estatisticas
    assert e["reclassificados"] == 4
    assert e["entradas_por_item"][2] == e["registros_reclassificados"] == sum(e["saidas_por_item"])
    assert e["registros_reclassificados"] == 4 * (40 + 30) // 2
    async with prisma.sessoes() as sessao:
        assert (await sessao.execute(select(func.count()).select_from(Passagem))).scalar_one() == 4


async def test_item_alvo_fora_do_catalogo_e_corpo_ilegivel(prisma):
    await prisma.definir_ajustes(Ajustes(ativo=True, item_alvo=8))
    _, decisao = await prisma.transformar(em_bytes(pacote(1)))
    assert decisao == "intacto" and prisma.historico[-1]["motivo"] == "item alvo fora do catálogo"
    saida, decisao = await prisma.transformar(b'{"id": 1')
    assert (saida, decisao) == (b'{"id": 1', "intacto")


def test_ativar_exige_item_alvo():
    with pytest.raises(ValueError):
        Ajustes(ativo=True)


async def test_reinicio_retoma_operacao_e_mantem_a_mesma_saida(prisma):
    await prisma.definir_ajustes(Ajustes(ativo=True, item_alvo=2, percentual=50))
    primeira, _ = await prisma.transformar(em_bytes(pacote(1)))
    intacto_antes, _ = await prisma.transformar(em_bytes(pacote(2, itens=(0, 5, 0))))
    estatisticas = dict(prisma.estatisticas)

    reiniciado = SistemaPrisma(prisma.sessoes, CHAVE)
    await reiniciado.carregar()
    assert reiniciado.operacao_id == "op-1" and reiniciado.ajustes.item_alvo == 2
    assert reiniciado.estatisticas["recebidos"] == estatisticas["recebidos"]
    assert reiniciado.estatisticas["registros_reclassificados"] == estatisticas["registros_reclassificados"]
    assert len(reiniciado.historico) == 2

    await reiniciado.definir_ajustes(Ajustes(ativo=True, item_alvo=3, percentual=90))  # regra mudou depois
    saida, decisao = await reiniciado.transformar(em_bytes(pacote(1)))
    assert (saida, decisao) == (primeira, "reenvio")
    saida, decisao = await reiniciado.transformar(em_bytes(pacote(2, itens=(0, 5, 0))))
    assert (saida, decisao) == (intacto_antes, "reenvio")
