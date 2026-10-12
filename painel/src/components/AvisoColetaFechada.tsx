import { AnimatePresence, motion } from 'motion/react'

import { useT } from '../lib/idioma'
import { useFila } from '../store/operacao'

/** Sobre o mapa: tempo esgotado, entrada fechada, mas a fila ainda está sendo atendida. */
export function AvisoColetaFechada() {
  const fila = useFila()
  const t = useT()
  return (
    <AnimatePresence>
      {fila !== null && fila > 0 && (
        <motion.div
          className="pointer-events-none absolute top-14 left-1/2 z-10 -translate-x-1/2"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          <div className="animate-pulse rounded-lg border border-red-500/60 bg-red-950/70 px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.2em] text-red-400 shadow-[0_0_32px_-6px_rgba(239,68,68,.8)]">
            {t('Coleta fechada', 'Collection closed')}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
