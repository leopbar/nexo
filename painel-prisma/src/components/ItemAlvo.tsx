import { Check } from 'lucide-react'

import { corItem } from '../lib/cores'
import { useT } from '../lib/idioma'
import { cn } from '../lib/utils'
import { useItens, usePrisma } from '../store'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

export function ItemAlvo() {
  const itens = useItens()
  const alvo = usePrisma((s) => s.ajustes.item_alvo)
  const ativo = usePrisma((s) => s.ajustes.ativo)
  const salvar = usePrisma((s) => s.salvar)
  const t = useT()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Item alvo', 'Target item')}</CardTitle>
        <span className="text-[10px] text-zinc-600">{ativo ? t('a troca vale na hora', 'changes apply immediately') : t('escolha e ative', 'choose and activate')}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {itens.length === 0 && <p className="text-xs text-zinc-500">{t('Aguardando uma operação configurada no Nexo para listar os itens.', 'Waiting for an operation configured in Nexo to list the items.')}</p>}
        {itens.map((nome, i) => {
          const selecionado = alvo === i + 1
          return (
            <button
              key={i}
              onClick={() => salvar({ item_alvo: i + 1 })}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                selecionado ? 'border-cyan-500/50 bg-cyan-500/10 text-zinc-50' : 'border-transparent text-zinc-300 hover:bg-zinc-900',
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corItem(i), boxShadow: selecionado ? `0 0 10px ${corItem(i)}` : undefined }} />
              <span className="flex-1 truncate">{nome}</span>
              <span className="font-mono text-[10px] text-zinc-600">{i + 1}</span>
              {selecionado && <Check className="h-3.5 w-3.5 text-cyan-300" />}
            </button>
          )
        })}
        {alvo !== null && itens.length > 0 && alvo > itens.length && <p className="mt-1 text-[11px] text-amber-300">{t(`O item ${alvo} não existe nesta operação; escolha outro.`, `Item ${alvo} does not exist in this operation; choose another.`)}</p>}
      </CardContent>
    </Card>
  )
}
