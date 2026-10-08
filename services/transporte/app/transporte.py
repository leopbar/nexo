"""Transporte simulado entre unidades e central.

Um proxy pequeno: cada unidade tem sua tubulação, cujo comprimento é a latência
base. A rede é que é lenta — nem a unidade nem a central fingem atrasos. Aqui se
aplicam latência, perda, corrupção, atraso extremo e quedas de link, e cada
acontecimento vira um evento para o painel desenhar.
"""

from __future__ import annotations

import asyncio
import random
import uuid
from dataclasses import dataclass, field
from typing import Any, Mapping

import httpx
import structlog
from fastapi import Response

from .esquemas import ComandoRelogio, ConfigTransporte
from .eventos import Hub
from .relogio import RelogioSimulado

log = structlog.get_logger("transporte")

SEGURAR_PERDIDO_S = 30.0
PRISMA_TIMEOUT_S = 5.0
CABECALHOS_REPASSADOS = ("content-type", "x-envio-id", "x-pacote-id", "x-unidade", "x-tipo", "x-lote", "x-tentativa")


class ComandoInvalido(Exception):
    pass


@dataclass
class Transito:
    envio_id: str
    info: dict[str, Any]
    cortado: bool = False


@dataclass
class Link:
    unidade_id: int
    latencia_base: float
    online: bool = True
    em_transito: dict[str, Transito] = field(default_factory=dict)

    def resumo(self) -> dict[str, Any]:
        return {"unidade_id": self.unidade_id, "latencia_base": self.latencia_base, "online": self.online, "em_transito": len(self.em_transito)}


class SistemaTransporte:
    def __init__(self, cliente: httpx.AsyncClient, consolidacao_url: str, prisma_url: str | None = None) -> None:
        self.relogio = RelogioSimulado()
        self.hub = Hub("transporte", self.relogio)
        self.cliente = cliente
        self.consolidacao_url = consolidacao_url
        self.prisma_url = prisma_url or None
        self.fase = "configuracao"
        self.config: ConfigTransporte | None = None
        self.links: dict[int, Link] = {}
        self.rng = random.Random()
        self.quedas_pendentes: set[int] = set()
        self.estatisticas = self._zerar_estatisticas()
        self.geracao = 0
        self._tarefas: set[asyncio.Task] = set()

    @staticmethod
    def _zerar_estatisticas() -> dict[str, int]:
        return {"enviados": 0, "entregues": 0, "perdidos": 0, "corrompidos": 0, "atrasados": 0, "recusados": 0, "quedas": 0}

    # -------------------------------------------------------------- comandos

    def configurar(self, cfg: ConfigTransporte) -> dict:
        if self.fase != "configuracao":
            raise ComandoInvalido(f"'configurar' recusado: a rede está na fase '{self.fase}'.")
        self.config = cfg
        self.rng = random.Random(f"{cfg.seed}:transporte") if cfg.seed is not None else random.Random()
        self.links = {f.id: Link(f.id, f.latencia_base_s) for f in cfg.unidades}
        ids = sorted(self.links)
        self.quedas_pendentes = set(self.rng.sample(ids, min(cfg.eventos_offline, len(ids))))
        self.estatisticas = self._zerar_estatisticas()
        self.fase = "ativa"
        self.hub.publicar("fase", {"fase": self.fase})
        self.hub.publicar("configurada", self.retrato())
        return self.retrato()

    async def reiniciar(self) -> dict:
        self.geracao += 1
        tarefas = list(self._tarefas)
        for tarefa in tarefas:
            tarefa.cancel()
        await asyncio.gather(*tarefas, return_exceptions=True)
        self.config = None
        self.links = {}
        self.quedas_pendentes = set()
        self.estatisticas = self._zerar_estatisticas()
        self.relogio.reiniciar()
        self.fase = "configuracao"
        self.hub.publicar("fase", {"fase": self.fase})
        self.hub.publicar("reiniciado", self.retrato())
        return self.retrato()

    def comandar_relogio(self, comando: ComandoRelogio) -> dict:
        if comando.acao == "pausar":
            self.relogio.pausar()
        elif comando.acao == "retomar":
            self.relogio.retomar()
        else:
            if comando.escala is None:
                raise ComandoInvalido("informe a escala")
            self.relogio.definir_escala(comando.escala)
        self.hub.publicar("relogio", self.relogio.estado())
        return self.relogio.estado()

    # ------------------------------------------------------------ transporte

    async def encaminhar(self, tipo: str, cabecalhos: Mapping[str, str], corpo: bytes) -> Response:
        geracao = self.geracao
        if self.fase != "ativa" or self.config is None:
            return Response(status_code=503, headers={"x-transporte": "inativa"})
        try:
            link = self.links[int(cabecalhos.get("x-unidade", ""))]
        except (ValueError, KeyError):
            return Response(status_code=404, headers={"x-transporte": "unidade-desconhecida"})

        cfg = self.config
        info = {
            "envio_id": cabecalhos.get("x-envio-id") or uuid.uuid4().hex,
            "unidade_id": link.unidade_id,
            "tipo": tipo,
            "referencia": cabecalhos.get("x-pacote-id", ""),
            "lote": int(cabecalhos.get("x-lote", "0") or 0),
            "tentativa": int(cabecalhos.get("x-tentativa", "1") or 1),
            "reenvio": cabecalhos.get("x-reenvio") == "1",
        }
        self._talvez_agendar_queda(link)
        if not link.online:
            self.estatisticas["recusados"] += 1
            self.hub.publicar("recusado", info | {"motivo": "link offline"})
            return Response(status_code=503, headers={"x-transporte": "offline"})

        latencia = max(0.3, link.latencia_base + self.rng.uniform(-cfg.jitter_s, cfg.jitter_s))
        amostra = self.rng.random()
        if amostra < cfg.taxa_perda:
            destino = "perda"
        elif amostra < cfg.taxa_perda + cfg.taxa_corrupcao:
            destino = "corrupcao"
        elif amostra < cfg.taxa_perda + cfg.taxa_corrupcao + cfg.taxa_atraso_extremo:
            destino = "atraso"
            latencia += self.rng.uniform(cfg.atraso_extremo_min_s, cfg.atraso_extremo_max_s)
            self.estatisticas["atrasados"] += 1
        else:
            destino = "entrega"

        transito = Transito(info["envio_id"], info)
        link.em_transito[transito.envio_id] = transito
        self.estatisticas["enviados"] += 1
        self.hub.publicar("transito", info | {"latencia": round(latencia, 3), "atraso_extremo": destino == "atraso"})

        if destino == "perda":
            fracao = self.rng.uniform(0.3, 0.8)
            await self.relogio.dormir(latencia * fracao)
            if not transito.cortado:
                self._perder(transito, "perda de pacote")
            link.em_transito.pop(transito.envio_id, None)
            return await self._segurar()

        await self.relogio.dormir(latencia)
        link.em_transito.pop(transito.envio_id, None)
        if transito.cortado or geracao != self.geracao:
            return await self._segurar()

        if tipo == "pacote" and self.prisma_url:
            corpo = await self._passar_pelo_prisma(corpo)
        if destino == "corrupcao":
            corpo = self._corromper(corpo)
            self.estatisticas["corrompidos"] += 1
            self.hub.publicar("corrompido", info)

        repassar = {k: v for k, v in cabecalhos.items() if k.lower() in CABECALHOS_REPASSADOS}
        try:
            resposta = await self.cliente.post(f"{self.consolidacao_url}/entrada/{tipo}", content=corpo, headers=repassar)
        except httpx.HTTPError as erro:
            self.hub.publicar("destino_inacessivel", info | {"erro": type(erro).__name__})
            return Response(status_code=502, headers={"x-transporte": "destino-inacessivel"})

        self.estatisticas["entregues"] += 1
        retorno = max(0.3, link.latencia_base * cfg.fator_retorno)
        self.hub.publicar("retorno", info | {"classificacao": _classificar(resposta), "status": resposta.status_code, "latencia": round(retorno, 3)})
        await self.relogio.dormir(retorno)
        return Response(content=resposta.content, status_code=resposta.status_code, media_type="application/json")

    async def _passar_pelo_prisma(self, corpo: bytes) -> bytes:
        """Entrega o pacote ao Prisma, que decide se o reclassifica. Se ele não responder, segue o original."""
        try:
            resposta = await self.cliente.post(f"{self.prisma_url}/transformar", content=corpo, headers={"content-type": "application/json"}, timeout=PRISMA_TIMEOUT_S)
        except httpx.HTTPError as erro:
            log.warning("prisma_inacessivel", erro=type(erro).__name__)
            return corpo
        if resposta.status_code != 200:
            log.warning("prisma_recusou", status=resposta.status_code)
            return corpo
        return resposta.content

    async def _segurar(self) -> Response:
        """Pacote perdido: a conexão fica pendurada; o distribuidor só descobre pelo timeout."""
        await self.relogio.dormir(SEGURAR_PERDIDO_S)
        return Response(status_code=504, headers={"x-transporte": "perdido"})

    def _perder(self, transito: Transito, motivo: str) -> None:
        transito.cortado = True
        self.estatisticas["perdidos"] += 1
        self.hub.publicar("perdido", transito.info | {"motivo": motivo})

    def _corromper(self, corpo: bytes) -> bytes:
        dados = bytearray(corpo)
        posicoes = [i for i, b in enumerate(dados) if 48 <= b <= 57]
        if not posicoes:
            return bytes(dados[:-1])
        i = self.rng.choice(posicoes)
        dados[i] = self.rng.choice([d for d in b"0123456789" if d != dados[i]])
        return bytes(dados)

    def _talvez_agendar_queda(self, link: Link) -> None:
        if link.unidade_id in self.quedas_pendentes:
            self.quedas_pendentes.discard(link.unidade_id)
            tarefa = asyncio.create_task(self._queda(link))
            self._tarefas.add(tarefa)
            tarefa.add_done_callback(self._tarefas.discard)

    async def _queda(self, link: Link) -> None:
        assert self.config
        await self.relogio.dormir(self.rng.uniform(1.5, 6.0))
        duracao = self.rng.uniform(self.config.duracao_offline_min_s, self.config.duracao_offline_max_s)
        link.online = False
        self.estatisticas["quedas"] += 1
        log.info("link_caiu", unidade=link.unidade_id, duracao=round(duracao, 1))
        self.hub.publicar("link", {"unidade_id": link.unidade_id, "online": False, "duracao": round(duracao, 2)})
        for transito in list(link.em_transito.values()):
            if not transito.cortado:
                self._perder(transito, "queda do link")
        await self.relogio.dormir(duracao)
        link.online = True
        log.info("link_voltou", unidade=link.unidade_id)
        self.hub.publicar("link", {"unidade_id": link.unidade_id, "online": True})

    def retrato(self) -> dict:
        return {
            "fase": self.fase,
            "relogio": self.relogio.estado(),
            "links": [l.resumo() for l in self.links.values()],
            "estatisticas": self.estatisticas,
        }


def _classificar(resposta: httpx.Response) -> str:
    if resposta.status_code == 503:
        return "recusado"
    try:
        corpo = resposta.json()
    except ValueError:
        return "desconhecido"
    if corpo.get("tipo") == "ACK":
        return "duplicado" if corpo.get("duplicado") else "ACK"
    return "NACK"
