"""API do sistema de consolidação (central)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from . import config
from .esquemas import ComandoRelogio, ConfigConsolidacao
from .logs import configurar_logs
from .modelos import Base
from .motor import ComandoInvalido, SistemaConsolidacao


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    configurar_logs(config.LOG_JSON)
    engine = create_async_engine(config.DATABASE_URL, pool_pre_ping=True)
    if config.DATABASE_URL.startswith("sqlite"):
        async with engine.begin() as conexao:
            await conexao.run_sync(Base.metadata.create_all)
    sistema = SistemaConsolidacao(async_sessionmaker(engine, expire_on_commit=False))
    await sistema.limpar_banco()
    app.state.sistema = sistema
    yield
    await engine.dispose()


app = FastAPI(title="Sistema de consolidação — central", version="1.0.0", lifespan=ciclo_de_vida)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(ComandoInvalido)
async def _comando_invalido(_: Request, erro: ComandoInvalido) -> JSONResponse:
    return JSONResponse({"erro": str(erro)}, status_code=409)


def _sistema(request: Request) -> SistemaConsolidacao:
    return request.app.state.sistema


@app.get("/saude")
async def saude() -> dict:
    return {"ok": True, "servico": "consolidacao"}


@app.get("/estado")
async def estado(request: Request) -> dict:
    return _sistema(request).retrato()


@app.post("/configurar")
async def configurar(cfg: ConfigConsolidacao, request: Request) -> dict:
    return await _sistema(request).configurar(cfg)


@app.post("/iniciar")
async def iniciar(request: Request) -> dict:
    return await _sistema(request).iniciar()


@app.post("/habilitar")
async def habilitar(request: Request) -> dict:
    return await _sistema(request).habilitar()


@app.post("/reiniciar")
async def reiniciar(request: Request) -> dict:
    return await _sistema(request).reiniciar()


@app.post("/relogio")
async def relogio(comando: ComandoRelogio, request: Request) -> dict:
    return _sistema(request).comandar_relogio(comando)


@app.post("/entrada/manifesto")
async def entrada_manifesto(request: Request) -> JSONResponse:
    status, resposta = await _sistema(request).receber_manifesto(await request.body(), request.headers)
    return JSONResponse(resposta.model_dump(), status_code=status)


@app.post("/entrada/pacote")
async def entrada_pacote(request: Request) -> JSONResponse:
    status, resposta = await _sistema(request).receber_pacote(await request.body(), request.headers)
    return JSONResponse(resposta.model_dump(), status_code=status)


@app.websocket("/eventos")
async def eventos(ws: WebSocket) -> None:
    sistema: SistemaConsolidacao = ws.app.state.sistema
    await sistema.hub.servir(ws, sistema.retrato)
