/**
 * Comandos do painel. O painel só comanda e observa: cada comando vai para o
 * serviço dono da fase, que decide se aceita. Recusas viram avisos na tela.
 */
import { useOperacao } from '../store/operacao'
import { chamar, SERVICOS } from './api'
import { seedNumerica } from './config'
import { relogio } from './relogio'

function chaveHmac(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function tentar(acao: () => Promise<unknown>, sucesso?: string): Promise<boolean> {
  try {
    await acao()
    if (sucesso) useOperacao.getState().avisar(sucesso, 'sucesso')
    return true
  } catch (erro) {
    useOperacao.getState().avisar(erro instanceof Error ? erro.message : String(erro), 'erro')
    return false
  }
}

export function iniciarOperacao() {
  return tentar(async () => {
    const { config: c, topologia, escala } = useOperacao.getState()
    const seed = seedNumerica(c)
    const operacaoId = crypto.randomUUID()
    const unidades = topologia.unidades.map((f) => ({ id: f.id, nome: f.nome, chave_hmac: chaveHmac() }))

    await Promise.all(SERVICOS.map((s) => chamar(s, '/reiniciar')))
    await Promise.all([
      chamar('coleta', '/configurar', {
        operacao_id: operacaoId,
        unidades,
        num_itens: c.numItens,
        participantes_min: c.participantesMin,
        participantes_max: c.participantesMax,
        cobertura_min: c.coberturaMin / 100,
        cobertura_max: c.coberturaMax / 100,
        prob_vazio: c.probVazio / 100,
        prob_invalido: c.probInvalido / 100,
        duracao_s: c.duracao,
        intervalo_registro_s: c.intervaloRegistro,
        intervalo_checkpoint_s: c.intervaloCheckpoint,
        tamanho_pacote: c.tamanhoPacote,
        timeout_ack_s: c.timeoutAck,
        max_tentativas: c.maxTentativas,
        janela_envio: c.janelaEnvio,
        seed,
        agentes: c.agentes,
        lote_agentes: c.loteAgentes,
        itens: c.nomesItens.map((titulo, i) => ({ titulo: titulo.trim() || `Item ${i + 1}`, descricao: c.descricoesItens[i]?.trim() ?? '' })),
      }),
      chamar('consolidacao', '/configurar', {
        operacao_id: operacaoId,
        unidades,
        num_itens: c.numItens,
        duracao_coleta_s: c.duracao,
        seed,
      }),
      chamar('transporte', '/configurar', {
        operacao_id: operacaoId,
        unidades: topologia.unidades.map((f) => ({ id: f.id, latencia_base_s: f.latenciaBase })),
        taxa_perda: c.taxaPerda / 100,
        taxa_corrupcao: c.taxaCorrupcao / 100,
        taxa_atraso_extremo: c.taxaAtrasoExtremo / 100,
        atraso_extremo_min_s: c.timeoutAck + 1,
        atraso_extremo_max_s: c.timeoutAck + 6,
        eventos_offline: c.eventosOffline,
        seed,
      }),
    ])
    relogio.retomar()
    useOperacao.getState().definirRelogio({ pausado: false })
    // Com agentes de IA a velocidade fica em 1x: a resposta dos modelos não acelera junto.
    // O /reiniciar acima já devolveu os relógios dos serviços a 1x.
    if (c.agentes) {
      relogio.definirEscala(1)
      useOperacao.getState().definirRelogio({ escala: 1 })
    } else if (escala !== 1) await Promise.all(SERVICOS.map((s) => chamar(s, '/relogio', { acao: 'escala', escala })))
    await Promise.all([chamar('coleta', '/iniciar'), chamar('consolidacao', '/iniciar')])
  })
}

export function habilitarConsolidacao() {
  return tentar(() => chamar('consolidacao', '/habilitar'))
}

export function distribuirExtratos() {
  return tentar(() => chamar('coleta', '/distribuir'))
}

export function reenviarFalhas() {
  useOperacao.getState().marcarReenvio()
  return tentar(() => chamar('coleta', '/reenviar'))
}

export function reiniciarTudo() {
  return tentar(async () => {
    await Promise.all(SERVICOS.map((s) => chamar(s, '/reiniciar')))
    relogio.retomar()
    relogio.definirEscala(1)
    useOperacao.getState().definirRelogio({ escala: 1, pausado: false })
  })
}

export function pausar(pausado: boolean) {
  return tentar(async () => {
    await Promise.all(SERVICOS.map((s) => chamar(s, '/relogio', { acao: pausado ? 'pausar' : 'retomar' })))
    if (pausado) relogio.pausar()
    else relogio.retomar()
    useOperacao.getState().definirRelogio({ pausado })
  })
}

export function acelerar(escala: number) {
  return tentar(async () => {
    await Promise.all(SERVICOS.map((s) => chamar(s, '/relogio', { acao: 'escala', escala })))
    relogio.definirEscala(escala)
    useOperacao.getState().definirRelogio({ escala })
  })
}

export function salvarChaveOpenAI(chave: string | null) {
  return tentar(() => chamar('coleta', '/agentes/chave', { chave }), chave ? 'Chave da OpenAI salva e verificada.' : 'Chave da OpenAI removida.')
}

export function verificarModelos() {
  return tentar(() => chamar('coleta', '/agentes/verificar'), 'Modelos verificados na conta da OpenAI.')
}

export function alternarModelo(modelo: string, ativo: boolean) {
  return tentar(() => chamar('coleta', '/agentes/modelos', { modelo, ativo }))
}
