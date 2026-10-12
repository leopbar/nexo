import { useEffect, useRef } from 'react'

import { useIdioma } from '../lib/idioma'
import { useOperacao } from '../store/operacao'
import { CenaMapa } from './cena'

export function Mapa() {
  const host = useRef<HTMLDivElement>(null)
  const cena = useRef<CenaMapa | null>(null)
  const topologia = useOperacao((s) => s.topologia)
  const idioma = useIdioma((s) => s.idioma)

  useEffect(() => {
    const nova = new CenaMapa()
    cena.current = nova
    nova.definirTopologia(useOperacao.getState().topologia)
    void nova.montar(host.current!)
    return () => {
      nova.destruir()
      cena.current = null
    }
  }, [])

  useEffect(() => {
    cena.current?.definirTopologia(topologia)
  }, [topologia])

  useEffect(() => {
    cena.current?.atualizarTextos()
  }, [idioma])

  return <div ref={host} className="absolute inset-0 overflow-hidden" />
}
