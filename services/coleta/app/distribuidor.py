"""Distribuidor da unidade: entrega garantida por confirmação.

Envia o manifesto e depois os pacotes, cada um reenviado até receber ACK,
com backoff exponencial e limite de tentativas. Queda do link (a rede responde
"offline") não consome tentativas: a unidade só espera reconectar.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

import httpx
import structlog
from pydantic import ValidationError

from .contrato import Manifesto, Pacote, Resposta
from .esquemas import ConfigColeta
from .eventos import Hub
from .relogio import RelogioSimulado

if TYPE_CHECKING:
    from .motor import Terminal

log = structlog.get_logger("distribuidor")

BACKOFF_INICIAL_S = 1.0
BACKOFF_MAXIMO_S = 16.0
ESPERA_RECONEXAO_S = 2.0
LIMITE_ESPERAS_RECONEXAO = 60
ESPACAMENTO_INICIAL_S = 0.4


class Distribuidor:
    def __init__(
        self,
        *,
        relogio: RelogioSimulado,
        hub: Hub,
        cliente: httpx.AsyncClient,
        transporte_url: str,
        config: ConfigColeta,
        registrar_status: Callable[[str, str], Awaitable[None]],
        ao_mudar: Callable[[Terminal], None],
    ) -> None:
        self.relogio = relogio
        self.hub = hub
        self.cliente = cliente
        self.transporte_url = transporte_url
        self.config = config
        self.registrar_status = registrar_status
        self.ao_mudar = ao_mudar

    def _status(self, terminal: Terminal, status: str) -> None:
        terminal.distribuicao = status
        self.ao_mudar(terminal)

    async def distribuir(self, terminal: Terminal) -> bool:
        assert terminal.manifesto is not None
        self._status(terminal, "distribuindo")

        if not terminal.manifesto_confirmado:
            Manifesto.model_validate(terminal.manifesto)
            if not await self._entregar(terminal, "manifesto", terminal.manifesto, terminal.manifesto["hash_extrato"], 0):
                self._status(terminal, "falha")
                return False
            terminal.manifesto_confirmado = True

        pendentes = [p for p in terminal.pacotes if p["id"] not in terminal.confirmados]
        janela = asyncio.Semaphore(self.config.janela_envio)

        async def enviar(ordem: int, pacote: dict) -> bool:
            async with janela:
                if ordem < self.config.janela_envio:
                    await self.relogio.dormir(ordem * ESPACAMENTO_INICIAL_S)
                ok = await self._entregar(terminal, "pacote", pacote, pacote["id"], pacote["lote"])
            if ok:
                terminal.confirmados.add(pacote["id"])
                self.ao_mudar(terminal)
            await self.registrar_status(pacote["id"], "confirmado" if ok else "falha")
            return ok

        entregas = await asyncio.gather(*(enviar(i, p) for i, p in enumerate(pendentes)))
        sucesso = all(entregas)
        self._status(terminal, "entregue" if sucesso else "falha")
        return sucesso

    async def _entregar(self, terminal: Terminal, tipo: str, corpo: dict, referencia: str, lote: int) -> bool:
        if tipo == "pacote":
            Pacote.model_validate(corpo)
        dados = json.dumps(corpo, separators=(",", ":"), ensure_ascii=False).encode()
        tentativa = 0
        envios = 0
        esperas = 0
        while tentativa < self.config.max_tentativas:
            tentativa += 1
            envios += 1
            info = {
                "envio_id": uuid.uuid4().hex,
                "unidade_id": terminal.id,
                "tipo": tipo,
                "referencia": referencia,
                "lote": lote,
                "tentativa": tentativa,
                "envio": envios,
                "reenvio": envios > 1,
            }
            self.hub.publicar("envio", info)
            cabecalhos = {
                "content-type": "application/json",
                "x-envio-id": info["envio_id"],
                "x-pacote-id": referencia,
                "x-unidade": str(terminal.id),
                "x-tipo": tipo,
                "x-lote": str(lote),
                "x-tentativa": str(tentativa),
                "x-reenvio": "1" if envios > 1 else "0",
            }
            try:
                resposta_http = await self.relogio.com_limite(
                    self.cliente.post(f"{self.transporte_url}/encaminhar/{tipo}", content=dados, headers=cabecalhos),
                    self.config.timeout_ack_s,
                )
            except TimeoutError:
                self.hub.publicar("timeout", info)
            except httpx.HTTPError as erro:
                tentativa -= 1
                esperas += 1
                self.hub.publicar("sem_conexao", info | {"motivo": type(erro).__name__})
                if esperas > LIMITE_ESPERAS_RECONEXAO:
                    break
                await self.relogio.dormir(ESPERA_RECONEXAO_S)
                continue
            else:
                if resposta_http.status_code == 503 and resposta_http.headers.get("x-transporte") == "offline":
                    tentativa -= 1
                    esperas += 1
                    self.hub.publicar("sem_conexao", info | {"motivo": "link offline"})
                    if esperas > LIMITE_ESPERAS_RECONEXAO:
                        break
                    await self.relogio.dormir(ESPERA_RECONEXAO_S)
                    continue
                resposta = _ler_resposta(resposta_http)
                if resposta is not None and resposta.tipo == "ACK" and resposta.referencia == referencia:
                    self.hub.publicar("ack", info | {"duplicado": resposta.duplicado})
                    return True
                motivo = resposta.motivo if resposta and resposta.motivo else f"HTTP {resposta_http.status_code}"
                self.hub.publicar("nack", info | {"motivo": motivo})

            if tentativa < self.config.max_tentativas:
                await self.relogio.dormir(min(BACKOFF_INICIAL_S * 2 ** (tentativa - 1), BACKOFF_MAXIMO_S))

        log.warning("entrega_falhou", unidade=terminal.id, tipo=tipo, referencia=referencia, tentativas=tentativa)
        self.hub.publicar("falha_envio", {"unidade_id": terminal.id, "tipo": tipo, "referencia": referencia, "lote": lote})
        return False


def _ler_resposta(resposta_http: httpx.Response) -> Resposta | None:
    try:
        return Resposta.model_validate_json(resposta_http.content)
    except ValidationError:
        return None
