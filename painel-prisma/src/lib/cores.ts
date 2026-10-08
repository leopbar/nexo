/** Mesmas cores de item usadas no painel do Nexo, para o usuário reconhecer cada item. */
export const CORES_ITENS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#a3e635', '#f97316', '#0ea5e9', '#10b981']

export function corItem(indice: number): string {
  return CORES_ITENS[indice % CORES_ITENS.length]
}
