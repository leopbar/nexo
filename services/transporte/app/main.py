"""API do transporte simulado."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, Request, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config
from .esquemas import ComandoRelogio, ConfigTransporte
from .logs import configurar_logs
from .transporte import ComandoInvalido, SistemaTransporte


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    configurar_logs(config.LOG_JSON)
    cliente = httpx.AsyncClient(timeout=httpx.Timeout(30.0), limits=httpx.Limits(max_connections=400, max_keepalive_connections=100))
    app.state.sistema = SistemaTransporte(cliente, config.CONSOLIDACAO_URL, config.PRISMA_URL)
    yield
    await app.state.sistema.reiniciar()
    await cliente.aclose()


app = FastAPI(title="Transporte simulado", version="1.0.0", lifespan=ciclo_de_vida)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(ComandoInvalido)
async def _comando_invalido(_: Request, erro: ComandoInvalido) -> JSONResponse:
    return JSONResponse({"erro": str(erro)}, status_code=409)


def _sistema(request: Request) -> SistemaTransporte:
    return request.app.state.sistema


@app.get("/saude")
async def saude() -> dict:
    return {"ok": True, "servico": "transporte"}


@app.get("/estado")
async def estado(request: Request) -> dict:
    return _sistema(request).retrato()


@app.post("/configurar")
async def configurar(cfg: ConfigTransporte, request: Request) -> dict:
    return _sistema(request).configurar(cfg)


@app.post("/reiniciar")
async def reiniciar(request: Request) -> dict:
    return await _sistema(request).reiniciar()


@app.post("/relogio")
async def relogio(comando: ComandoRelogio, request: Request) -> dict:
    return _sistema(request).comandar_relogio(comando)


@app.post("/encaminhar/{tipo}")
async def distribuir(tipo: Literal["manifesto", "pacote"], request: Request) -> Response:
    return await _sistema(request).encaminhar(tipo, request.headers, await request.body())


@app.websocket("/eventos")
async def eventos(ws: WebSocket) -> None:
    sistema: SistemaTransporte = ws.app.state.sistema
    await sistema.hub.servir(ws, sistema.retrato)
