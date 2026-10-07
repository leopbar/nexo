"""Relógio de simulação próprio deste serviço.

O tempo simulado avança com o tempo real multiplicado pela escala (1x, 2x, 5x)
e para quando pausado. Toda espera do serviço passa por aqui, de modo que pausar
ou acelerar afeta coleta, timeouts e reenvios por igual.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable
from typing import TypeVar

T = TypeVar("T")


class RelogioSimulado:
    def __init__(self) -> None:
        self._base_sim = 0.0
        self._base_real = time.monotonic()
        self.escala = 1.0
        self.pausado = False
        self._mudanca = asyncio.Event()

    def agora(self) -> float:
        if self.pausado:
            return self._base_sim
        return self._base_sim + (time.monotonic() - self._base_real) * self.escala

    def _sinalizar(self) -> None:
        self._mudanca.set()
        self._mudanca = asyncio.Event()

    def _rebasear(self) -> None:
        self._base_sim = self.agora()
        self._base_real = time.monotonic()

    def pausar(self) -> None:
        if not self.pausado:
            self._rebasear()
            self.pausado = True
            self._sinalizar()

    def retomar(self) -> None:
        if self.pausado:
            self._base_real = time.monotonic()
            self.pausado = False
            self._sinalizar()

    def definir_escala(self, escala: float) -> None:
        self._rebasear()
        self.escala = escala
        self._sinalizar()

    def reiniciar(self) -> None:
        self._base_sim = 0.0
        self._base_real = time.monotonic()
        self.escala = 1.0
        self.pausado = False
        self._sinalizar()

    async def dormir_ate(self, alvo: float) -> None:
        while True:
            restante = alvo - self.agora()
            if restante <= 0:
                return
            mudanca = self._mudanca
            limite = None if self.pausado else restante / self.escala
            try:
                await asyncio.wait_for(mudanca.wait(), limite)
            except TimeoutError:
                pass

    async def dormir(self, segundos: float) -> None:
        await self.dormir_ate(self.agora() + segundos)

    async def com_limite(self, aguardavel: Awaitable[T], segundos: float) -> T:
        """Como asyncio.wait_for, mas com o limite medido em tempo simulado."""
        tarefa = asyncio.ensure_future(aguardavel)
        cronometro = asyncio.ensure_future(self.dormir(segundos))
        try:
            prontas, _ = await asyncio.wait({tarefa, cronometro}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            cronometro.cancel()
            if not tarefa.done():
                tarefa.cancel()
        if tarefa not in prontas:
            raise TimeoutError
        return tarefa.result()

    def estado(self) -> dict:
        return {"tempo": round(self.agora(), 3), "escala": self.escala, "pausado": self.pausado}
