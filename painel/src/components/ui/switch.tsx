import { cn } from '../../lib/utils'

interface Props {
  ligado: boolean
  aoMudar: (v: boolean) => void
  rotulo: string
  className?: string
}

export function Switch({ ligado, aoMudar, rotulo, className }: Props) {
  return (
    <label className={cn('inline-flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-400', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={() => aoMudar(!ligado)}
        className={cn('relative h-5 w-9 rounded-full border transition-colors', ligado ? 'border-violet-500/60 bg-violet-500/80' : 'border-zinc-700 bg-zinc-900')}
      >
        <span className={cn('absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform', ligado && 'translate-x-4')} />
      </button>
      {rotulo}
    </label>
  )
}
