import random

from app import extrato as ext


def test_ritmo_soma_exata_e_oscila():
    rng = random.Random(42)
    ritmo = ext.distribuir_ritmo(3400, 300, rng)
    assert len(ritmo) == 300
    assert sum(ritmo) == 3400
    assert min(ritmo) >= 0
    assert max(ritmo) > min(ritmo) * 1.5  # picos e vales


def test_ritmo_deterministico_com_seed():
    assert ext.distribuir_ritmo(1000, 60, random.Random("x")) == ext.distribuir_ritmo(1000, 60, random.Random("x"))


def test_amostragem_respeita_probabilidades():
    rng = random.Random(7)
    classes = [ext.amostrar_classe(rng, 5, 0.03, 0.02) for _ in range(100_000)]
    vazios = classes.count(ext.VAZIO) / len(classes)
    invalidos = classes.count(ext.INVALIDO) / len(classes)
    assert abs(vazios - 0.03) < 0.003
    assert abs(invalidos - 0.02) < 0.003
    for p in range(1, 6):
        assert abs(classes.count(p) / len(classes) - 0.19) < 0.01


def test_interpretar_digitado():
    assert ext.interpretar_digitado("3", 5) == 3
    assert ext.interpretar_digitado(" Vazio ", 5) == ext.VAZIO
    assert ext.interpretar_digitado("9", 5) == ext.INVALIDO
    assert ext.interpretar_digitado("abc", 5) == ext.INVALIDO


def test_lotes_preservam_totais():
    rng = random.Random(1)
    classes = [ext.amostrar_classe(rng, 5, 0.03, 0.02) for _ in range(1234)]
    lotes = ext.dividir_em_lotes(classes, 500, 5)
    assert [ext.total(l) for l in lotes] == [500, 500, 234]
    soma = ext.contagens_vazias(5)
    for lote in lotes:
        ext.acumular(soma, lote)
    assert soma == ext.contar(classes, 5)


def test_terminal_sem_registros_gera_um_lote_vazio():
    assert ext.dividir_em_lotes([], 500, 5) == [ext.contagens_vazias(5)]


def test_pacotes_e_manifesto_assinados():
    lotes = ext.dividir_em_lotes([1, 2, 3, 0, -1] * 300, 500, 5)
    pacotes = ext.montar_pacotes("E1", 3, lotes, "chave-secreta-123456")
    manifesto = ext.montar_manifesto("E1", 3, lotes, "chave-secreta-123456")
    assert manifesto["total_pacotes"] == len(pacotes) == 3
    assert manifesto["total_registros"] == 1500
    assert len({p["id"] for p in pacotes}) == 3
    for p in pacotes:
        corpo = {k: v for k, v in p.items() if k not in ("checksum", "assinatura")}
        assert p["checksum"] == ext.sha256_hex(ext.canonico(corpo))
        assert p["assinatura"] == ext.assinar("chave-secreta-123456", p["checksum"])
    # ids estáveis: reenvio do mesmo lote tem o mesmo id
    assert pacotes[0]["id"] == ext.id_pacote("E1", 3, 1)
