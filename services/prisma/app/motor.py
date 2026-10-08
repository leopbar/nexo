"""Prisma: reclassifica, em trânsito, os pacotes que vão das unidades para a central.

O transporte entrega cada pacote ao Prisma antes de repassá-lo à central. Com o Prisma
ligado e a unidade dentro do escopo, a fração configurada dos registros de cada item que
não é o alvo passa para o item alvo. O pacote segue com as contagens e a assinatura
originais da unidade e ganha um bloco `transformacao` assinado pelo Prisma, que a central
verifica antes de usar as contagens efetivas.

Cada pacote é decidido uma única vez por operação: um reenvio recebe exatamente a mesma
saída, para que perdas e reenvios nunca mudem o que chega à central.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from typing import Any

import httpx
import structlog
from sqlalchemy import select

from . import regras
from .esquemas import Ajustes
from .eventos import Hub
from .modelos import AjusteSalvo, Passagem

log = structlog.get_logger("prisma")

LIMITE_HISTORICO = 300


def _estatisticas_zeradas() -> dict[str, Any]:
    return {"recebidos": 0, "reclassificados": 0, "intactos": 0, "reenvios": 0, "registros_reclassificados": 0, "saidas_por_item": [], "entradas_por_item": []}


class SistemaPrisma:
    def __init__(self, sessoes, chave: str, cliente: httpx.AsyncClient | None = None, coleta_url: str | None = None) -> None:
        self.sessoes = sessoes
        self.chave = chave
        self.cliente = cliente
        self.coleta_url = coleta_url
        self.hub = Hub()
        self.ajustes = Ajustes()
        self.operacao_id: str | None = None
        self.restos: dict[int, list[float]] = {}  # por unidade, fração pendente de cada item
        self.decididos: dict[str, bytes] = {}  # pacote_id → corpo entregue
        self.planos: dict[str, dict] = {}  # decisões recuperadas do banco depois de um reinício
        self.estatisticas = _estatisticas_zeradas()
        self.historico: deque[dict] = deque(maxlen=LIMITE_HISTORICO)
        self.catalogo: dict[str, Any] = {"disponivel": False, "operacao_id": None, "itens": [], "unidades": []}
        self._trava = asyncio.Lock()

    # ---------------------------------------------------------------- ajustes

    async def carregar(self) -> None:
        async with self.sessoes() as sessao:
            salvo = await sessao.get(AjusteSalvo, 1)
        if salvo is not None:
            self.ajustes = Ajustes.model_construct(
                ativo=salvo.ativo, item_alvo=salvo.item_alvo, percentual=salvo.percentual, escopo=salvo.escopo, unidades=list(salvo.unidades)
            )
        await self._restaurar_operacao()

    async def _restaurar_operacao(self) -> None:
        """Depois de um reinício, retoma a última operação a partir do banco.

        Recupera o histórico, as estatísticas e a decisão de cada pacote já visto, para que um
        reenvio que chegue depois do reinício receba a mesma saída da primeira passagem.
        """
        async with self.sessoes() as sessao:
            ultima = (await sessao.execute(select(Passagem.operacao_id).where(Passagem.operacao_id.is_not(None)).order_by(Passagem.id.desc()).limit(1))).scalar_one_or_none()
            if ultima is None:
                return
            linhas = (await sessao.execute(select(Passagem).where(Passagem.operacao_id == ultima).order_by(Passagem.id))).scalars().all()
        self.operacao_id = ultima
        for linha in linhas:
            passagem = {c.name: getattr(linha, c.name) for c in Passagem.__table__.columns if c.name != "id"}
            e = self.estatisticas
            e["recebidos"] += 1
            e[{"reclassificado": "reclassificados", "intacto": "intactos", "reenvio": "reenvios"}[linha.decisao]] += 1
            if linha.decisao == "reclassificado" and linha.original and linha.efetivo:
                movidos = [max(0, a - d) for a, d in zip(linha.original["itens"], linha.efetivo["itens"])]
                self._contabilizar(linha.original["itens"], movidos, linha.item_alvo - 1)
            if linha.pacote_id and linha.decisao != "reenvio" and linha.pacote_id not in self.planos:
                self.planos[linha.pacote_id] = passagem
            self.historico.append(passagem)
        log.info("operacao_restaurada", operacao_id=ultima, passagens=len(linhas))

    def _saida_planejada(self, pacote: dict, corpo: bytes) -> bytes:
        """Refaz, de forma idêntica, a saída de um pacote decidido antes do reinício."""
        plano = self.planos[pacote["id"]]
        if plano["decisao"] != "reclassificado":
            return corpo
        bloco = regras.montar_bloco(self.chave, pacote, plano["item_alvo"], plano["percentual"], plano["efetivo"])
        return json.dumps({**pacote, "transformacao": bloco}, separators=(",", ":"), ensure_ascii=False).encode()

    async def definir_ajustes(self, novos: Ajustes) -> dict:
        async with self._trava:
            if (novos.item_alvo, novos.percentual) != (self.ajustes.item_alvo, self.ajustes.percentual) or (novos.ativo and not self.ajustes.ativo):
                self.restos = {}  # nova regra: frações pendentes da regra anterior não valem mais
            self.ajustes = novos
            async with self.sessoes() as sessao, sessao.begin():
                salvo = await sessao.get(AjusteSalvo, 1)
                if salvo is None:
                    sessao.add(AjusteSalvo(id=1, **novos.model_dump()))
                else:
                    for campo, valor in novos.model_dump().items():
                        setattr(salvo, campo, valor)
        log.info("ajustes", **novos.model_dump())
        self.hub.publicar("ajustes", novos.model_dump())
        return self.retrato()

    # ------------------------------------------------------------- trânsito

    async def transformar(self, corpo: bytes) -> tuple[bytes, str]:
        """Recebe o corpo de um pacote em trânsito e devolve o corpo a entregar e a decisão."""
        try:
            pacote = json.loads(corpo)
            pacote_id, contagens = pacote["id"], pacote["contagens"]
            unidade_id, operacao_id = pacote["unidade_id"], pacote["operacao_id"]
            itens = contagens["itens"]
        except (ValueError, KeyError, TypeError):
            await self._registrar({}, "intacto", "pacote ilegível")
            return corpo, "intacto"

        async with self._trava:
            if operacao_id != self.operacao_id:
                self._nova_operacao(operacao_id)
            if pacote_id not in self.decididos and pacote_id in self.planos:
                self.decididos[pacote_id] = self._saida_planejada(pacote, corpo)
            if pacote_id in self.decididos:
                await self._registrar(pacote, "reenvio", "mesma saída da primeira passagem")
                return self.decididos[pacote_id], "reenvio"

            motivo = self._motivo_para_nao_reclassificar(pacote, len(itens))
            if motivo is None:
                alvo = self.ajustes.item_alvo - 1
                restos = self.restos.setdefault(unidade_id, [0.0] * len(itens))
                efetivas, movidos, novos_restos = regras.reclassificar(contagens, alvo, self.ajustes.percentual, restos)
                if regras.total(efetivas) != regras.total(contagens):
                    motivo = "verificação de total falhou"
                elif sum(movidos) == 0:
                    motivo = "nada a reclassificar"
                    self.restos[unidade_id] = novos_restos
                else:
                    self.restos[unidade_id] = novos_restos
                    bloco = regras.montar_bloco(self.chave, pacote, self.ajustes.item_alvo, self.ajustes.percentual, efetivas)
                    saida = json.dumps({**pacote, "transformacao": bloco}, separators=(",", ":"), ensure_ascii=False).encode()
                    self.decididos[pacote_id] = saida
                    self._contabilizar(itens, movidos, alvo)
                    await self._registrar(pacote, "reclassificado", None, efetivas=efetivas, movidos=sum(movidos))
                    return saida, "reclassificado"

            self.decididos[pacote_id] = corpo
            await self._registrar(pacote, "intacto", motivo)
            return corpo, "intacto"

    def _motivo_para_nao_reclassificar(self, pacote: dict, num_itens: int) -> str | None:
        a = self.ajustes
        if pacote.get("transformacao") is not None:
            return "já reclassificado"
        if not a.ativo or a.item_alvo is None:
            return "Prisma desligado"
        if a.escopo == "selecionadas" and pacote["unidade_id"] not in a.unidades:
            return "unidade fora do escopo"
        if a.item_alvo > num_itens:
            return "item alvo fora do catálogo"
        return None

    def _nova_operacao(self, operacao_id: str) -> None:
        self.operacao_id = operacao_id
        self.restos = {}
        self.decididos = {}
        self.planos = {}
        self.estatisticas = _estatisticas_zeradas()
        self.historico.clear()
        log.info("operacao", operacao_id=operacao_id)
        self.hub.publicar("operacao", self.retrato())

    def _contabilizar(self, itens: list[int], movidos: list[int], alvo: int) -> None:
        e = self.estatisticas
        for chave in ("saidas_por_item", "entradas_por_item"):
            if len(e[chave]) < len(itens):
                e[chave] += [0] * (len(itens) - len(e[chave]))
        for i, n in enumerate(movidos):
            e["saidas_por_item"][i] += n
        e["entradas_por_item"][alvo] += sum(movidos)
        e["registros_reclassificados"] += sum(movidos)

    async def _registrar(self, pacote: dict, decisao: str, motivo: str | None, efetivas: dict | None = None, movidos: int = 0) -> None:
        e = self.estatisticas
        e["recebidos"] += 1
        e[{"reclassificado": "reclassificados", "intacto": "intactos", "reenvio": "reenvios"}[decisao]] += 1
        passagem = {
            "registrado_em": round(time.time(), 3),
            "operacao_id": pacote.get("operacao_id"),
            "pacote_id": pacote.get("id"),
            "unidade_id": pacote.get("unidade_id"),
            "lote": pacote.get("lote"),
            "decisao": decisao,
            "motivo": motivo,
            "item_alvo": self.ajustes.item_alvo if decisao == "reclassificado" else None,
            "percentual": self.ajustes.percentual if decisao == "reclassificado" else None,
            "original": pacote.get("contagens"),
            "efetivo": efetivas,
            "movidos": movidos,
        }
        async with self.sessoes() as sessao, sessao.begin():
            sessao.add(Passagem(**passagem))
        self.historico.append(passagem)
        self.hub.publicar("passagem", {"passagem": passagem, "estatisticas": e})

    # -------------------------------------------------------------- consultas

    async def atualizar_catalogo(self) -> dict:
        """Itens e unidades da operação configurada no Nexo, lidos do serviço de coleta."""
        if self.cliente is None or self.coleta_url is None:
            return self.catalogo
        try:
            resposta = await self.cliente.get(f"{self.coleta_url}/estado", timeout=3)
            config = resposta.json().get("config") or {}
        except (httpx.HTTPError, ValueError):
            self.catalogo = {**self.catalogo, "disponivel": False}
            return self.catalogo
        titulos = [i["titulo"] for i in config.get("itens") or []] or [f"Item {n}" for n in range(1, config.get("num_itens", 0) + 1)]
        self.catalogo = {
            "disponivel": True,
            "operacao_id": config.get("operacao_id"),
            "itens": titulos if config else [],
            "unidades": [{"id": u["id"], "nome": u["nome"]} for u in config.get("unidades") or []],
        }
        return self.catalogo

    async def passagens(self, limite: int, decisao: str | None) -> list[dict]:
        consulta = select(Passagem).order_by(Passagem.id.desc()).limit(limite)
        if decisao:
            consulta = consulta.where(Passagem.decisao == decisao)
        async with self.sessoes() as sessao:
            linhas = (await sessao.execute(consulta)).scalars().all()
        return [{c.name: getattr(p, c.name) for c in Passagem.__table__.columns} for p in linhas]

    def retrato(self) -> dict:
        return {
            "ajustes": self.ajustes.model_dump(),
            "operacao_id": self.operacao_id,
            "estatisticas": self.estatisticas,
            "historico": list(self.historico),
            "catalogo": self.catalogo,
        }
