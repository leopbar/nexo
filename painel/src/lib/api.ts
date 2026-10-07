import type { Origem } from './tipos'

export const SERVICOS: Origem[] = ['coleta', 'transporte', 'consolidacao']

export const NOMES_SERVICOS: Record<Origem, string> = {
  coleta: 'Coleta',
  transporte: 'Transporte',
  consolidacao: 'Consolidação',
}

export class ErroServico extends Error {
  constructor(
    readonly servico: Origem,
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

export async function chamar<T = unknown>(servico: Origem, caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`/api/${servico}${caminho}`, {
    method: 'POST',
    headers: corpo === undefined ? undefined : { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const texto = await resposta.text()
  let dados: any = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = null
  }
  if (!resposta.ok) {
    const detalhe = dados?.erro ?? (Array.isArray(dados?.detail) ? dados.detail.map((d: any) => d.msg).join('; ') : dados?.detail) ?? resposta.statusText
    throw new ErroServico(servico, resposta.status, `${NOMES_SERVICOS[servico]}: ${detalhe}`)
  }
  return dados as T
}

export function urlEventos(servico: Origem): string {
  const protocolo = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocolo}://${location.host}/api/${servico}/eventos`
}
