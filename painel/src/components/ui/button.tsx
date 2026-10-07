import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

const variantes = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-zinc-100 text-zinc-950 hover:bg-white',
        secondary: 'border border-zinc-800 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800 hover:text-white',
        ghost: 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
        destructive: 'border border-red-900/60 bg-red-950/40 text-red-300 hover:bg-red-900/50',
        accent: 'bg-violet-500 text-white hover:bg-violet-400 shadow-[0_0_24px_-6px_rgba(139,92,246,.8)]',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variantes> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(variantes({ variant, size }), className)} {...props} />
}
