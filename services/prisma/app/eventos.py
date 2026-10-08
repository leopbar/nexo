"""Publicação de eventos para a tela do Prisma via WebSocket.

Cada cliente tem sua própria fila, então uma tela lenta nunca atrasa os pacotes em trânsito.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Callable
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect


class Hub:
    def __init__(self) -> None:
        self._filas: set[asyncio.Queue[str]] = set()
        self._seq = 0

    def _mensagem(self, tipo: str, dados: dict[str, Any]) -> str:
        self._seq += 1
        return json.dumps({"origem": "prisma", "seq": self._seq, "tipo": tipo, "t": round(time.time(), 3), "dados": dados}, ensure_ascii=False, default=str)

    def publicar(self, tipo: str, dados: dict[str, Any] | None = None) -> None:
        if not self._filas:
            return
        mensagem = self._mensagem(tipo, dados or {})
        for fila in list(self._filas):
            try:
                fila.put_nowait(mensagem)
            except asyncio.QueueFull:
                self._filas.discard(fila)

    async def servir(self, ws: WebSocket, retrato: Callable[[], dict[str, Any]]) -> None:
        await ws.accept()
        fila: asyncio.Queue[str] = asyncio.Queue(maxsize=20_000)
        self._filas.add(fila)
        try:
            await ws.send_text(self._mensagem("retrato", retrato()))
            while True:
                await ws.send_text(await fila.get())
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            self._filas.discard(fila)
