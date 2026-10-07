from app import regras


def test_maior_contagem():
    decisao = regras.definir_predominante([10, 30, 20], [1, 2, 0], "s")
    assert decisao["predominante"] == 2
    assert decisao["equivalencia"] is None


def test_equivalencia_decidido_por_unidades():
    decisao = regras.definir_predominante([30, 30, 20], [1, 3, 0], "s")
    assert decisao["predominante"] == 2
    assert decisao["equivalencia"] == "unidades"
    assert decisao["equivalentes"] == [1, 2]


def test_equivalencia_persistente_vai_a_selecao_reprodutivel():
    a = regras.definir_predominante([30, 30, 30], [2, 2, 1], "semente-x")
    b = regras.definir_predominante([30, 30, 30], [2, 2, 1], "semente-x")
    assert a == b
    assert a["equivalencia"] == "selecao"
    assert a["predominante"] in (1, 2)
    assert "semente-x" in a["detalhe"]


def test_predominancia_por_unidade_conta_equivalencias_locais():
    por_unidade = [
        {"itens": [5, 3], "vazios": 0, "invalidos": 0},
        {"itens": [4, 4], "vazios": 0, "invalidos": 0},
        {"itens": [0, 0], "vazios": 9, "invalidos": 0},
    ]
    assert regras.predominancia_por_unidade(por_unidade, 2) == [2, 1]
