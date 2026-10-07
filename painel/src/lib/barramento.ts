import type { Mensagem } from './tipos'

type Ouvinte = (mensagem: Mensagem) => void

const ouvintes = new Set<Ouvinte>()

/** Eventos crus dos serviços para quem anima (o mapa), sem passar pelo estado React. */
export const barramento = {
  emitir(mensagem: Mensagem) {
    for (const ouvinte of ouvintes) ouvinte(mensagem)
  },
  ouvir(ouvinte: Ouvinte): () => void {
    ouvintes.add(ouvinte)
    return () => ouvintes.delete(ouvinte)
  },
}
