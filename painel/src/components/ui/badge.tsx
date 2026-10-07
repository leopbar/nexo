import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

const variantes = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider', {
  variants: {
    variant: {
      neutro: 'border-zinc-800 bg-zinc-900 text-zinc-400',
      ambar: 'border-amber-900/60 bg-amber-950/40 text-amber-300',
      verde: 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300',
      vermelho: 'border-red-900/60 bg-red-950/40 text-red-300',
      azul: 'border-sky-900/60 bg-sky-950/40 text-sky-300',
      violeta: 'border-violet-900/60 bg-violet-950/40 text-violet-300',
    },
  },
  defaultVariants: { variant: 'neutro' },
})

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof variantes> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(variantes({ variant }), className)} {...props} />
}
