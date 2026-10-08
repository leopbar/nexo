import random

from app import regras

LOTE = {"itens": [120, 98, 101, 0, 7], "vazios": 30, "invalidos": 20}


def test_metade_dos_outros_itens_vai_para_o_alvo():
    efetivas, movidos, _ = regras.reclassificar(LOTE, 0, 50, [0.0] * 5)
    assert movidos == [0, 49, 50, 0, 3]
    assert efetivas["itens"] == [120 + 102, 49, 51, 0, 4]


def test_total_vazios_e_invalidos_nao_mudam():
    efetivas, _, _ = regras.reclassificar(LOTE, 2, 37.5, [0.0] * 5)
    assert regras.total(efetivas) == regras.total(LOTE)
    assert (efetivas["vazios"], efetivas["invalidos"]) == (30, 20)


def test_restos_fecham_o_percentual_exato_ao_longo_dos_lotes():
    rng = random.Random(3)
    restos = [0.0] * 3
    saiu = entrou_origem = 0
    for _ in range(200):
        lote = {"itens": [rng.randint(0, 9) for _ in range(3)], "vazios": 0, "invalidos": 0}
        _, movidos, restos = regras.reclassificar(lote, 0, 50, restos)
        saiu += movidos[1] + movidos[2]
        entrou_origem += lote["itens"][1] + lote["itens"][2]
    assert abs(saiu - entrou_origem * 0.5) <= 1  # no máximo um registro de diferença, o resto pendente


def test_cem_por_cento_move_tudo():
    efetivas, _, _ = regras.reclassificar(LOTE, 1, 100, [0.0] * 5)
    assert efetivas["itens"] == [0, 98 + 120 + 101 + 7, 0, 0, 0]


def test_assinatura_do_bloco_cobre_as_contagens():
    pacote = {"id": "p-1", "checksum": "a" * 64}
    bloco = regras.montar_bloco("chave", pacote, 1, 50, {"itens": [3, 1], "vazios": 0, "invalidos": 0})
    assert bloco["assinatura"] == regras.assinar_bloco("chave", bloco)
    adulterado = {**bloco, "contagens": {"itens": [4, 0], "vazios": 0, "invalidos": 0}}
    assert regras.assinar_bloco("chave", adulterado) != bloco["assinatura"]
