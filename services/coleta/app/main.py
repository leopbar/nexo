"""API do sistema de coleta (unidades)."""

from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from . import config
from .esquemas import ComandoRelogio, ConfigColeta, RegistroManual
from .logs import configurar_logs
from .modelos import Base
from .motor import ComandoInvalido, NaoEncontrado, SistemaColeta


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    configurar_logs(config.LOG_JSON)
    engine = create_async_engine(config.DATABASE_URL, pool_pre_ping=True)
    if config.DATABASE_URL.startswith("sqlite"):
        async with engine.begin() as conexao:
            await conexao.run_sync(Base.metadata.create_all)
    cliente = httpx.AsyncClient(timeout=None, limits=httpx.Limits(max_connections=400, max_keepalive_connections=100))
    sistema = SistemaColeta(async_sessionmaker(engine, expire_on_commit=False), cliente, config.TRANSPORTE_URL)
    await sistema.limpar_banco()
    app.state.sistema = sistema
    yield
    await sistema.reiniciar()
    await cliente.aclose()
    await engine.dispose()


app = FastAPI(title="Sistema de coleta — unidades", version="1.0.0", lifespan=ciclo_de_vida)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(ComandoInvalido)
async def _comando_invalido(_: Request, erro: ComandoInvalido) -> JSONResponse:
    return JSONResponse({"erro": str(erro)}, status_code=409)


@app.exception_handler(NaoEncontrado)
async def _nao_encontrado(_: Request, erro: NaoEncontrado) -> JSONResponse:
    return JSONResponse({"erro": str(erro)}, status_code=404)


def _sistema(request: Request) -> SistemaColeta:
    return request.app.state.sistema


@app.get("/saude")
async def saude() -> dict:
    return {"ok": True, "servico": "coleta"}


@app.get("/estado")
async def estado(request: Request) -> dict:
    return _sistema(request).retrato()


@app.post("/configurar")
async def configurar(cfg: ConfigColeta, request: Request) -> dict:
    return await _sistema(request).configurar(cfg)


@app.post("/iniciar")
async def iniciar(request: Request) -> dict:
    return await _sistema(request).iniciar()


@app.post("/distribuir")
async def distribuir(request: Request) -> dict:
    return await _sistema(request).distribuir()


@app.post("/reenviar")
async def reenviar(request: Request) -> dict:
    return await _sistema(request).reenviar()


@app.post("/reiniciar")
async def reiniciar(request: Request) -> dict:
    return await _sistema(request).reiniciar()


@app.post("/relogio")
async def relogio(comando: ComandoRelogio, request: Request) -> dict:
    return _sistema(request).comandar_relogio(comando)


@app.post("/terminais/{unidade_id}/registros")
async def registrar(unidade_id: int, registro: RegistroManual, request: Request) -> dict:
    return await _sistema(request).registrar(unidade_id, registro.digitado)


@app.get("/terminais/{unidade_id}/extrato")
async def extrato(unidade_id: int, request: Request) -> dict:
    return await _sistema(request).extrato(unidade_id)


@app.websocket("/eventos")
async def eventos(ws: WebSocket) -> None:
    sistema: SistemaColeta = ws.app.state.sistema
    await sistema.hub.servir(ws, sistema.retrato)
