import { create } from 'zustand'

import { chamar, urlEventos } from './lib/api'
import type { Ajustes, Catalogo, Estatisticas, Mensagem, Passagem, Retrato } from './lib/tipos'

export interface Aviso {
  id: number
  texto: string
  tipo: 'erro' | 'sucesso'
}

const LIMITE_HISTORICO = 300
const ESTATISTICAS_ZERADAS: Estatisticas = { recebidos: 0, reclassificados: 0, intactos: 0, reenvios: 0, registros_reclassificados: 0, saidas_por_item: [], entradas_por_item: [] }
const AJUSTES_PADRAO: Ajustes = { ativo: false, item_alvo: null, percentual: 50, escopo: 'todas', unidades: [] }

interface Estado {
  conectado: boolean
  ajustes: Ajustes
  operacaoId: string | null
  estatisticas: Estatisticas
  historico: Passagem[]
  catalogo: Catalogo
  avisos: Aviso[]

  aplicarRetrato: (r: Retrato) => void
  aplicar: (m: Mensagem) => void
  salvar: (parcial: Partial<Ajustes>) => Promise<boolean>
  atualizarCatalogo: () => Promise<void>
  avisar: (texto: string, tipo?: Aviso['tipo']) => void
}

let proximoAviso = 1

export const usePrisma = create<Estado>()((set, get) => ({
  conectado: false,
  ajustes: AJUSTES_PADRAO,
  operacaoId: null,
  estatisticas: ESTATISTICAS_ZERADAS,
  historico: [],
  catalogo: { disponivel: false, operacao_id: null, itens: [], unidades: [] },
  avisos: [],

  aplicarRetrato: (r) =>
    set({ ajustes: r.ajustes, operacaoId: r.operacao_id, estatisticas: r.estatisticas, historico: r.historico.slice(-LIMITE_HISTORICO), catalogo: r.catalogo.disponivel ? r.catalogo : get().catalogo }),

  aplicar: (m) => {
    switch (m.tipo) {
      case 'retrato':
      case 'operacao':
        get().aplicarRetrato(m.dados)
        break
      case 'ajustes':
        set({ ajustes: m.dados })
        break
      case 'passagem':
        set({ historico: [...get().historico.slice(-(LIMITE_HISTORICO - 1)), m.dados.passagem], estatisticas: m.dados.estatisticas })
        break
    }
  },

  salvar: async (parcial) => {
    const anterior = get().ajustes
    const novos = { ...anterior, ...parcial }
    set({ ajustes: novos })
    try {
      get().aplicarRetrato(await chamar<Retrato>('/ajustes', novos))
      return true
    } catch (erro) {
      set({ ajustes: anterior })
      get().avisar(erro instanceof Error ? erro.message : String(erro), 'erro')
      return false
    }
  },

  atualizarCatalogo: async () => {
    try {
      set({ catalogo: await chamar<Catalogo>('/catalogo') })
    } catch {
      set({ catalogo: { ...get().catalogo, disponivel: false } })
    }
  },

  avisar: (texto, tipo = 'sucesso') => {
    const id = proximoAviso++
    set({ avisos: [...get().avisos.slice(-3), { id, texto, tipo }] })
    setTimeout(() => set({ avisos: get().avisos.filter((a) => a.id !== id) }), tipo === 'erro' ? 6000 : 3500)
  },
}))

/** WebSocket com reconexão automática e leitura periódica do catálogo do Nexo. Retorna a função que desliga tudo. */
export function conectar(): () => void {
  let desligado = false
  let ws: WebSocket | null = null
  let espera: number | undefined

  const abrir = () => {
    if (desligado) return
    ws = new WebSocket(urlEventos())
    ws.onopen = () => usePrisma.setState({ conectado: true })
    ws.onmessage = (ev) => usePrisma.getState().aplicar(JSON.parse(ev.data))
    ws.onclose = () => {
      usePrisma.setState({ conectado: false })
      if (!desligado) espera = window.setTimeout(abrir, 1500)
    }
  }
  abrir()

  const { atualizarCatalogo } = usePrisma.getState()
  void atualizarCatalogo()
  const catalogo = window.setInterval(atualizarCatalogo, 3000)

  return () => {
    desligado = true
    window.clearTimeout(espera)
    window.clearInterval(catalogo)
    ws?.close()
  }
}
