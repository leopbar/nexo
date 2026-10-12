import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { nomeItem, useIdioma } from '../lib/idioma'
import { CONFIG_PADRAO, normalizarConfig, seedNumerica, type ConfigOperacao } from '../lib/config'
import { relogio } from '../lib/relogio'
import { sementeAleatoria } from '../lib/rng'
import type {
  Checkpoint,
  Contagens,
  EstadoAgentes,
  EstatisticasTransporte,
  EventoLog,
  UnidadeConsolidacao,
  LinkTransporte,
  Mensagem,
  Origem,
  AndamentoUnidade,
  ConsolidacaoFinal,
} from '../lib/tipos'
import { gerarTopologia, type Topologia } from '../lib/topologia'

export interface Aviso {
  id: number
  texto: string
  tipo: 'erro' | 'info' | 'sucesso'
}

export interface Viewport {
  escala: number
  dx: number
  dy: number
}

const ESTATISTICAS_ZERADAS: EstatisticasTransporte = { enviados: 0, entregues: 0, perdidos: 0, corrompidos: 0, atrasados: 0, recusados: 0, quedas: 0 }

interface Estado {
  conexoes: Record<Origem, boolean>
  config: ConfigOperacao
  seedMapa: number
  topologia: Topologia
  escala: number
  pausado: boolean
  viewport: Viewport
  aba: 'coleta' | 'consolidacao'
  avisos: Aviso[]
  consolidacaoAberta: boolean
  agentesAberto: boolean
  agentes: EstadoAgentes | null

  faseColeta: string
  segundo: number
  duracao: number
  unidades: Record<number, AndamentoUnidade>
  checkpoints: Checkpoint[]
  distribuicaoIncompleta: boolean
  entradaFechada: boolean

  faseTransporte: string
  links: Record<number, LinkTransporte>
  estatisticasTransporte: EstatisticasTransporte

  faseConsolidacao: string
  unidadesConsolidacao: Record<number, UnidadeConsolidacao>
  consolidado: Contagens | null
  percentualProcessado: number
  log: EventoLog[]
  consolidacaoFinal: ConsolidacaoFinal | null

  aplicar: (m: Mensagem) => void
  definirConexao: (origem: Origem, ok: boolean) => void
  definirConfig: (parcial: Partial<ConfigOperacao>) => void
  sortearMapa: () => void
  definirRelogio: (parcial: { escala?: number; pausado?: boolean }) => void
  definirViewport: (v: Viewport) => void
  definirAba: (aba: 'coleta' | 'consolidacao') => void
  avisar: (texto: string, tipo?: Aviso['tipo']) => void
  dispensarAviso: (id: number) => void
  definirConsolidacaoAberta: (v: boolean) => void
  definirAgentesAberto: (v: boolean) => void
  marcarReenvio: () => void
}

function topologiaDe(config: ConfigOperacao, seedMapa: number): Topologia {
  return gerarTopologia(seedMapa, config.nomesUnidades, config.latenciaMin, config.latenciaMax)
}

function porId<T extends { id: number }>(lista: T[]): Record<number, T> {
  return Object.fromEntries(lista.map((x) => [x.id, x]))
}

let proximoAviso = 1

export const useOperacao = create<Estado>()(
  persist(
    (set, get) => ({
      conexoes: { coleta: false, transporte: false, consolidacao: false },
      config: CONFIG_PADRAO,
      seedMapa: 20261006,
      topologia: topologiaDe(CONFIG_PADRAO, 20261006),
      escala: 1,
      pausado: false,
      viewport: { escala: 1, dx: 0, dy: 0 },
      aba: 'coleta',
      avisos: [],
      consolidacaoAberta: false,
      agentesAberto: false,
      agentes: null,

      faseColeta: 'configuracao',
      segundo: 0,
      duracao: CONFIG_PADRAO.duracao,
      unidades: {},
      checkpoints: [],
      distribuicaoIncompleta: false,
      entradaFechada: false,

      faseTransporte: 'configuracao',
      links: {},
      estatisticasTransporte: ESTATISTICAS_ZERADAS,

      faseConsolidacao: 'configuracao',
      unidadesConsolidacao: {},
      consolidado: null,
      percentualProcessado: 0,
      log: [],
      consolidacaoFinal: null,

      aplicar: (m) => {
        const d = m.dados
        if (m.origem === 'coleta' && (m.tipo === 'retrato' || m.tipo === 'relogio')) {
          // O painel adota o relógio da coleta ao (re)conectar e quando outro painel o comanda.
          const r = m.tipo === 'retrato' ? d.relogio : d
          if (r.pausado) relogio.pausar()
          else relogio.retomar()
          if (relogio.escala !== r.escala) relogio.definirEscala(r.escala)
          set({ escala: r.escala, pausado: r.pausado })
        }
        if (m.origem === 'coleta') {
          switch (m.tipo) {
            case 'retrato':
            case 'configurada':
            case 'fechada':
            case 'reiniciado':
              set({
                faseColeta: d.fase,
                segundo: d.segundo,
                duracao: d.config?.duracao_s ?? get().config.duracao,
                unidades: porId(d.unidades),
                checkpoints: d.checkpoints,
                agentes: d.agentes ?? get().agentes,
                entradaFechada: d.entrada_fechada ?? false,
                ...(m.tipo === 'reiniciado' ? { distribuicaoIncompleta: false } : {}),
              })
              break
            case 'fase':
              set({ faseColeta: d.fase, ...(d.fase !== 'coleta' ? { entradaFechada: false } : {}) })
              if (d.fase === 'coleta') set({ aba: 'coleta' })
              break
            case 'andamento': {
              const unidades = { ...get().unidades }
              for (const f of d.unidades) {
                const { novos: _novos, ...andamento } = f
                unidades[f.id] = andamento
              }
              set({ unidades, segundo: d.segundo, duracao: d.duracao, entradaFechada: d.entrada_fechada ?? false })
              break
            }
            case 'checkpoint':
              set({ checkpoints: [...get().checkpoints, d] })
              break
            case 'distribuicao_unidade':
              set({ unidades: { ...get().unidades, [d.id]: d } })
              break
            case 'distribuicao_incompleta':
              set({ distribuicaoIncompleta: true })
              break
            case 'agentes':
              set({ agentes: d })
              break
          }
        } else if (m.origem === 'transporte') {
          const est = get().estatisticasTransporte
          switch (m.tipo) {
            case 'retrato':
            case 'configurada':
            case 'reiniciado':
              set({ faseTransporte: d.fase, links: Object.fromEntries(d.links.map((l: LinkTransporte) => [l.unidade_id, l])), estatisticasTransporte: d.estatisticas })
              break
            case 'fase':
              set({ faseTransporte: d.fase })
              break
            case 'link': {
              const atual = get().links[d.unidade_id]
              if (atual) set({ links: { ...get().links, [d.unidade_id]: { ...atual, online: d.online } } })
              if (!d.online) set({ estatisticasTransporte: { ...est, quedas: est.quedas + 1 } })
              break
            }
            case 'transito':
              set({ estatisticasTransporte: { ...est, enviados: est.enviados + 1, atrasados: est.atrasados + (d.atraso_extremo ? 1 : 0) } })
              break
            case 'perdido':
              set({ estatisticasTransporte: { ...est, perdidos: est.perdidos + 1 } })
              break
            case 'corrompido':
              set({ estatisticasTransporte: { ...est, corrompidos: est.corrompidos + 1 } })
              break
            case 'recusado':
              set({ estatisticasTransporte: { ...est, recusados: est.recusados + 1 } })
              break
            case 'retorno':
              set({ estatisticasTransporte: { ...est, entregues: est.entregues + 1 } })
              break
          }
        } else {
          switch (m.tipo) {
            case 'retrato':
            case 'configurada':
            case 'reiniciado':
              set({
                faseConsolidacao: d.fase,
                unidadesConsolidacao: porId(d.unidades),
                consolidado: d.consolidado && d.consolidado.itens ? d.consolidado : null,
                percentualProcessado: d.percentual_processado,
                log: d.log,
                consolidacaoFinal: d.consolidacao_final,
                ...(m.tipo === 'reiniciado' ? { consolidacaoAberta: false } : {}),
              })
              break
            case 'fase':
              set({ faseConsolidacao: d.fase })
              if (d.fase === 'habilitada') set({ aba: 'consolidacao' })
              break
            case 'parcial':
              set({
                consolidado: d.consolidado,
                percentualProcessado: d.percentual_processado,
                unidadesConsolidacao: { ...get().unidadesConsolidacao, [d.unidade.id]: d.unidade },
              })
              break
            case 'unidade':
              set({ unidadesConsolidacao: { ...get().unidadesConsolidacao, [d.id]: d } })
              break
            case 'log':
              set({ log: [...get().log.slice(-299), d] })
              break
            case 'consolidacao_final':
              set({ consolidacaoFinal: d, consolidacaoAberta: true })
              break
          }
        }
      },

      definirConexao: (origem, ok) => set({ conexoes: { ...get().conexoes, [origem]: ok } }),

      definirConfig: (parcial) => {
        const config = normalizarConfig({ ...get().config, ...parcial })
        const seed = seedNumerica(config)
        const seedMapa = seed ?? get().seedMapa
        set({ config, seedMapa, topologia: topologiaDe(config, seedMapa), duracao: config.duracao })
      },

      sortearMapa: () => {
        const config = { ...get().config, seed: '' }
        const seedMapa = sementeAleatoria()
        set({ config, seedMapa, topologia: topologiaDe(config, seedMapa) })
      },

      definirRelogio: (parcial) => set(parcial),
      definirViewport: (viewport) => set({ viewport }),
      definirAba: (aba) => set({ aba }),

      avisar: (texto, tipo = 'info') => {
        const id = proximoAviso++
        set({ avisos: [...get().avisos.slice(-4), { id, texto, tipo }] })
        setTimeout(() => get().dispensarAviso(id), tipo === 'erro' ? 7000 : 4000)
      },
      dispensarAviso: (id) => set({ avisos: get().avisos.filter((a) => a.id !== id) }),
      definirConsolidacaoAberta: (consolidacaoAberta) => set({ consolidacaoAberta }),
      definirAgentesAberto: (agentesAberto) => set({ agentesAberto }),
      marcarReenvio: () => set({ distribuicaoIncompleta: false }),
    }),
    {
      name: 'nexo-painel',
      version: 1,
      partialize: (s) => ({ config: s.config, seedMapa: s.seedMapa }),
      merge: (persistido, atual) => {
        const p = persistido as Partial<Estado> | undefined
        const config = normalizarConfig({ ...CONFIG_PADRAO, ...(p?.config ?? {}) })
        const seedMapa = p?.seedMapa ?? atual.seedMapa
        return { ...atual, ...p, config, seedMapa, topologia: topologiaDe(config, seedMapa), duracao: config.duracao }
      },
    },
  ),
)

export type FaseGeral = 'configuracao' | 'coleta' | 'fechamento' | 'consolidacao' | 'consolidacao_final'

export const FASES: { id: FaseGeral; rotulo: string; en: string }[] = [
  { id: 'configuracao', rotulo: 'Configuração', en: 'Configuration' },
  { id: 'coleta', rotulo: 'Coleta', en: 'Collection' },
  { id: 'fechamento', rotulo: 'Fechamento', en: 'Closing' },
  { id: 'consolidacao', rotulo: 'Distribuição e consolidação', en: 'Distribution and consolidation' },
  { id: 'consolidacao_final', rotulo: 'Consolidação final', en: 'Final consolidation' },
]

export function faseGeral(coleta: string, consolidacao: string): FaseGeral {
  if (consolidacao === 'consolidacao_final') return 'consolidacao_final'
  if (coleta === 'distribuindo' || coleta === 'distribuida') return 'consolidacao'
  if (coleta === 'fechada') return 'fechamento'
  if (coleta === 'coleta') return 'coleta'
  return 'configuracao'
}

export function useFaseGeral(): FaseGeral {
  const v = useOperacao((s) => s.faseColeta)
  const a = useOperacao((s) => s.faseConsolidacao)
  return faseGeral(v, a)
}

/** Participantes ainda na fila depois do fechamento da entrada; null fora dessa situação. */
export function useFila(): number | null {
  return useOperacao((s) => (s.entradaFechada ? Object.values(s.unidades).reduce((t, f) => t + (f.fila ?? 0), 0) : null))
}

/** Nomes dos itens da operação como aparecem na tela (nomes padrão no idioma atual). */
export function useNomesItens(): string[] {
  const nomes = useOperacao((s) => s.config.nomesItens)
  const idioma = useIdioma((s) => s.idioma)
  return useMemo(() => nomes.map((n) => nomeItem(n, idioma)), [nomes, idioma])
}
