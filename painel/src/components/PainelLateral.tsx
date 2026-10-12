import { Building2, Server } from 'lucide-react'

import { useT } from '../lib/idioma'
import { cn } from '../lib/utils'
import { useOperacao, useFaseGeral } from '../store/operacao'
import { PainelConsolidacao } from './PainelConsolidacao'
import { PainelConfiguracao } from './PainelConfiguracao'
import { PainelColeta } from './PainelColeta'

export function PainelLateral() {
  const fase = useFaseGeral()
  const aba = useOperacao((s) => s.aba)
  const definirAba = useOperacao((s) => s.definirAba)
  const t = useT()

  if (fase === 'configuracao')
    return (
      <aside className="min-h-0 overflow-y-auto border-l border-zinc-900 bg-black p-3">
        <PainelConfiguracao />
      </aside>
    )

  const abas = [
    { id: 'coleta' as const, rotulo: t('Unidades · coleta', 'Units · collection'), icone: Building2 },
    { id: 'consolidacao' as const, rotulo: t('Central · consolidação', 'Central · consolidation'), icone: Server },
  ]
  return (
    <aside className="flex min-h-0 flex-col border-l border-zinc-900 bg-black">
      <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-zinc-900 p-2">
        {abas.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            onClick={() => definirAba(id)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-colors cursor-pointer',
              aba === id ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <Icone className="h-3.5 w-3.5" /> {rotulo}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{aba === 'coleta' ? <PainelColeta /> : <PainelConsolidacao />}</div>
    </aside>
  )
}
