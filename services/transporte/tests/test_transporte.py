import json

import httpx

from app.esquemas import ConfigTransporte, UnidadeTransporte
from app.transporte import SistemaTransporte


def _consolidacao_falsa(request: httpx.Request) -> httpx.Response:
    corpo = json.loads(request.content)
    return httpx.Response(200, json={"versao": "1.0", "tipo": "ACK", "referencia": corpo["id"], "duplicado": False, "motivo": None})


def _rede(**taxas) -> SistemaTransporte:
    cliente = httpx.AsyncClient(transport=httpx.MockTransport(_consolidacao_falsa))
    rede = SistemaTransporte(cliente, "http://consolidacao")
    config = dict(taxa_perda=0, taxa_corrupcao=0, taxa_atraso_extremo=0, eventos_offline=0, jitter_s=0) | taxas
    rede.configurar(ConfigTransporte(operacao_id="e", unidades=[UnidadeTransporte(id=1, latencia_base_s=3)], seed=1, **config))
    rede.relogio.definir_escala(100)
    return rede


CABECALHOS = {"x-unidade": "1", "x-envio-id": "env-1", "x-pacote-id": "p-1", "x-lote": "1", "x-tentativa": "1"}
CORPO = json.dumps({"id": "p-1", "contagens": {"itens": [123, 456]}}).encode()


async def test_entrega_com_latencia_simulada():
    rede = _rede()
    inicio = rede.relogio.agora()
    resposta = await rede.encaminhar("pacote", CABECALHOS, CORPO)
    assert resposta.status_code == 200
    assert json.loads(resposta.body)["tipo"] == "ACK"
    assert rede.relogio.agora() - inicio >= 3.0  # ida + volta medidas no relógio simulado
    assert rede.estatisticas["entregues"] == 1


async def test_perda_segura_conexao_e_nao_entrega():
    rede = _rede(taxa_perda=1)
    resposta = await rede.encaminhar("pacote", CABECALHOS, CORPO)
    assert resposta.status_code == 504
    assert rede.estatisticas["perdidos"] == 1
    assert rede.estatisticas["entregues"] == 0


async def test_corrupcao_altera_um_digito():
    rede = _rede()
    corrompido = rede._corromper(CORPO)
    assert corrompido != CORPO
    assert len(corrompido) == len(CORPO)
    assert sum(a != b for a, b in zip(corrompido, CORPO)) == 1


async def test_link_offline_recusa_imediatamente():
    rede = _rede()
    rede.links[1].online = False
    resposta = await rede.encaminhar("pacote", CABECALHOS, CORPO)
    assert resposta.status_code == 503
    assert resposta.headers["x-transporte"] == "offline"
