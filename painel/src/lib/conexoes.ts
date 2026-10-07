import { useOperacao } from '../store/operacao'
import { SERVICOS, urlEventos } from './api'
import { barramento } from './barramento'
import type { Mensagem } from './tipos'

/** Abre um WebSocket por serviço, com reconexão automática. Retorna a função de fechamento. */
export function conectarServicos(): () => void {
  let fechado = false
  const sockets: WebSocket[] = []
  const timers: number[] = []

  for (const servico of SERVICOS) {
    const abrir = () => {
      if (fechado) return
      const ws = new WebSocket(urlEventos(servico))
      sockets.push(ws)
      ws.onopen = () => useOperacao.getState().definirConexao(servico, true)
      ws.onmessage = (ev) => {
        const mensagem = JSON.parse(ev.data) as Mensagem
        useOperacao.getState().aplicar(mensagem)
        barramento.emitir(mensagem)
      }
      ws.onclose = () => {
        useOperacao.getState().definirConexao(servico, false)
        if (!fechado) timers.push(window.setTimeout(abrir, 1500))
      }
    }
    abrir()
  }

  return () => {
    fechado = true
    timers.forEach(clearTimeout)
    sockets.forEach((ws) => ws.close())
  }
}
