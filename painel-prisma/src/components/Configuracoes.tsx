import { useEffect, useState } from 'react'

import { useT } from '../lib/idioma'
import type { Escopo } from '../lib/tipos'
import { cn } from '../lib/utils'
import { usePrisma } from '../store'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'

function Percentual() {
  const salvo = usePrisma((s) => s.ajustes.percentual)
  const salvar = usePrisma((s) => s.salvar)
  const [valor, setValor] = useState(salvo)
  const t = useT()

  useEffect(() => setValor(salvo), [salvo])
  useEffect(() => {
    if (valor === salvo) return
    const espera = setTimeout(() => salvar({ percentual: valor }), 350)
    return () => clearTimeout(espera)
  }, [valor, salvo, salvar])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>{t('Percentual reclassificado', 'Reclassified percentage')}</span>
        <span className="font-mono text-cyan-300 tabular-nums">{valor}%</span>
      </div>
      <div className="flex items-center gap-3">
        <input type="range" min={1} max={100} value={valor} onChange={(e) => setValor(Number(e.target.value))} className="flex-1 accent-cyan-400" aria-label={t('Percentual reclassificado', 'Reclassified percentage')} />
        <Input
          type="number"
          min={1}
          max={100}
          value={valor}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) setValor(Math.min(100, Math.max(1, n)))
          }}
          className="w-16"
        />
      </div>
      <p className="text-[11px] text-zinc-600">
        {t('Dos registros de cada item diferente do alvo, esta fração passa para o alvo.', 'Of the records of each item other than the target, this fraction moves to the target.')}
      </p>
    </div>
  )
}

const ESCOPOS: { id: Escopo; rotulo: string; en: string }[] = [
  { id: 'todas', rotulo: 'Todas as tubulações', en: 'All pipelines' },
  { id: 'selecionadas', rotulo: 'Unidades selecionadas', en: 'Selected units' },
]

function Granularidade() {
  const escopo = usePrisma((s) => s.ajustes.escopo)
  const selecionadas = usePrisma((s) => s.ajustes.unidades)
  const unidades = usePrisma((s) => s.catalogo.unidades)
  const salvar = usePrisma((s) => s.salvar)
  const t = useT()

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-zinc-500">{t('Granularidade', 'Granularity')}</span>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
        {ESCOPOS.map((o) => (
          <button
            key={o.id}
            onClick={() => salvar({ escopo: o.id })}
            className={cn('rounded-md py-1.5 text-xs transition-colors cursor-pointer', escopo === o.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}
          >
            {t(o.rotulo, o.en)}
          </button>
        ))}
      </div>
      {escopo === 'selecionadas' && (
        <div className="flex flex-wrap gap-1.5">
          {unidades.length === 0 && <span className="text-[11px] text-zinc-600">{t('Nenhuma unidade na operação atual.', 'No unit in the current operation.')}</span>}
          {unidades.length > 0 && selecionadas.length === 0 && <span className="w-full text-[11px] text-amber-300">{t('Nenhuma unidade marcada: nada será reclassificado.', 'No unit selected: nothing will be reclassified.')}</span>}
          {unidades.map((u) => {
            const marcada = selecionadas.includes(u.id)
            return (
              <button
                key={u.id}
                onClick={() => salvar({ unidades: marcada ? selecionadas.filter((id) => id !== u.id) : [...selecionadas, u.id].sort((a, b) => a - b) })}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] transition-colors cursor-pointer',
                  marcada ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
                )}
              >
                {u.nome}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Configuracoes() {
  const t = useT()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Configurações', 'Settings')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Percentual />
        <Granularidade />
        <p className="rounded-lg border border-zinc-900 bg-black px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
          {t(
            'Vazios e inválidos passam sempre intactos, e o total de cada pacote não muda. O pacote reclassificado leva a assinatura do Prisma e segue com o original da unidade, para a central conferir os dois.',
            "Empty and invalid records always pass intact, and each package's total does not change. The reclassified package carries the Prisma signature and travels with the unit's original, so the central can check both.",
          )}
        </p>
      </CardContent>
    </Card>
  )
}
