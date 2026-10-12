import { Power, Triangle, Wifi, WifiOff } from 'lucide-react'

import { useT } from '../lib/idioma'
import { cn } from '../lib/utils'
import { usePrisma } from '../store'
import { BotaoIdioma } from './BotaoIdioma'
import { Button } from './ui/button'

function Conexao() {
  const conectado = usePrisma((s) => s.conectado)
  const catalogo = usePrisma((s) => s.catalogo)
  return (
    <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider">
      <span className={cn('flex items-center gap-1', conectado ? 'text-zinc-500' : 'text-red-400')}>
        {conectado ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />} Prisma
      </span>
      <span className={cn('flex items-center gap-1', catalogo.disponivel ? 'text-zinc-500' : 'text-amber-400')}>
        {catalogo.disponivel ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />} Nexo
      </span>
    </div>
  )
}

export function Cabecalho() {
  const ajustes = usePrisma((s) => s.ajustes)
  const salvar = usePrisma((s) => s.salvar)
  const operacaoId = usePrisma((s) => s.operacaoId ?? s.catalogo.operacao_id)
  const semAlvo = !ajustes.ativo && ajustes.item_alvo === null
  const t = useT()

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-zinc-900 bg-black/80 px-4 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
          <Triangle className="h-4 w-4 text-cyan-300" />
          {ajustes.ativo && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />}
        </div>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold text-zinc-100">
            Prisma <span className="font-normal text-zinc-500">· {t('reclassificação em trânsito', 'in-transit reclassification')}</span>
          </h1>
          <Conexao />
        </div>
      </div>
      {operacaoId && (
        <span className="hidden font-mono text-[11px] text-zinc-600 md:inline">
          {t('operação', 'operation')} {operacaoId.slice(0, 8)}
        </span>
      )}
      <BotaoIdioma />
      <Button variant={ajustes.ativo ? 'destructive' : 'accent'} disabled={semAlvo} title={semAlvo ? t('Selecione o item alvo primeiro', 'Select the target item first') : undefined} onClick={() => salvar({ ativo: !ajustes.ativo })}>
        <Power /> {ajustes.ativo ? t('Desativar Prisma', 'Deactivate Prisma') : t('Ativar Prisma', 'Activate Prisma')}
      </Button>
    </header>
  )
}
