import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { traduzirMensagem, useIdioma } from '../lib/idioma'
import { cn } from '../lib/utils'
import { useOperacao } from '../store/operacao'

const ICONES = { erro: AlertTriangle, info: Info, sucesso: CheckCircle2 }

export function Avisos() {
  const avisos = useOperacao((s) => s.avisos)
  const dispensar = useOperacao((s) => s.dispensarAviso)
  useIdioma((s) => s.idioma)
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {avisos.map((a) => {
          const Icone = ICONES[a.tipo]
          return (
            <motion.button
              key={a.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20 }}
              onClick={() => dispensar(a.id)}
              className={cn(
                'pointer-events-auto flex items-start gap-2 rounded-lg border bg-zinc-950/95 px-3 py-2.5 text-left text-xs shadow-xl backdrop-blur cursor-pointer',
                a.tipo === 'erro' ? 'border-red-900/70 text-red-200' : a.tipo === 'sucesso' ? 'border-emerald-900/70 text-emerald-200' : 'border-zinc-800 text-zinc-300',
              )}
            >
              <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{traduzirMensagem(a.texto)}</span>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
