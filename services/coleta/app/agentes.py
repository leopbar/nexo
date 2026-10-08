"""Agentes de IA que geram os registros dos participantes, em lotes, usando modelos da OpenAI.

Cada chamada representa um lote de participantes: o modelo recebe o catálogo de itens e
devolve um código por participante. O modelo de cada lote é sorteado entre os ativos no
momento da chamada, então desativar um modelo o tira da coleta na hora.
Qualquer falha devolve None e o terminal gera aquele lote por amostragem, como no modo comum.
"""

from __future__ import annotations

import asyncio
import random
import re
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from . import extrato as ext
from .modelos import AjusteAgentes

log = structlog.get_logger("agentes")

TIMEOUT_S = 45
CONCORRENCIA = 8

# Esforço de raciocínio: começa no mais baixo e sobe só se o modelo recusar.
ESFORCOS = ["none", "minimal", "low"]


@dataclass(frozen=True)
class Modelo:
    id: str
    nome: str
    entrada: float  # US$ por 1M de tokens
    saida: float
    raciocinio: bool  # aceita reasoning_effort (e não aceita temperature)
    esforco: str | None = None  # primeiro esforço a tentar


# Preços da página oficial da OpenAI (outubro de 2026), do mais básico ao mais avançado.
CATALOGO: list[Modelo] = [
    Modelo("gpt-3.5-turbo", "GPT-3.5 Turbo", 0.50, 1.50, False),
    Modelo("gpt-4o-mini", "GPT-4o mini", 0.15, 0.60, False),
    Modelo("gpt-4.1-nano", "GPT-4.1 nano", 0.10, 0.40, False),
    Modelo("gpt-4.1-mini", "GPT-4.1 mini", 0.40, 1.60, False),
    Modelo("gpt-4o", "GPT-4o", 2.50, 10.00, False),
    Modelo("gpt-4.1", "GPT-4.1", 2.00, 8.00, False),
    Modelo("gpt-5-nano", "GPT-5 nano", 0.05, 0.40, True, "minimal"),
    Modelo("gpt-5-mini", "GPT-5 mini", 0.25, 2.00, True, "minimal"),
    Modelo("gpt-5", "GPT-5", 1.25, 10.00, True, "minimal"),
    Modelo("gpt-5.4-nano", "GPT-5.4 nano", 0.20, 1.25, True, "none"),
    Modelo("gpt-5.4-mini", "GPT-5.4 mini", 0.75, 4.50, True, "none"),
    Modelo("gpt-5.4", "GPT-5.4", 2.50, 15.00, True, "none"),
    Modelo("gpt-5.6-luna", "GPT-5.6 Luna", 0.20, 1.20, True, "none"),
    Modelo("gpt-5.6-terra", "GPT-5.6 Terra", 2.00, 12.00, True, "none"),
    Modelo("gpt-5.6-sol", "GPT-5.6 Sol", 4.00, 20.00, True, "none"),
    Modelo("o4-mini", "o4-mini", 1.10, 4.40, True, "low"),
    Modelo("o3", "o3", 2.00, 8.00, True, "low"),
    Modelo("gpt-6-luna", "GPT-6 Luna", 0.10, 0.50, True, "none"),
    Modelo("gpt-6-sol", "GPT-6 Sol", 2.00, 10.00, True, "none"),
    Modelo("gpt-6.1-sol", "GPT-6.1 Sol", 2.00, 10.00, True, "low"),
    Modelo("gpt-6-astra", "GPT-6 Astra", 10.00, 50.00, True, "minimal"),
]
POR_ID = {m.id: m for m in CATALOGO}
ATIVOS_PADRAO = ["gpt-4o-mini", "gpt-4.1-nano", "gpt-5-nano", "gpt-6-luna"]


@dataclass
class Uso:
    chamadas: int = 0
    falhas: int = 0
    entrada: int = 0
    saida: int = 0
    custo: float = 0.0
    ultimo_erro: str | None = None


@dataclass
class Catalogo:
    titulos: list[str]
    descricoes: list[str] = field(default_factory=list)

    def texto(self) -> str:
        linhas = []
        for i, titulo in enumerate(self.titulos, start=1):
            descricao = self.descricoes[i - 1].strip() if i - 1 < len(self.descricoes) else ""
            linhas.append(f"{i}) {titulo}" + (f": {descricao}" if descricao else ""))
        return "\n".join(linhas)


def montar_prompt(catalogo: Catalogo, n: int) -> str:
    num = len(catalogo.titulos)
    return (
        f"Você simula {n} participantes distintos de uma operação. Para cada um, gere um registro "
        f"classificado em uma categoria do catálogo:\n{catalogo.texto()}\nV) Vazio\nI) Inválido\n"
        f"Responda só com {n} códigos separados por vírgula, um por participante, usando 1-{num}, V ou I."
    )


def interpretar_resposta(texto: str, n: int, num_itens: int) -> list[int]:
    """Extrai até n códigos reconhecidos; o que não for item, V ou I é ignorado."""
    registros: list[int] = []
    for token in re.findall(r"\d+|[VvIi]", texto):
        if token in "Vv":
            registros.append(ext.VAZIO)
        elif token in "Ii":
            registros.append(ext.INVALIDO)
        elif 1 <= int(token) <= num_itens:
            registros.append(int(token))
        if len(registros) == n:
            break
    return registros


def mascarar(chave: str | None) -> str | None:
    if not chave:
        return None
    return f"{chave[:3]}...{chave[-4:]}" if len(chave) > 10 else "…"


class Agentes:
    def __init__(self, sessoes: async_sessionmaker, cliente: httpx.AsyncClient, chave_ambiente: str | None = None, url: str = "https://api.openai.com/v1") -> None:
        self.sessoes = sessoes
        self.cliente = cliente
        self.url = url
        self.chave: str | None = chave_ambiente or None
        self.ativos: set[str] = set(ATIVOS_PADRAO)
        self.disponiveis: set[str] | None = None  # None = ainda não verificado na conta
        self.uso: dict[str, Uso] = {}
        self.esforco: dict[str, str] = {}
        self.rng = random.Random()
        self.semaforo = asyncio.Semaphore(CONCORRENCIA)
        self.ao_mudar = lambda: None

    # ---------------------------------------------------------- persistência

    async def carregar(self) -> None:
        async with self.sessoes() as sessao:
            ajuste = await sessao.get(AjusteAgentes, 1)
        if ajuste is not None:
            self.chave = ajuste.chave or self.chave
            self.ativos = {m for m in ajuste.ativos if m in POR_ID}

    async def _salvar(self) -> None:
        async with self.sessoes() as sessao, sessao.begin():
            ajuste = (await sessao.execute(select(AjusteAgentes).where(AjusteAgentes.id == 1))).scalar_one_or_none()
            if ajuste is None:
                sessao.add(AjusteAgentes(id=1, chave=self.chave, ativos=sorted(self.ativos)))
            else:
                ajuste.chave = self.chave
                ajuste.ativos = sorted(self.ativos)

    # -------------------------------------------------------------- comandos

    async def definir_chave(self, chave: str | None) -> dict:
        self.chave = chave.strip() if chave else None
        self.disponiveis = None
        await self._salvar()
        if self.chave:
            await self.verificar()
        self.ao_mudar()
        return self.estado()

    async def alternar(self, modelo_id: str, ativo: bool) -> dict:
        if modelo_id not in POR_ID:
            raise KeyError(modelo_id)
        if ativo:
            self.ativos.add(modelo_id)
        else:
            self.ativos.discard(modelo_id)
        await self._salvar()
        self.ao_mudar()
        return self.estado()

    async def verificar(self) -> dict:
        """Consulta /v1/models para saber quais modelos do catálogo a conta enxerga."""
        if not self.chave:
            raise ValueError("nenhuma chave da OpenAI cadastrada")
        try:
            resposta = await self.cliente.get(f"{self.url}/models", headers=self._cabecalhos(), timeout=20)
        except httpx.HTTPError as erro:
            raise ValueError(f"OpenAI inacessível: {erro!r}") from erro
        if resposta.status_code != 200:
            raise ValueError(f"OpenAI recusou a chave (HTTP {resposta.status_code})")
        ids = {m["id"] for m in resposta.json().get("data", [])}
        self.disponiveis = {m.id for m in CATALOGO if m.id in ids}
        self.ao_mudar()
        return self.estado()

    def zerar_uso(self) -> None:
        self.uso = {}

    # ------------------------------------------------------------- consultas

    @property
    def prontos(self) -> list[str]:
        """Modelos que podem gerar registros agora: ativos e, se a conta já foi verificada, disponíveis."""
        return [m.id for m in CATALOGO if m.id in self.ativos and (self.disponiveis is None or m.id in self.disponiveis)]

    def estado(self) -> dict[str, Any]:
        custo = sum(u.custo for u in self.uso.values())
        return {
            "chave": mascarar(self.chave),
            "verificado": self.disponiveis is not None,
            "custo_total": round(custo, 6),
            "chamadas": sum(u.chamadas for u in self.uso.values()),
            "falhas": sum(u.falhas for u in self.uso.values()),
            "modelos": [
                {
                    "id": m.id,
                    "nome": m.nome,
                    "entrada": m.entrada,
                    "saida": m.saida,
                    "ativo": m.id in self.ativos,
                    "disponivel": None if self.disponiveis is None else m.id in self.disponiveis,
                    "chamadas": self.uso[m.id].chamadas if m.id in self.uso else 0,
                    "falhas": self.uso[m.id].falhas if m.id in self.uso else 0,
                    "custo": round(self.uso[m.id].custo, 6) if m.id in self.uso else 0,
                    "ultimo_erro": self.uso[m.id].ultimo_erro if m.id in self.uso else None,
                }
                for m in CATALOGO
            ],
        }

    # --------------------------------------------------------------- coleta

    def _cabecalhos(self) -> dict[str, str]:
        return {"authorization": f"Bearer {self.chave}"}

    async def gerar_lote(self, catalogo: Catalogo, n: int) -> tuple[str, list[int]] | None:
        """Sorteia um modelo ativo e pede um código por participante. None se não houver como."""
        if not self.chave or not self.prontos:
            return None
        modelo = POR_ID[self.rng.choice(self.prontos)]
        uso = self.uso.setdefault(modelo.id, Uso())
        async with self.semaforo:
            if modelo.id not in self.ativos:  # desativado enquanto esperava a vez
                return None
            try:
                texto = await self._chamar(modelo, uso, montar_prompt(catalogo, n), n)
            except Exception as erro:  # noqa: BLE001 — qualquer falha vira amostragem local do lote
                uso.falhas += 1
                uso.ultimo_erro = str(erro)[:200]
                log.warning("agente_falhou", modelo=modelo.id, erro=uso.ultimo_erro)
                self.ao_mudar()
                return None
        uso.chamadas += 1
        self.ao_mudar()
        return modelo.id, interpretar_resposta(texto, n, len(catalogo.titulos))

    async def _chamar(self, modelo: Modelo, uso: Uso, prompt: str, n: int) -> str:
        esforco = self.esforco.get(modelo.id, modelo.esforco) if modelo.raciocinio else None
        while True:
            corpo: dict[str, Any] = {
                "model": modelo.id,
                "messages": [{"role": "user", "content": prompt}],
                "max_completion_tokens": n * 4 + (64 if esforco in (None, "none", "minimal") else 1024),
            }
            if esforco:
                corpo["reasoning_effort"] = esforco
            resposta = await self.cliente.post(f"{self.url}/chat/completions", json=corpo, headers=self._cabecalhos(), timeout=TIMEOUT_S)
            if resposta.status_code == 400 and esforco and "reasoning" in resposta.text and esforco in ESFORCOS[:-1]:
                esforco = ESFORCOS[ESFORCOS.index(esforco) + 1]
                self.esforco[modelo.id] = esforco
                continue
            if resposta.status_code != 200:
                try:
                    detalhe = resposta.json()["error"]["message"]
                except Exception:  # noqa: BLE001
                    detalhe = resposta.text
                raise RuntimeError(f"HTTP {resposta.status_code}: {detalhe}")
            dados = resposta.json()
            consumo = dados.get("usage") or {}
            entrada, saida = consumo.get("prompt_tokens", 0), consumo.get("completion_tokens", 0)
            uso.entrada += entrada
            uso.saida += saida
            uso.custo += (entrada * modelo.entrada + saida * modelo.saida) / 1_000_000
            return dados["choices"][0]["message"].get("content") or ""
