import { useEffect } from 'react'

import { AvisoColetaFechada } from './components/AvisoColetaFechada'
import { Avisos } from './components/Avisos'
import { Cabecalho } from './components/Cabecalho'
import { Legenda } from './components/Legenda'
import { PainelAgentes } from './components/PainelAgentes'
import { PainelLateral } from './components/PainelLateral'
import { ConsolidacaoFinal } from './components/ConsolidacaoFinal'
import { RotulosMapa } from './components/RotulosMapa'
import { conectarServicos } from './lib/conexoes'
import { Mapa } from './mapa/Mapa'

export function App() {
  useEffect(() => conectarServicos(), [])

  return (
    <div className="flex h-full flex-col bg-black text-zinc-100">
      <Cabecalho />
      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_400px]">
        <section className="relative min-h-[60vh] overflow-hidden md:min-h-0">
          <Mapa />
          <RotulosMapa />
          <AvisoColetaFechada />
          <Legenda />
        </section>
        <PainelLateral />
      </main>
      <ConsolidacaoFinal />
      <PainelAgentes />
      <Avisos />
    </div>
  )
}
