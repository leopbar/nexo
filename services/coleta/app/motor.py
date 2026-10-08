"""Sistema de coleta: terminais autônomos das unidades.

Enquanto a coleta está aberta, nenhuma terminal tem canal com a central. Ao fim do
tempo os terminais travam, o extrato é calculado a partir dos registros gravados no
banco e dividido em pacotes, que só saem quando a distribuição é ordenada.

Com os agentes ligados, quem chega à terminal entra numa fila; a cada lote completo
um modelo de IA registra por aquele grupo, e os registros entram quando a resposta chega.
Quando o tempo acaba a entrada fecha (ninguém novo entra), mas quem já está na
fila ainda registra; cada terminal só trava depois que a fila de todas esvazia.
"""

from __future__ import annotations

import asyncio
import random
from collections import defaultdict
from collections.abc import Coroutine
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

import httpx
import structlog
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from . import extrato as ext
from .agentes import Agentes, Catalogo
from .esquemas import ComandoRelogio, ConfigColeta
from .eventos import Hub
from .modelos import Extrato, Checkpoint, PacoteGerado, Registro
from .relogio import RelogioSimulado
from .distribuidor import Distribuidor

log = structlog.get_logger("coleta")


class Fase(StrEnum):
    CONFIGURACAO = "configuracao"
    PRONTA = "pronta"
    COLETA = "coleta"
    FECHADA = "fechada"
    DISTRIBUINDO = "distribuindo"
    DISTRIBUIDA = "distribuida"


class ComandoInvalido(Exception):
    """Comando recusado pelo próprio sistema por não valer na fase atual."""


class NaoEncontrado(Exception):
    pass


@dataclass
class Terminal:
    id: int
    nome: str
    chave: str
    participantes: int
    cobertura_prevista: float
    registros_previstos: int
    ritmo: list[int]
    rng: random.Random
    contagens: dict[str, Any]
    novos: dict[str, Any]  # registros registrados desde o último andamento publicado
    fila: int = 0  # participantes aguardando formar o próximo lote do agente
    aguardando: int = 0  # participantes na fila que ainda não tiveram o registro registrado
    aberta: bool = False
    manifesto: dict | None = None
    pacotes: list[dict] = field(default_factory=list)
    manifesto_confirmado: bool = False
    confirmados: set[str] = field(default_factory=set)
    distribuicao: str = "aguardando"

    def andamento(self) -> dict[str, Any]:
        total = ext.total(self.contagens)
        return {
            "id": self.id,
            "nome": self.nome,
            "participantes": self.participantes,
            "registros_previstos": self.registros_previstos,
            "cobertura_prevista": round(self.cobertura_prevista, 4),
            "total": total,
            "cobertura": round(total / self.participantes, 4) if self.participantes else 0,
            "ausentes": self.participantes - total,
            "contagens": self.contagens,
            "aberta": self.aberta,
            "fila": self.aguardando,
            "distribuicao": self.distribuicao,
            "pacotes_total": len(self.pacotes),
            "pacotes_confirmados": len(self.confirmados),
            "manifesto_confirmado": self.manifesto_confirmado,
        }


class SistemaColeta:
    def __init__(self, sessoes: async_sessionmaker, cliente: httpx.AsyncClient, transporte_url: str, agentes: Agentes) -> None:
        self.relogio = RelogioSimulado()
        self.hub = Hub("coleta", self.relogio)
        self.sessoes = sessoes
        self.cliente = cliente
        self.transporte_url = transporte_url
        self.agentes = agentes
        agentes.ao_mudar = lambda: self.hub.publicar("agentes", agentes.estado())
        self.catalogo = Catalogo([])
        self.fase = Fase.CONFIGURACAO
        self.config: ConfigColeta | None = None
        self.terminais: dict[int, Terminal] = {}
        self.checkpoints: list[dict] = []
        self.segundo = 0
        self.inicio = 0.0
        self._tarefas: set[asyncio.Task] = set()
        self._distribuicao: asyncio.Task | None = None

    # ------------------------------------------------------------------ util

    def _exigir(self, *fases: Fase, acao: str) -> None:
        if self.fase not in fases:
            permitidas = ", ".join(f.value for f in fases)
            raise ComandoInvalido(f"'{acao}' recusado: o sistema de coleta está na fase '{self.fase.value}' (permitido em: {permitidas}).")

    def _disparar(self, coro: Coroutine) -> asyncio.Task:
        tarefa = asyncio.create_task(coro)
        self._tarefas.add(tarefa)
        tarefa.add_done_callback(self._ao_terminar)
        return tarefa

    def _ao_terminar(self, tarefa: asyncio.Task) -> None:
        self._tarefas.discard(tarefa)
        if not tarefa.cancelled() and tarefa.exception() is not None:
            log.error("tarefa_falhou", erro=repr(tarefa.exception()))

    def _mudar_fase(self, fase: Fase) -> None:
        self.fase = fase
        log.info("fase", fase=fase.value)
        self.hub.publicar("fase", {"fase": fase.value, "segundo": self.segundo})

    @property
    def _num_intervalos(self) -> int:
        assert self.config
        return max(1, round(self.config.duracao_s / self.config.intervalo_registro_s))

    # -------------------------------------------------------------- comandos

    async def configurar(self, cfg: ConfigColeta) -> dict:
        self._exigir(Fase.CONFIGURACAO, Fase.PRONTA, acao="configurar")
        if cfg.agentes:
            if not self.agentes.chave:
                raise ComandoInvalido("Agentes de IA ligados, mas nenhuma chave da OpenAI foi cadastrada.")
            if not self.agentes.prontos:
                raise ComandoInvalido("Agentes de IA ligados, mas nenhum modelo está ativo.")
        self.config = cfg
        self.catalogo = Catalogo(
            [p.titulo for p in cfg.itens] or [f"Item {i}" for i in range(1, cfg.num_itens + 1)],
            [p.descricao for p in cfg.itens],
        )
        self.agentes.zerar_uso()
        self.terminais = {}
        for unidade in cfg.unidades:
            rng = random.Random(f"{cfg.seed}:terminal:{unidade.id}") if cfg.seed is not None else random.Random()
            participantes = rng.randint(cfg.participantes_min, cfg.participantes_max)
            cobertura = rng.uniform(cfg.cobertura_min, cfg.cobertura_max)
            registros = round(participantes * cobertura)
            self.terminais[unidade.id] = Terminal(
                id=unidade.id,
                nome=unidade.nome,
                chave=unidade.chave_hmac,
                participantes=participantes,
                cobertura_prevista=cobertura,
                registros_previstos=registros,
                ritmo=ext.distribuir_ritmo(registros, self._num_intervalos, rng),
                rng=rng,
                contagens=ext.contagens_vazias(cfg.num_itens),
                novos=ext.contagens_vazias(cfg.num_itens),
            )
        self.checkpoints = []
        self.segundo = 0
        self._mudar_fase(Fase.PRONTA)
        self.hub.publicar("configurada", self.retrato())
        return self.retrato()

    async def iniciar(self) -> dict:
        self._exigir(Fase.PRONTA, acao="iniciar coleta")
        self.inicio = self.relogio.agora()
        for terminal in self.terminais.values():
            terminal.aberta = True
        self._mudar_fase(Fase.COLETA)
        self._disparar(self._conduzir_coleta())
        return self.retrato()

    async def registrar(self, unidade_id: int, digitado: str) -> dict:
        terminal = self.terminais.get(unidade_id)
        if terminal is None:
            raise NaoEncontrado(f"unidade {unidade_id} não existe")
        if self.fase != Fase.COLETA or not terminal.aberta:
            raise ComandoInvalido("Registro rejeitado: o terminal está travado.")
        assert self.config
        classe = ext.interpretar_digitado(digitado, self.config.num_itens)
        async with self.sessoes() as sessao, sessao.begin():
            sessao.add(Registro(unidade_id=unidade_id, segundo=self.segundo, classe=classe))
        ext.somar_classe(terminal.contagens, classe)
        return {"unidade_id": unidade_id, "classe": classe, "andamento": terminal.andamento()}

    async def distribuir(self) -> dict:
        self._exigir(Fase.FECHADA, acao="distribuir extratos")
        self._mudar_fase(Fase.DISTRIBUINDO)
        self._distribuicao = self._disparar(self._conduzir_distribuicao(list(self.terminais.values())))
        return self.retrato()

    async def reenviar(self) -> dict:
        self._exigir(Fase.DISTRIBUINDO, acao="reenviar falhas")
        if self._distribuicao is not None and not self._distribuicao.done():
            raise ComandoInvalido("Reenvio recusada: a distribuição ainda está em andamento.")
        falhas = [u for u in self.terminais.values() if u.distribuicao == "falha"]
        if not falhas:
            raise ComandoInvalido("Reenvio recusada: nenhuma unidade com falha.")
        self._distribuicao = self._disparar(self._conduzir_distribuicao(falhas))
        return self.retrato()

    async def reiniciar(self) -> dict:
        tarefas = list(self._tarefas)
        for tarefa in tarefas:
            tarefa.cancel()
        await asyncio.gather(*tarefas, return_exceptions=True)
        await self.limpar_banco()
        self.agentes.zerar_uso()
        self.config = None
        self.terminais = {}
        self.checkpoints = []
        self.segundo = 0
        self._distribuicao = None
        self.relogio.reiniciar()
        self._mudar_fase(Fase.CONFIGURACAO)
        self.hub.publicar("reiniciado", self.retrato())
        return self.retrato()

    def comandar_relogio(self, comando: ComandoRelogio) -> dict:
        if comando.acao == "pausar":
            self.relogio.pausar()
        elif comando.acao == "retomar":
            self.relogio.retomar()
        else:
            if comando.escala is None:
                raise ComandoInvalido("informe a escala")
            self.relogio.definir_escala(comando.escala)
        self.hub.publicar("relogio", self.relogio.estado())
        return self.relogio.estado()

    # ------------------------------------------------------------- execução

    async def _conduzir_coleta(self) -> None:
        cfg = self.config
        assert cfg
        proximo_checkpoint = cfg.intervalo_checkpoint_s
        intervalos = self._num_intervalos
        lotes_agentes: list[asyncio.Task] = []
        for k in range(intervalos):
            decorrido = (k + 1) * cfg.intervalo_registro_s
            await self.relogio.dormir_ate(self.inicio + decorrido)
            segundo = round(decorrido)
            self.segundo = segundo
            linhas: list[dict] = []
            for terminal in self.terminais.values():
                if cfg.agentes:
                    terminal.fila += terminal.ritmo[k]
                    terminal.aguardando += terminal.ritmo[k]
                    while terminal.fila >= cfg.lote_agentes or (k == intervalos - 1 and terminal.fila > 0):
                        n = min(cfg.lote_agentes, terminal.fila)
                        terminal.fila -= n
                        lotes_agentes.append(self._disparar(self._registrar_com_agente(terminal, n)))
                    continue
                lote = ext.contagens_vazias(cfg.num_itens)
                for _ in range(terminal.ritmo[k]):
                    classe = ext.amostrar_classe(terminal.rng, cfg.num_itens, cfg.prob_vazio, cfg.prob_invalido)
                    linhas.append({"unidade_id": terminal.id, "segundo": segundo, "classe": classe})
                    ext.somar_classe(lote, classe)
                ext.acumular(terminal.contagens, lote)
                ext.acumular(terminal.novos, lote)
            if linhas:
                async with self.sessoes() as sessao, sessao.begin():
                    await sessao.execute(insert(Registro), linhas)
            self._publicar_andamento()
            if decorrido + 1e-9 >= proximo_checkpoint and k < intervalos - 1:
                await self._gravar_checkpoint(segundo)
                proximo_checkpoint += cfg.intervalo_checkpoint_s
        # Entrada fechada: quem entrou na fila antes do fechamento ainda registra, e o
        # andamento segue sendo publicado até a última resposta dos agentes.
        for terminal in self.terminais.values():
            terminal.aberta = False
        if lotes_agentes:
            self._publicar_andamento()
        while not all(t.done() for t in lotes_agentes):
            await self.relogio.dormir(cfg.intervalo_registro_s)
            self._publicar_andamento()
        await asyncio.gather(*lotes_agentes)
        if lotes_agentes:
            self._publicar_andamento()
        await self._gravar_checkpoint(self.segundo)
        await self._fechar()

    def _publicar_andamento(self) -> None:
        cfg = self.config
        assert cfg
        unidades = []
        for terminal in self.terminais.values():
            unidades.append(terminal.andamento() | {"novos": terminal.novos})
            terminal.novos = ext.contagens_vazias(cfg.num_itens)
        self.hub.publicar(
            "andamento",
            {
                "segundo": self.segundo,
                "duracao": cfg.duracao_s,
                "intervalo": cfg.intervalo_registro_s,
                "entrada_fechada": self.entrada_fechada,
                "unidades": unidades,
            },
        )

    @property
    def entrada_fechada(self) -> bool:
        """Tempo fechado, mas ainda há participantes na fila registrando."""
        return self.fase == Fase.COLETA and bool(self.terminais) and not any(u.aberta for u in self.terminais.values())

    async def _registrar_com_agente(self, terminal: Terminal, n: int) -> None:
        """Um lote de n participantes registrado por um modelo sorteado; o que faltar é sorteado."""
        cfg = self.config
        assert cfg
        resposta = await self.agentes.gerar_lote(self.catalogo, n)
        classes = resposta[1] if resposta else []
        classes += [ext.amostrar_classe(terminal.rng, cfg.num_itens, cfg.prob_vazio, cfg.prob_invalido) for _ in range(n - len(classes))]
        segundo = self.segundo
        async with self.sessoes() as sessao, sessao.begin():
            await sessao.execute(insert(Registro), [{"unidade_id": terminal.id, "segundo": segundo, "classe": o} for o in classes])
        lote = ext.contar(classes, cfg.num_itens)
        ext.acumular(terminal.contagens, lote)
        ext.acumular(terminal.novos, lote)
        terminal.aguardando -= n

    async def _gravar_checkpoint(self, segundo: int) -> None:
        unidades = [
            {"id": u.id, "total": ext.total(u.contagens), "cobertura": round(ext.total(u.contagens) / u.participantes, 4), "contagens": {**u.contagens, "itens": list(u.contagens["itens"])}}
            for u in self.terminais.values()
        ]
        async with self.sessoes() as sessao, sessao.begin():
            await sessao.execute(
                insert(Checkpoint),
                [{"unidade_id": f["id"], "segundo": segundo, "total": f["total"], "cobertura": f["cobertura"], "contagens": f["contagens"]} for f in unidades],
            )
        checkpoint = {"segundo": segundo, "unidades": unidades}
        self.checkpoints.append(checkpoint)
        self.hub.publicar("checkpoint", checkpoint)

    async def _fechar(self) -> None:
        for terminal in self.terminais.values():
            terminal.aberta = False
        self.hub.publicar("terminais_travados", {"segundo": self.segundo})
        await self._gerar_extratos()
        self._mudar_fase(Fase.FECHADA)
        self.hub.publicar("fechada", self.retrato())

    async def _gerar_extratos(self) -> None:
        """Extrato calculado a partir dos registros gravados, não dos contadores em memória."""
        cfg = self.config
        assert cfg
        classes: dict[int, list[int]] = defaultdict(list)
        async with self.sessoes() as sessao:
            consolidacao_final = await sessao.stream(select(Registro.unidade_id, Registro.classe).order_by(Registro.unidade_id, Registro.segundo, Registro.id))
            async for unidade_id, classe in consolidacao_final:
                classes[unidade_id].append(classe)
            agregados = await sessao.execute(select(Registro.unidade_id, Registro.classe, func.count()).group_by(Registro.unidade_id, Registro.classe))
            verificacao: dict[int, dict] = defaultdict(lambda: ext.contagens_vazias(cfg.num_itens))
            for unidade_id, classe, quantidade in agregados:
                c = verificacao[unidade_id]
                if classe == ext.VAZIO:
                    c["vazios"] += quantidade
                elif classe == ext.INVALIDO:
                    c["invalidos"] += quantidade
                else:
                    c["itens"][classe - 1] += quantidade

        extratos, pacotes = [], []
        for terminal in self.terminais.values():
            lotes = ext.dividir_em_lotes(classes[terminal.id], cfg.tamanho_pacote, cfg.num_itens)
            manifesto = ext.montar_manifesto(cfg.operacao_id, terminal.id, lotes, terminal.chave)
            esperado = verificacao[terminal.id] if terminal.id in verificacao else ext.contagens_vazias(cfg.num_itens)
            if manifesto["totais"] != esperado:
                raise RuntimeError(f"extrato da unidade {terminal.id} não bate com a agregação do banco")
            if manifesto["totais"] != terminal.contagens:
                log.warning("andamento_divergente", unidade=terminal.id)
            terminal.manifesto = manifesto
            terminal.pacotes = ext.montar_pacotes(cfg.operacao_id, terminal.id, lotes, terminal.chave)
            extratos.append(
                {
                    "unidade_id": terminal.id,
                    "operacao_id": cfg.operacao_id,
                    "participantes": terminal.participantes,
                    "total_registros": manifesto["total_registros"],
                    "total_pacotes": manifesto["total_pacotes"],
                    "contagens": manifesto["totais"],
                    "hash": manifesto["hash_extrato"],
                    "manifesto": manifesto,
                }
            )
            pacotes.extend(
                {"id": p["id"], "unidade_id": terminal.id, "lote": p["lote"], "total_lotes": p["total_lotes"], "conteudo": p, "status": "pendente"}
                for p in terminal.pacotes
            )
        async with self.sessoes() as sessao, sessao.begin():
            await sessao.execute(insert(Extrato), extratos)
            await sessao.execute(insert(PacoteGerado), pacotes)
        log.info("extratos_gerados", unidades=len(extratos), pacotes=len(pacotes))

    async def _conduzir_distribuicao(self, terminais: list[Terminal]) -> None:
        assert self.config
        distribuidor = Distribuidor(
            relogio=self.relogio,
            hub=self.hub,
            cliente=self.cliente,
            transporte_url=self.transporte_url,
            config=self.config,
            registrar_status=self._registrar_status_pacote,
            ao_mudar=lambda terminal: self.hub.publicar("distribuicao_unidade", terminal.andamento()),
        )
        await asyncio.gather(*(distribuidor.distribuir(u) for u in terminais))
        if all(u.distribuicao == "entregue" for u in self.terminais.values()):
            self._mudar_fase(Fase.DISTRIBUIDA)
        else:
            self.hub.publicar("distribuicao_incompleta", {"falhas": [u.id for u in self.terminais.values() if u.distribuicao == "falha"]})

    async def _registrar_status_pacote(self, pacote_id: str, status: str) -> None:
        async with self.sessoes() as sessao, sessao.begin():
            await sessao.execute(update(PacoteGerado).where(PacoteGerado.id == pacote_id).values(status=status))

    # ----------------------------------------------------------- consultas

    async def limpar_banco(self) -> None:
        async with self.sessoes() as sessao, sessao.begin():
            for tabela in (Registro, Checkpoint, Extrato, PacoteGerado):
                await sessao.execute(delete(tabela))

    async def extrato(self, unidade_id: int) -> dict:
        async with self.sessoes() as sessao:
            registro = await sessao.get(Extrato, unidade_id)
        if registro is None:
            raise NaoEncontrado("extrato ainda não gerado")
        return {"unidade_id": registro.unidade_id, "total_registros": registro.total_registros, "participantes": registro.participantes, "contagens": registro.contagens, "hash": registro.hash, "manifesto": registro.manifesto}

    def retrato(self) -> dict:
        config = self.config.model_dump(exclude={"unidades": {"__all__": {"chave_hmac"}}}) if self.config else None
        return {
            "fase": self.fase.value,
            "relogio": self.relogio.estado(),
            "segundo": self.segundo,
            "config": config,
            "unidades": [u.andamento() for u in self.terminais.values()],
            "checkpoints": self.checkpoints,
            "entrada_fechada": self.entrada_fechada,
            "agentes": self.agentes.estado(),
        }
