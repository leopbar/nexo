/** Formas das mensagens publicadas pelos três serviços. */

export type Origem = 'coleta' | 'transporte' | 'consolidacao'

export interface Mensagem<T = any> {
  origem: Origem
  seq: number
  tipo: string
  t: number
  dados: T
}

export interface Contagens {
  itens: number[]
  vazios: number
  invalidos: number
}

export type StatusDistribuicao = 'aguardando' | 'distribuindo' | 'entregue' | 'falha'

export interface AndamentoUnidade {
  id: number
  nome: string
  participantes: number
  registros_previstos: number
  cobertura_prevista: number
  total: number
  cobertura: number
  ausentes: number
  contagens: Contagens
  aberto: boolean
  /** Participantes na fila que ainda não tiveram o registro gerado (só no modo agentes de IA). */
  fila: number
  distribuicao: StatusDistribuicao
  pacotes_total: number
  pacotes_confirmados: number
  manifesto_confirmado: boolean
}

export interface Checkpoint {
  segundo: number
  unidades: { id: number; total: number; cobertura: number; contagens: Contagens }[]
}

export type StatusConsolidacao = 'aguardando' | 'recebendo' | 'validada' | 'falha'

export interface UnidadeConsolidacao {
  id: number
  nome: string
  status: StatusConsolidacao
  recebidos: number
  total: number | null
  registros_recebidos: number
  registros_declarados: number | null
  contagens: Contagens
  motivo_falha: string | null
}

export interface EventoLog {
  t: number
  tipo: 'aguardando' | 'habilitada' | 'manifesto' | 'aceito' | 'rejeitado' | 'duplicado' | 'validada' | 'falha' | 'selecao' | 'consolidacao_final'
  unidade_id: number | null
  mensagem: string
  lote?: number
}

export interface ConsolidacaoFinal {
  operacao_id: string
  totais: Contagens
  classificados: number
  total_registros: number
  percentuais: number[]
  predominancia_por_unidade: number[]
  por_unidade: Record<string, Contagens>
  predominante: number
  equivalencia: null | 'unidades' | 'selecao'
  equivalentes: number[]
  detalhe: string
  consolidado_em: number
}

export interface LinkTransporte {
  unidade_id: number
  latencia_base: number
  online: boolean
  em_transito: number
}

export interface EstatisticasTransporte {
  enviados: number
  entregues: number
  perdidos: number
  corrompidos: number
  atrasados: number
  recusados: number
  quedas: number
}

export interface ModeloAgente {
  id: string
  nome: string
  entrada: number
  saida: number
  ativo: boolean
  disponivel: boolean | null
  chamadas: number
  falhas: number
  custo: number
  ultimo_erro: string | null
}

export interface EstadoAgentes {
  chave: string | null
  verificado: boolean
  custo_total: number
  chamadas: number
  falhas: number
  modelos: ModeloAgente[]
}
