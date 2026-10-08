"""Sistema de consolidação da central.

Só recebe, valida e soma: não conhece participantes, não acessa o banco das unidades
e não tem lógica de coleta. Enquanto a coleta está aberta, recusa tudo.
"""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Mapping

import structlog
from pydantic import ValidationError
from sqlalchemy import delete, insert, select

from . import regras
from .contrato import Manifesto, Pacote, Resposta
from .esquemas import ComandoRelogio, ConfigConsolidacao
from .eventos import Hub
from .modelos import ConsolidacaoFinal, EventoLog, ManifestoRecebido, PacoteRecebido
from .relogio import RelogioSimulado

log = structlog.get_logger("consolidacao")

TOLERANCIA_FECHAMENTO_S = 0.5


class Fase(StrEnum):
    CONFIGURACAO = "configuracao"
    PRONTA = "pronta"
    AGUARDANDO = "aguardando"
    HABILITADA = "habilitada"
    CONSOLIDACAO_FINAL = "consolidacao_final"


class ComandoInvalido(Exception):
    """Comando recusado pelo próprio sistema por não valer na fase atual."""


@dataclass
class UnidadeConsolidacao:
    id: int
    nome: str
    chave: str
    num_itens: int
    status: str = "aguardando"  # aguardando | recebendo | validada | falha
    manifesto: dict | None = None
    lotes: dict[int, dict] = field(default_factory=dict)
    ids: set[str] = field(default_factory=set)
    contagens: dict = field(default_factory=dict)
    motivo_falha: str | None = None

    def __post_init__(self) -> None:
        self.contagens = regras.contagens_vazias(self.num_itens)

    def resumo(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "nome": self.nome,
            "status": self.status,
            "recebidos": len(self.lotes),
            "total": self.manifesto["total_pacotes"] if self.manifesto else None,
            "registros_recebidos": regras.total(self.contagens),
            "registros_declarados": self.manifesto["total_registros"] if self.manifesto else None,
            "contagens": self.contagens,
            "motivo_falha": self.motivo_falha,
        }


class SistemaConsolidacao:
    def __init__(self, sessoes) -> None:
        self.relogio = RelogioSimulado()
        self.hub = Hub("consolidacao", self.relogio)
        self.sessoes = sessoes
        self.fase = Fase.CONFIGURACAO
        self.config: ConfigConsolidacao | None = None
        self.unidades: dict[int, UnidadeConsolidacao] = {}
        self.consolidado: dict = {}
        self.fechamento_coleta: float | None = None
        self.log: deque[dict] = deque(maxlen=300)
        self.consolidacao_final: dict | None = None
        self._trava = asyncio.Lock()

    # ------------------------------------------------------------------ util

    def _exigir(self, *fases: Fase, acao: str) -> None:
        if self.fase not in fases:
            permitidas = ", ".join(f.value for f in fases)
            raise ComandoInvalido(f"'{acao}' recusado: a consolidação está na fase '{self.fase.value}' (permitido em: {permitidas}).")

    def _mudar_fase(self, fase: Fase) -> None:
        self.fase = fase
        log.info("fase", fase=fase.value)
        self.hub.publicar("fase", {"fase": fase.value, "fechamento_coleta": self.fechamento_coleta})

    async def _registrar(self, tipo: str, mensagem: str, unidade_id: int | None = None, **extra: Any) -> None:
        evento = {"t": round(self.relogio.agora(), 2), "tipo": tipo, "unidade_id": unidade_id, "mensagem": mensagem, **extra}
        self.log.append(evento)
        self.hub.publicar("log", evento)
        async with self.sessoes() as sessao, sessao.begin():
            sessao.add(EventoLog(t=evento["t"], tipo=tipo, unidade_id=unidade_id, mensagem=mensagem[:500]))

    def _nome(self, unidade_id: int | None) -> str:
        unidade = self.unidades.get(unidade_id) if unidade_id is not None else None
        return unidade.nome if unidade else f"unidade {unidade_id}"

    def percentual_processado(self) -> float:
        declarados = sum(f.manifesto["total_registros"] for f in self.unidades.values() if f.manifesto)
        recebidos = sum(regras.total(f.contagens) for f in self.unidades.values() if f.manifesto)
        return round(recebidos / declarados, 4) if declarados else 0.0

    def _publicar_parcial(self, unidade: UnidadeConsolidacao) -> None:
        self.hub.publicar(
            "parcial",
            {"consolidado": self.consolidado, "percentual_processado": self.percentual_processado(), "unidade": unidade.resumo()},
        )

    # -------------------------------------------------------------- comandos

    async def configurar(self, cfg: ConfigConsolidacao) -> dict:
        self._exigir(Fase.CONFIGURACAO, Fase.PRONTA, acao="configurar")
        self.config = cfg
        self.unidades = {f.id: UnidadeConsolidacao(f.id, f.nome, f.chave_hmac, cfg.num_itens) for f in cfg.unidades}
        self.consolidado = regras.contagens_vazias(cfg.num_itens)
        self.consolidacao_final = None
        self._mudar_fase(Fase.PRONTA)
        self.hub.publicar("configurada", self.retrato())
        return self.retrato()

    async def iniciar(self) -> dict:
        """A coleta começou: a caixa de entrada fica fechada até o horário de fechamento."""
        self._exigir(Fase.PRONTA, acao="iniciar")
        assert self.config
        self.fechamento_coleta = self.relogio.agora() + self.config.duracao_coleta_s
        self._mudar_fase(Fase.AGUARDANDO)
        await self._registrar("aguardando", "Coleta aberta nas unidades. Caixa de entrada fechada.")
        return self.retrato()

    async def habilitar(self) -> dict:
        self._exigir(Fase.AGUARDANDO, acao="habilitar consolidação")
        assert self.fechamento_coleta is not None
        falta = self.fechamento_coleta - self.relogio.agora()
        if falta > TOLERANCIA_FECHAMENTO_S:
            raise ComandoInvalido(f"'habilitar consolidação' recusado: a coleta ainda está aberta (faltam {falta:.0f} s).")
        self._mudar_fase(Fase.HABILITADA)
        await self._registrar("habilitada", "Consolidação habilitada: caixa de entrada aberta para manifestos e pacotes.")
        return self.retrato()

    async def reiniciar(self) -> dict:
        async with self._trava:
            await self.limpar_banco()
            self.config = None
            self.unidades = {}
            self.consolidado = {}
            self.fechamento_coleta = None
            self.log.clear()
            self.consolidacao_final = None
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

    # ------------------------------------------------------------- recepção

    def _nack(self, referencia: str, motivo: str) -> Resposta:
        return Resposta(versao="1.0", tipo="NACK", referencia=referencia, motivo=motivo)

    def _ack(self, referencia: str, duplicado: bool = False) -> Resposta:
        return Resposta(versao="1.0", tipo="ACK", referencia=referencia, duplicado=duplicado)

    def _unidade_do_cabecalho(self, cabecalhos: Mapping[str, str]) -> int | None:
        try:
            return int(cabecalhos.get("x-unidade", ""))
        except ValueError:
            return None

    async def receber_manifesto(self, corpo: bytes, cabecalhos: Mapping[str, str]) -> tuple[int, Resposta]:
        referencia = cabecalhos.get("x-pacote-id", "desconhecido")
        if self.fase != Fase.HABILITADA:
            return 503, self._nack(referencia, f"consolidação fechada (fase '{self.fase.value}')")
        unidade_cab = self._unidade_do_cabecalho(cabecalhos)
        try:
            manifesto = Manifesto.model_validate_json(corpo)
        except ValidationError:
            await self._registrar("rejeitado", f"Manifesto ilegível de {self._nome(unidade_cab)}: corrompido em trânsito.", unidade_cab)
            return 200, self._nack(referencia, "manifesto malformado")

        assert self.config
        dados = manifesto.model_dump()
        unidade = self.unidades.get(manifesto.unidade_id)
        if manifesto.operacao_id != self.config.operacao_id or unidade is None:
            await self._registrar("rejeitado", f"Manifesto de operação ou unidade desconhecida ({manifesto.unidade_id}).", manifesto.unidade_id)
            return 200, self._nack(manifesto.hash_extrato, "operação ou unidade desconhecida")
        if not regras.assinatura_manifesto_verifica(dados, unidade.chave):
            await self._registrar("rejeitado", f"Manifesto de {unidade.nome} com assinatura inválida.", unidade.id)
            return 200, self._nack(manifesto.hash_extrato, "assinatura inválida")

        async with self._trava:
            if unidade.manifesto is not None:
                if unidade.manifesto["hash_extrato"] == manifesto.hash_extrato:
                    await self._registrar("duplicado", f"Manifesto repetido de {unidade.nome} descartado.", unidade.id)
                    return 200, self._ack(manifesto.hash_extrato, duplicado=True)
                await self._registrar("rejeitado", f"Manifesto divergente de {unidade.nome}.", unidade.id)
                return 200, self._nack(manifesto.hash_extrato, "manifesto divergente do já recebido")
            async with self.sessoes() as sessao, sessao.begin():
                sessao.add(ManifestoRecebido(unidade_id=unidade.id, operacao_id=manifesto.operacao_id, conteudo=dados, recebido_em=self.relogio.agora()))
            unidade.manifesto = dados
            unidade.status = "recebendo"
        await self._registrar(
            "manifesto",
            f"Manifesto de {unidade.nome}: {manifesto.total_pacotes} pacotes, {manifesto.total_registros} registros.",
            unidade.id,
        )
        self._publicar_parcial(unidade)
        return 200, self._ack(manifesto.hash_extrato)

    async def receber_pacote(self, corpo: bytes, cabecalhos: Mapping[str, str]) -> tuple[int, Resposta]:
        referencia = cabecalhos.get("x-pacote-id", "desconhecido")
        if self.fase != Fase.HABILITADA:
            return 503, self._nack(referencia, f"consolidação fechada (fase '{self.fase.value}')")
        unidade_cab = self._unidade_do_cabecalho(cabecalhos)
        try:
            pacote = Pacote.model_validate_json(corpo)
        except ValidationError:
            await self._registrar("rejeitado", f"Pacote ilegível de {self._nome(unidade_cab)}: corrompido em trânsito.", unidade_cab, referencia=referencia)
            return 200, self._nack(referencia, "pacote malformado")

        assert self.config
        dados = pacote.model_dump()
        unidade = self.unidades.get(pacote.unidade_id)
        if pacote.operacao_id != self.config.operacao_id or unidade is None:
            await self._registrar("rejeitado", f"Pacote de operação ou unidade desconhecida ({pacote.unidade_id}).", pacote.unidade_id, referencia=pacote.id)
            return 200, self._nack(pacote.id, "operação ou unidade desconhecida")
        if not regras.checksum_verifica(dados):
            await self._registrar("rejeitado", f"Lote {pacote.lote} de {unidade.nome}: checksum inválido. NACK.", unidade.id, referencia=pacote.id, lote=pacote.lote)
            return 200, self._nack(pacote.id, "checksum inválido")
        if not regras.assinatura_pacote_verifica(dados, unidade.chave):
            await self._registrar("rejeitado", f"Lote {pacote.lote} de {unidade.nome}: assinatura inválida. NACK.", unidade.id, referencia=pacote.id, lote=pacote.lote)
            return 200, self._nack(pacote.id, "assinatura inválida")

        async with self._trava:
            if pacote.id in unidade.ids:
                await self._registrar("duplicado", f"Lote {pacote.lote} de {unidade.nome} já contabilizado: duplicado descartado.", unidade.id, referencia=pacote.id, lote=pacote.lote)
                return 200, self._ack(pacote.id, duplicado=True)
            if unidade.manifesto is None:
                await self._registrar("rejeitado", f"Lote {pacote.lote} de {unidade.nome} chegou antes do manifesto.", unidade.id, referencia=pacote.id)
                return 200, self._nack(pacote.id, "manifesto ausente")
            if pacote.total_lotes != unidade.manifesto["total_pacotes"] or pacote.lote > pacote.total_lotes:
                await self._registrar("rejeitado", f"Lote {pacote.lote} de {unidade.nome} fora do manifesto.", unidade.id, referencia=pacote.id)
                return 200, self._nack(pacote.id, "lote fora do manifesto")

            async with self.sessoes() as sessao, sessao.begin():
                sessao.add(PacoteRecebido(id=pacote.id, unidade_id=unidade.id, lote=pacote.lote, contagens=dados["contagens"], recebido_em=self.relogio.agora()))
            unidade.ids.add(pacote.id)
            unidade.lotes[pacote.lote] = dados["contagens"]
            regras.acumular(unidade.contagens, dados["contagens"])
            regras.acumular(self.consolidado, dados["contagens"])
            await self._registrar(
                "aceito",
                f"Lote {pacote.lote}/{pacote.total_lotes} de {unidade.nome} aceito (+{regras.total(dados['contagens'])} registros). ACK.",
                unidade.id,
                referencia=pacote.id,
                lote=pacote.lote,
            )
            if len(unidade.lotes) == unidade.manifesto["total_pacotes"]:
                await self._validar(unidade)
            self._publicar_parcial(unidade)
            if self.fase == Fase.HABILITADA and all(f.status == "validada" for f in self.unidades.values()):
                await self._finalizar()
        return 200, self._ack(pacote.id)

    async def _validar(self, unidade: UnidadeConsolidacao) -> None:
        """Verifica a soma de todos os lotes contra o manifesto antes de marcar a unidade como processada."""
        assert self.config and unidade.manifesto
        lotes = [unidade.lotes[n] for n in sorted(unidade.lotes)]
        hash_calculado = regras.hash_extrato(self.config.operacao_id, unidade.id, lotes)
        problemas = []
        if unidade.contagens != unidade.manifesto["totais"]:
            problemas.append("totais divergentes")
        if regras.total(unidade.contagens) != unidade.manifesto["total_registros"]:
            problemas.append("total de registros divergente")
        if hash_calculado != unidade.manifesto["hash_extrato"]:
            problemas.append("hash do extrato divergente")
        if problemas:
            unidade.status = "falha"
            unidade.motivo_falha = ", ".join(problemas)
            await self._registrar("falha", f"{unidade.nome} NÃO bate com o manifesto: {unidade.motivo_falha}.", unidade.id)
        else:
            unidade.status = "validada"
            await self._registrar("validada", f"{unidade.nome} validada: {unidade.manifesto['total_registros']} registros batem com o manifesto.", unidade.id)
        self.hub.publicar("unidade", unidade.resumo())

    async def _finalizar(self) -> None:
        """Todas as unidades validadas: define o item predominante a partir do que foi gravado."""
        assert self.config
        num = self.config.num_itens
        por_unidade: dict[int, dict] = {f: regras.contagens_vazias(num) for f in self.unidades}
        async with self.sessoes() as sessao:
            for unidade_id, contagens in (await sessao.execute(select(PacoteRecebido.unidade_id, PacoteRecebido.contagens))).all():
                regras.acumular(por_unidade[unidade_id], contagens)
        totais = regras.contagens_vazias(num)
        for contagens in por_unidade.values():
            regras.acumular(totais, contagens)

        classificados = sum(totais["itens"])
        predominancia = regras.predominancia_por_unidade(list(por_unidade.values()), num)
        semente = f"{self.config.seed}:{self.config.operacao_id}" if self.config.seed is not None else self.config.operacao_id
        decisao = regras.definir_predominante(totais["itens"], predominancia, semente)
        consolidacao_final = {
            "operacao_id": self.config.operacao_id,
            "totais": totais,
            "classificados": classificados,
            "total_registros": regras.total(totais),
            "percentuais": [round(v / classificados, 6) if classificados else 0 for v in totais["itens"]],
            "predominancia_por_unidade": predominancia,
            "por_unidade": {str(k): v for k, v in por_unidade.items()},
            **decisao,
            "consolidado_em": round(self.relogio.agora(), 2),
        }
        async with self.sessoes() as sessao, sessao.begin():
            sessao.add(ConsolidacaoFinal(operacao_id=self.config.operacao_id, conteudo=consolidacao_final))
        self.consolidacao_final = consolidacao_final
        if decisao["equivalencia"] == "selecao":
            await self._registrar("selecao", decisao["detalhe"])
        await self._registrar("consolidacao_final", f"Consolidação final: item {decisao['predominante']} predomina. {decisao['detalhe']}")
        self._mudar_fase(Fase.CONSOLIDACAO_FINAL)
        self.hub.publicar("consolidacao_final", consolidacao_final)

    # ----------------------------------------------------------- consultas

    async def limpar_banco(self) -> None:
        async with self.sessoes() as sessao, sessao.begin():
            for tabela in (ManifestoRecebido, PacoteRecebido, EventoLog, ConsolidacaoFinal):
                await sessao.execute(delete(tabela))

    def retrato(self) -> dict:
        return {
            "fase": self.fase.value,
            "relogio": self.relogio.estado(),
            "fechamento_coleta": self.fechamento_coleta,
            "unidades": [f.resumo() for f in self.unidades.values()],
            "consolidado": self.consolidado,
            "percentual_processado": self.percentual_processado(),
            "log": list(self.log),
            "consolidacao_final": self.consolidacao_final,
        }
