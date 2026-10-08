/** Formas das mensagens e respostas do serviço Prisma. */

export interface Contagens {
  itens: number[]
  vazios: number
  invalidos: number
}

export type Escopo = 'todas' | 'selecionadas'

export interface Ajustes {
  ativo: boolean
  item_alvo: number | null
  percentual: number
  escopo: Escopo
  unidades: number[]
}

export type Decisao = 'reclassificado' | 'intacto' | 'reenvio'

export interface Passagem {
  registrado_em: number
  operacao_id: string | null
  pacote_id: string | null
  unidade_id: number | null
  lote: number | null
  decisao: Decisao
  motivo: string | null
  item_alvo: number | null
  percentual: number | null
  original: Contagens | null
  efetivo: Contagens | null
  movidos: number
}

export interface Estatisticas {
  recebidos: number
  reclassificados: number
  intactos: number
  reenvios: number
  registros_reclassificados: number
  saidas_por_item: number[]
  entradas_por_item: number[]
}

export interface Catalogo {
  disponivel: boolean
  operacao_id: string | null
  itens: string[]
  unidades: { id: number; nome: string }[]
}

export interface Retrato {
  ajustes: Ajustes
  operacao_id: string | null
  estatisticas: Estatisticas
  historico: Passagem[]
  catalogo: Catalogo
}

export interface Mensagem<T = any> {
  origem: 'prisma'
  seq: number
  tipo: string
  t: number
  dados: T
}
