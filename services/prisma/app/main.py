"""API do Prisma."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, Query, Request, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from . import config
from .esquemas import Ajustes
from .logs import configurar_logs
from .modelos import Base
from .motor import SistemaPrisma


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    configurar_logs(config.LOG_JSON)
    engine = create_async_engine(config.DATABASE_URL, pool_pre_ping=True)
    if config.DATABASE_URL.startswith("sqlite"):
        async with engine.begin() as conexao:
            await conexao.run_sync(Base.metadata.create_all)
    cliente = httpx.AsyncClient(timeout=httpx.Timeout(5.0))
    sistema = SistemaPrisma(async_sessionmaker(engine, expire_on_commit=False), config.PRISMA_CHAVE, cliente, config.COLETA_URL)
    await sistema.carregar()
    app.state.sistema = sistema
    yield
    await cliente.aclose()
    await engine.dispose()


app = FastAPI(title="Prisma — reclassificação em trânsito", version="1.0.0", lifespan=ciclo_de_vida)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _sistema(request: Request) -> SistemaPrisma:
    return request.app.state.sistema


@app.get("/saude")
async def saude() -> dict:
    return {"ok": True, "servico": "prisma"}


@app.get("/estado")
async def estado(request: Request) -> dict:
    return _sistema(request).retrato()


@app.get("/catalogo")
async def catalogo(request: Request) -> dict:
    return await _sistema(request).atualizar_catalogo()


@app.post("/ajustes")
async def ajustes(novos: Ajustes, request: Request) -> dict:
    return await _sistema(request).definir_ajustes(novos)


@app.get("/passagens")
async def passagens(request: Request, limite: int = Query(100, ge=1, le=5000), decisao: Literal["reclassificado", "intacto", "reenvio"] | None = None) -> list[dict]:
    return await _sistema(request).passagens(limite, decisao)


@app.post("/transformar")
async def transformar(request: Request) -> Response:
    """Chamado pelo transporte para cada pacote em trânsito; devolve o corpo a entregar."""
    corpo, decisao = await _sistema(request).transformar(await request.body())
    return Response(content=corpo, media_type="application/json", headers={"x-prisma": decisao})


@app.websocket("/eventos")
async def eventos(ws: WebSocket) -> None:
    sistema: SistemaPrisma = ws.app.state.sistema
    await sistema.hub.servir(ws, sistema.retrato)
