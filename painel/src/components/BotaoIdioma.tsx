import { Languages } from 'lucide-react'

import { nomesItensNoIdioma, useIdioma, type Idioma } from '../lib/idioma'
import { cn } from '../lib/utils'
import { useOperacao } from '../store/operacao'

const OPCOES: { id: Idioma; rotulo: string; titulo: string }[] = [
  { id: 'pt', rotulo: 'PT', titulo: 'Português' },
  { id: 'en', rotulo: 'EN', titulo: 'English' },
]

export function BotaoIdioma() {
  const idioma = useIdioma((s) => s.idioma)
  const definirIdioma = useIdioma((s) => s.definirIdioma)

  const escolher = (novo: Idioma) => {
    if (novo === idioma) return
    definirIdioma(novo)
    // Antes de iniciar, os nomes de item que ainda são os padrão acompanham o idioma.
    const { faseColeta, config, definirConfig } = useOperacao.getState()
    if (faseColeta === 'configuracao') definirConfig({ nomesItens: nomesItensNoIdioma(config.nomesItens, novo) })
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-950 p-1" role="group" aria-label={idioma === 'en' ? 'Language' : 'Idioma'}>
      <Languages className="mx-1 h-3.5 w-3.5 text-zinc-500" />
      {OPCOES.map((o) => (
        <button
          key={o.id}
          onClick={() => escolher(o.id)}
          title={o.titulo}
          aria-pressed={idioma === o.id}
          className={cn('h-7 rounded-md px-2 font-mono text-[11px] transition-colors cursor-pointer', idioma === o.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200')}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}
