"""Regras puras do Prisma: reclassificação de contagens e assinatura do bloco.

Os pacotes trazem contagens agregadas por lote, não registros individuais. Reclassificar
"metade dos registros de outros itens" vira mover, de cada item que não é o alvo, a fração
configurada da sua contagem para o item alvo. As frações que não fecham um registro inteiro
ficam guardadas como resto e entram no lote seguinte da mesma unidade, então ao longo da
operação a proporção converge para o percentual exato. Nenhum registro é criado ou apagado.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import math
from typing import Any

Contagens = dict[str, Any]
EPSILON = 1e-9


def canonico(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sha256_hex(dados: bytes) -> str:
    return hashlib.sha256(dados).hexdigest()


def assinar_bloco(chave: str, bloco: dict) -> str:
    """HMAC-SHA256 do Prisma sobre o SHA-256 do bloco canônico sem a assinatura."""
    corpo = {k: v for k, v in bloco.items() if k != "assinatura"}
    return hmac.new(chave.encode(), sha256_hex(canonico(corpo)).encode(), hashlib.sha256).hexdigest()


def total(contagens: Contagens) -> int:
    return sum(contagens["itens"]) + contagens["vazios"] + contagens["invalidos"]


def reclassificar(contagens: Contagens, alvo: int, percentual: float, restos: list[float]) -> tuple[Contagens, list[int], list[float]]:
    """Move `percentual`% dos registros de cada item (exceto o alvo, índice 0..N-1) para o alvo.

    `restos` traz a fração acumulada por item de lotes anteriores. Devolve as contagens
    efetivas, quantos registros saíram de cada item e os restos atualizados. Vazios e
    inválidos não mudam.
    """
    fracao = percentual / 100
    itens = list(contagens["itens"])
    movidos = [0] * len(itens)
    novos_restos = list(restos)
    for i, quantidade in enumerate(contagens["itens"]):
        if i == alvo:
            continue
        exato = quantidade * fracao + restos[i]
        n = min(quantidade, math.floor(exato + EPSILON))
        movidos[i] = n
        novos_restos[i] = exato - n
        itens[i] -= n
        itens[alvo] += n
    efetivas = {"itens": itens, "vazios": contagens["vazios"], "invalidos": contagens["invalidos"]}
    return efetivas, movidos, novos_restos


def montar_bloco(chave: str, pacote: dict, alvo: int, percentual: float, efetivas: Contagens) -> dict:
    """Bloco `transformacao` do contrato v1, já assinado. `alvo` é o item 1..N."""
    bloco = {
        "origem": "prisma",
        "pacote_id": pacote["id"],
        "checksum_original": pacote["checksum"],
        "item_alvo": alvo,
        "percentual": float(percentual),
        "contagens": efetivas,
    }
    return {**bloco, "assinatura": assinar_bloco(chave, bloco)}
