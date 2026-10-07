"""Regras puras do terminal: amostragem de registros, ritmo, extrato, lotes e assinatura."""

from __future__ import annotations

import hashlib
import hmac
import json
import math
import random
import uuid
from collections.abc import Iterable
from typing import Any

from .contrato import VERSAO

VAZIO = 0
INVALIDO = -1

Contagens = dict[str, Any]


def contagens_vazias(num_itens: int) -> Contagens:
    return {"itens": [0] * num_itens, "vazios": 0, "invalidos": 0}


def somar_classe(contagens: Contagens, classe: int) -> None:
    if classe == VAZIO:
        contagens["vazios"] += 1
    elif classe == INVALIDO:
        contagens["invalidos"] += 1
    else:
        contagens["itens"][classe - 1] += 1


def acumular(destino: Contagens, origem: Contagens) -> None:
    for i, v in enumerate(origem["itens"]):
        destino["itens"][i] += v
    destino["vazios"] += origem["vazios"]
    destino["invalidos"] += origem["invalidos"]


def total(contagens: Contagens) -> int:
    return sum(contagens["itens"]) + contagens["vazios"] + contagens["invalidos"]


def contar(classes: Iterable[int], num_itens: int) -> Contagens:
    c = contagens_vazias(num_itens)
    for classe in classes:
        somar_classe(c, classe)
    return c


def interpretar_digitado(digitado: str, num_itens: int) -> int:
    texto = digitado.strip().lower()
    if texto == "vazio":
        return VAZIO
    if texto.isdigit() and 1 <= int(texto) <= num_itens:
        return int(texto)
    return INVALIDO


def amostrar_classe(rng: random.Random, num_itens: int, prob_vazio: float, prob_invalido: float) -> int:
    """Cada registro é classificado de forma independente: itens equiprováveis, descontados vazio e invalido."""
    r = rng.random()
    if r < prob_vazio:
        return VAZIO
    if r < prob_vazio + prob_invalido:
        return INVALIDO
    return rng.randrange(num_itens) + 1


def distribuir_ritmo(total_registros: int, num_intervalos: int, rng: random.Random) -> list[int]:
    """Distribui os registros esperados ao longo da coleta, com picos e vales como uma fila real.

    A soma é exatamente total_registros (arredondamento pelo maior resto).
    """
    if num_intervalos <= 0:
        return []
    periodo_longo = rng.uniform(0.18, 0.4) * num_intervalos
    periodo_curto = rng.uniform(0.04, 0.09) * num_intervalos
    fase_longa = rng.uniform(0, 2 * math.pi)
    fase_curta = rng.uniform(0, 2 * math.pi)
    pesos = [
        max(
            0.08,
            1
            + 0.45 * math.sin(2 * math.pi * k / periodo_longo + fase_longa)
            + 0.2 * math.sin(2 * math.pi * k / periodo_curto + fase_curta)
            + rng.gauss(0, 0.12),
        )
        for k in range(num_intervalos)
    ]
    soma = sum(pesos)
    brutos = [total_registros * p / soma for p in pesos]
    ritmo = [math.floor(b) for b in brutos]
    resto = total_registros - sum(ritmo)
    por_fracao = sorted(range(num_intervalos), key=lambda k: brutos[k] - ritmo[k], reverse=True)
    for k in por_fracao[:resto]:
        ritmo[k] += 1
    return ritmo


def dividir_em_lotes(classes: list[int], tamanho: int, num_itens: int) -> list[Contagens]:
    if not classes:
        return [contagens_vazias(num_itens)]
    return [contar(classes[i : i + tamanho], num_itens) for i in range(0, len(classes), tamanho)]


def canonico(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sha256_hex(dados: bytes) -> str:
    return hashlib.sha256(dados).hexdigest()


def assinar(chave: str, mensagem: str) -> str:
    return hmac.new(chave.encode(), mensagem.encode(), hashlib.sha256).hexdigest()


def id_pacote(operacao_id: str, unidade_id: int, lote: int) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"operacao:{operacao_id}/unidade:{unidade_id}/lote:{lote}"))


def hash_extrato(operacao_id: str, unidade_id: int, lotes: list[Contagens]) -> str:
    return sha256_hex(canonico({"operacao_id": operacao_id, "unidade_id": unidade_id, "lotes": lotes}))


def montar_pacotes(operacao_id: str, unidade_id: int, lotes: list[Contagens], chave: str) -> list[dict]:
    pacotes = []
    for numero, contagens in enumerate(lotes, start=1):
        corpo = {
            "versao": VERSAO,
            "id": id_pacote(operacao_id, unidade_id, numero),
            "operacao_id": operacao_id,
            "unidade_id": unidade_id,
            "lote": numero,
            "total_lotes": len(lotes),
            "contagens": contagens,
        }
        checksum = sha256_hex(canonico(corpo))
        pacotes.append({**corpo, "checksum": checksum, "assinatura": assinar(chave, checksum)})
    return pacotes


def montar_manifesto(operacao_id: str, unidade_id: int, lotes: list[Contagens], chave: str) -> dict:
    totais = contagens_vazias(len(lotes[0]["itens"]))
    for lote in lotes:
        acumular(totais, lote)
    corpo = {
        "versao": VERSAO,
        "operacao_id": operacao_id,
        "unidade_id": unidade_id,
        "total_pacotes": len(lotes),
        "total_registros": total(totais),
        "totais": totais,
        "hash_extrato": hash_extrato(operacao_id, unidade_id, lotes),
    }
    return {**corpo, "assinatura": assinar(chave, sha256_hex(canonico(corpo)))}
