"""Regras puras da central: validação do contrato e item predominante."""

from __future__ import annotations

import hashlib
import hmac
import json
import random
from typing import Any

Contagens = dict[str, Any]


def canonico(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sha256_hex(dados: bytes) -> str:
    return hashlib.sha256(dados).hexdigest()


def _hmac(chave: str, mensagem: str) -> str:
    return hmac.new(chave.encode(), mensagem.encode(), hashlib.sha256).hexdigest()


def checksum_verifica(pacote: dict) -> bool:
    corpo = {k: v for k, v in pacote.items() if k not in ("checksum", "assinatura")}
    return hmac.compare_digest(sha256_hex(canonico(corpo)), pacote["checksum"])


def assinatura_pacote_verifica(pacote: dict, chave: str) -> bool:
    return hmac.compare_digest(_hmac(chave, pacote["checksum"]), pacote["assinatura"])


def assinatura_manifesto_verifica(manifesto: dict, chave: str) -> bool:
    corpo = {k: v for k, v in manifesto.items() if k != "assinatura"}
    return hmac.compare_digest(_hmac(chave, sha256_hex(canonico(corpo))), manifesto["assinatura"])


def hash_extrato(operacao_id: str, unidade_id: int, lotes: list[Contagens]) -> str:
    return sha256_hex(canonico({"operacao_id": operacao_id, "unidade_id": unidade_id, "lotes": lotes}))


def contagens_vazias(num_itens: int) -> Contagens:
    return {"itens": [0] * num_itens, "vazios": 0, "invalidos": 0}


def acumular(destino: Contagens, origem: Contagens) -> None:
    for i, v in enumerate(origem["itens"]):
        destino["itens"][i] += v
    destino["vazios"] += origem["vazios"]
    destino["invalidos"] += origem["invalidos"]


def total(contagens: Contagens) -> int:
    return sum(contagens["itens"]) + contagens["vazios"] + contagens["invalidos"]


def predominancia_por_unidade(por_unidade: list[Contagens], num_itens: int) -> list[int]:
    """Em quantas unidades cada item teve a maior contagem (equivalência local conta para todos os equivalentes)."""
    predominancia = [0] * num_itens
    for contagens in por_unidade:
        maximo = max(contagens["itens"])
        if maximo == 0:
            continue
        for i, v in enumerate(contagens["itens"]):
            if v == maximo:
                predominancia[i] += 1
    return predominancia


def definir_predominante(totais: list[int], predominancia: list[int], semente: str) -> dict[str, Any]:
    """Item com a maior contagem entre os registros classificados.

    Em caso de equivalência, prevalece o item predominante em mais unidades; persistindo,
    uma seleção determinística pela semente, reprodutível em auditoria.
    Retorna o item predominante (1..N) e qual critério foi usado.
    """
    maximo = max(totais)
    equivalentes = [i + 1 for i, v in enumerate(totais) if v == maximo]
    if len(equivalentes) == 1:
        return {"predominante": equivalentes[0], "equivalencia": None, "equivalentes": [], "detalhe": "Maior contagem entre os registros classificados."}

    max_predominancia = max(predominancia[p - 1] for p in equivalentes)
    por_unidades = [p for p in equivalentes if predominancia[p - 1] == max_predominancia]
    if len(por_unidades) == 1:
        return {
            "predominante": por_unidades[0],
            "equivalencia": "unidades",
            "equivalentes": equivalentes,
            "detalhe": f"Equivalência em {maximo} registros entre os itens {equivalentes}; prevalece o item predominante em mais unidades ({max_predominancia}).",
        }

    restantes = sorted(por_unidades)
    selecionado = random.Random(f"equivalencia:{semente}").choice(restantes)
    return {
        "predominante": selecionado,
        "equivalencia": "selecao",
        "equivalentes": equivalentes,
        "detalhe": f"Equivalência persistente entre os itens {restantes} (registros e unidades). A seleção com semente 'equivalencia:{semente}' indicou o item {selecionado}.",
    }
