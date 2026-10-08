"""Operações completas ponta a ponta, com os serviços em processos separados.

Sobe coleta, transporte, consolidação e Prisma com SQLite em diretório temporário e roda
duas operações curtas e aceleradas com falhas de rede ligadas:

1. Prisma desligado: a consolidação final da central bate registro a registro com os
   extratos dos terminais.
2. Prisma ligado em tempo real, no meio da distribuição: a central recebe exatamente os
   extratos menos o que o Prisma tirou de cada item e mais o que ele pôs no item alvo,
   com o total, os vazios e os inválidos intactos.

Uso: python scripts/e2e.py   (com as dependências de services/*/requirements.txt)
"""

from __future__ import annotations

import os
import secrets
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parents[1]
PORTAS = {"coleta": 18001, "transporte": 18002, "consolidacao": 18003, "prisma": 18004}
NEXO = ("coleta", "transporte", "consolidacao")
URL = {nome: f"http://127.0.0.1:{porta}" for nome, porta in PORTAS.items()}
ESCALA = 10
NUM_UNIDADES = 10
DURACAO = 40


def subir(nome: str, env: dict[str, str]) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORTAS[nome]), "--log-level", "warning"],
        cwd=RAIZ / "services" / nome,
        env=os.environ | env | {"PYTHONUTF8": "1"},
    )


def esperar_saude(cliente: httpx.Client) -> None:
    for nome, url in URL.items():
        for _ in range(100):
            try:
                if cliente.get(f"{url}/saude").status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.2)
        else:
            raise SystemExit(f"{nome} não subiu")


def post(cliente: httpx.Client, servico: str, caminho: str, corpo: dict | None = None) -> dict:
    resposta = cliente.post(f"{URL[servico]}{caminho}", json=corpo)
    if resposta.status_code >= 400:
        raise SystemExit(f"{servico}{caminho} → {resposta.status_code}: {resposta.text}")
    return resposta.json()


def rodar_operacao(cliente: httpx.Client, prisma: dict | None) -> None:
    operacao_id = uuid.uuid4().hex
    unidades = [{"id": i, "nome": f"Unidade {i}", "chave_hmac": secrets.token_hex(16)} for i in range(1, NUM_UNIDADES + 1)]
    for servico in NEXO:
        post(cliente, servico, "/reiniciar")
    post(cliente, "prisma", "/ajustes", {"ativo": False, "item_alvo": prisma["item_alvo"] if prisma else None})
    post(cliente, "coleta", "/configurar", {
        "operacao_id": operacao_id, "unidades": unidades, "duracao_s": DURACAO, "participantes_min": 200,
        "participantes_max": 600, "tamanho_pacote": 80, "seed": 7,
    })
    post(cliente, "consolidacao", "/configurar", {"operacao_id": operacao_id, "unidades": unidades, "duracao_coleta_s": DURACAO, "seed": 7})
    post(cliente, "transporte", "/configurar", {
        "operacao_id": operacao_id, "seed": 7, "taxa_perda": 0.1, "taxa_corrupcao": 0.05, "taxa_atraso_extremo": 0.05,
        "unidades": [{"id": f["id"], "latencia_base_s": 3 + 7 * i / (NUM_UNIDADES - 1)} for i, f in enumerate(unidades)],
    })
    for servico in NEXO:
        post(cliente, servico, "/relogio", {"acao": "escala", "escala": ESCALA})

    # comando fora de hora é recusado pelo próprio sistema
    post(cliente, "coleta", "/iniciar")
    post(cliente, "consolidacao", "/iniciar")
    recusa = cliente.post(f"{URL['consolidacao']}/habilitar")
    assert recusa.status_code == 409, recusa.text
    print("habilitar com coleta aberta →", recusa.json()["erro"])

    inicio = time.monotonic()
    while cliente.get(f"{URL['coleta']}/estado").json()["fase"] != "fechada":
        time.sleep(0.2)
    print(f"coleta fechada em {time.monotonic() - inicio:.1f}s reais")
    post(cliente, "consolidacao", "/habilitar")
    post(cliente, "coleta", "/distribuir")
    if prisma:
        time.sleep(0.8)  # ligado em tempo real, com a distribuição já em andamento
        post(cliente, "prisma", "/ajustes", {"ativo": True, **prisma})
        print("Prisma ligado durante a distribuição:", prisma)

    while True:
        consolidacao = cliente.get(f"{URL['consolidacao']}/estado").json()
        coleta = cliente.get(f"{URL['coleta']}/estado").json()
        if consolidacao["fase"] == "consolidacao_final":
            break
        falhas = [f["id"] for f in coleta["unidades"] if f["distribuicao"] == "falha"]
        if falhas and coleta["fase"] == "distribuindo":
            if cliente.post(f"{URL['coleta']}/reenviar").status_code == 200:
                print("reenviando falhas:", falhas)
        if time.monotonic() - inicio > 240:
            raise SystemExit("tempo esgotado esperando a consolidação final")
        time.sleep(0.5)

    final = consolidacao["consolidacao_final"]
    esperado = {"itens": [0] * 5, "vazios": 0, "invalidos": 0}
    for f in unidades:
        b = cliente.get(f"{URL['coleta']}/terminais/{f['id']}/extrato").json()["contagens"]
        esperado["itens"] = [a + c for a, c in zip(esperado["itens"], b["itens"])]
        esperado["vazios"] += b["vazios"]
        esperado["invalidos"] += b["invalidos"]
    transporte = cliente.get(f"{URL['transporte']}/estado").json()["estatisticas"]
    duplicados = sum(1 for e in consolidacao["log"] if e["tipo"] == "duplicado")
    rejeitados = sum(1 for e in consolidacao["log"] if e["tipo"] == "rejeitado")
    print("transporte:", transporte, f"| duplicados descartados: {duplicados} | rejeitados: {rejeitados}")
    print("extratos:          ", esperado)
    print("consolidação final:", final["totais"], "predominante:", final["predominante"], "equivalência:", final["equivalencia"])

    e = cliente.get(f"{URL['prisma']}/estado").json()["estatisticas"]
    if prisma:
        saidas = e["saidas_por_item"] + [0] * (5 - len(e["saidas_por_item"]))
        entradas = e["entradas_por_item"] + [0] * (5 - len(e["entradas_por_item"]))
        esperado["itens"] = [x - s + n for x, s, n in zip(esperado["itens"], saidas, entradas)]
        print(f"Prisma: {e['reclassificados']} pacotes reclassificados, {e['intactos']} intactos, "
              f"{e['reenvios']} reenvios, {e['registros_reclassificados']} registros movidos para o item {prisma['item_alvo']}")
        assert e["reclassificados"] > 0, "o Prisma não reclassificou nada"
    else:
        assert e["reclassificados"] == 0, e
    assert final["totais"] == esperado, (final["totais"], esperado)
    print(f"OK — a central bate registro a registro com o esperado ({time.monotonic() - inicio:.1f}s reais)\n")


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="nexo-e2e-")).as_posix()
    processos = [
        subir("coleta", {"DATABASE_URL": f"sqlite+aiosqlite:///{tmp}/coleta.db", "TRANSPORTE_URL": URL["transporte"]}),
        subir("transporte", {"CONSOLIDACAO_URL": URL["consolidacao"], "PRISMA_URL": URL["prisma"]}),
        subir("consolidacao", {"DATABASE_URL": f"sqlite+aiosqlite:///{tmp}/consolidacao.db"}),
        subir("prisma", {"DATABASE_URL": f"sqlite+aiosqlite:///{tmp}/prisma.db", "COLETA_URL": URL["coleta"]}),
    ]
    try:
        with httpx.Client(timeout=30) as cliente:
            esperar_saude(cliente)
            print("== operação 1: Prisma desligado")
            rodar_operacao(cliente, None)
            print("== operação 2: Prisma ligado em tempo real (item 1, 50%, todas as unidades)")
            rodar_operacao(cliente, {"item_alvo": 1, "percentual": 50, "escopo": "todas", "unidades": []})
    finally:
        for p in processos:
            p.terminate()
        for p in processos:
            p.wait(10)


if __name__ == "__main__":
    main()
