/** Uma cor vibrante e fixa por item; cinza para vazios, vermelho apagado para invalidos. */
export const CORES_ITENS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#a3e635', '#f97316', '#0ea5e9', '#10b981']
export const COR_VAZIO = '#a1a1aa'
export const COR_INVALIDO = '#b4534f'

/** Cores das unidades: usadas quando a tubulação acende. */
export const CORES_UNIDADES = [
  '#60a5fa', '#34d399', '#fb923c', '#c084fc', '#facc15', '#2dd4bf', '#f87171', '#4ade80',
  '#e879f9', '#38bdf8', '#fbbf24', '#a78bfa', '#5eead4', '#fca5a5', '#bef264', '#93c5fd',
]

export const COR_ACK = '#4ade80'
export const COR_NACK = '#ef4444'
export const COR_DUPLICADO = '#a1a1aa'
export const COR_RECUSADO = '#f59e0b'

export function corItem(indice: number): string {
  return CORES_ITENS[indice % CORES_ITENS.length]
}

/** Índice de opção: 0..N-1 itens, N vazios, N+1 invalidos. */
export function corClasse(indice: number, numItens: number): string {
  if (indice < numItens) return corItem(indice)
  return indice === numItens ? COR_VAZIO : COR_INVALIDO
}

export function hexParaNumero(hex: string): number {
  return parseInt(hex.slice(1), 16)
}
