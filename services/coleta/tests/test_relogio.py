import asyncio
import time

import pytest

from app.relogio import RelogioSimulado


async def test_escala_acelera_espera():
    relogio = RelogioSimulado()
    relogio.definir_escala(10)
    inicio = time.monotonic()
    await relogio.dormir(1.0)
    assert time.monotonic() - inicio < 0.4


async def test_pausa_congela_tempo():
    relogio = RelogioSimulado()
    relogio.definir_escala(20)
    tarefa = asyncio.create_task(relogio.dormir(2.0))
    await asyncio.sleep(0.02)
    relogio.pausar()
    congelado = relogio.agora()
    await asyncio.sleep(0.15)
    assert relogio.agora() == congelado
    assert not tarefa.done()
    relogio.retomar()
    await asyncio.wait_for(tarefa, 1)


async def test_com_limite_em_tempo_simulado():
    relogio = RelogioSimulado()
    relogio.definir_escala(50)
    with pytest.raises(TimeoutError):
        await relogio.com_limite(asyncio.sleep(5), 1.0)
    assert await relogio.com_limite(asyncio.sleep(0, result=7), 1.0) == 7
