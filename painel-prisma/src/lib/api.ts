export async function chamar<T = unknown>(caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`/api/prisma${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
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
    const detalhe = Array.isArray(dados?.detail) ? dados.detail.map((d: any) => String(d.msg).replace(/^Value error, /, '')).join('; ') : (dados?.detail ?? resposta.statusText)
    throw new Error(detalhe)
  }
  return dados as T
}

export function urlEventos(): string {
  const protocolo = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocolo}://${location.host}/api/prisma/eventos`
}
