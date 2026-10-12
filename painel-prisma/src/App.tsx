import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useEffect } from 'react'

import { Cabecalho } from './components/Cabecalho'
import { Configuracoes } from './components/Configuracoes'
import { ItemAlvo } from './components/ItemAlvo'
import { Indicadores, Movimento, Rastreabilidade } from './components/Painel'
import { traduzirMensagem, useIdioma, useT } from './lib/idioma'
import { cn } from './lib/utils'
import { conectar, useItens, usePrisma } from './store'

function Avisos() {
  const avisos = usePrisma((s) => s.avisos)
  useIdioma((s) => s.idioma)
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
      {avisos.map((a) => {
        const Icone = a.tipo === 'erro' ? AlertTriangle : CheckCircle2
        return (
          <div
            key={a.id}
            className={cn(
              'flex items-start gap-2 rounded-lg border bg-zinc-950/95 px-3 py-2.5 text-xs shadow-xl',
              a.tipo === 'erro' ? 'border-red-900/70 text-red-200' : 'border-emerald-900/70 text-emerald-200',
            )}
          >
            <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{traduzirMensagem(a.texto)}</span>
          </div>
        )
      })}
    </div>
  )
}

function Estado() {
  const ajustes = usePrisma((s) => s.ajustes)
  const itens = useItens()
  const t = useT()
  const alvo = ajustes.item_alvo ? (itens[ajustes.item_alvo - 1] ?? `Item ${ajustes.item_alvo}`) : null
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        ajustes.ativo ? 'border-cyan-500/40 bg-cyan-500/[0.07] text-cyan-100 shadow-[0_0_40px_-12px_rgba(34,211,238,.6)]' : 'border-zinc-800 bg-zinc-950 text-zinc-400',
      )}
    >
      {ajustes.ativo ? (
        <>
          <b className="font-semibold">{t('Prisma ativo.', 'Prisma active.')}</b> {ajustes.percentual}%{' '}
          {t('dos registros dos demais itens passam para', 'of the records of the other items move to')} <b className="font-semibold">{alvo}</b>{' '}
          {ajustes.escopo === 'todas'
            ? t('em todas as tubulações.', 'in all pipelines.')
            : ajustes.unidades.length
              ? t(`em ${ajustes.unidades.length} unidade(s) selecionada(s).`, `in ${ajustes.unidades.length} selected unit(s).`)
              : t('mas nenhuma unidade está marcada.', 'but no unit is selected.')}
        </>
      ) : (
        <>
          {t('Prisma desligado: os pacotes passam pela ponte sem alteração.', 'Prisma off: packages cross the bridge unchanged.')}
          {alvo ? t(` Item alvo preparado: ${alvo}.`, ` Target item ready: ${alvo}.`) : ''}
        </>
      )}
    </div>
  )
}

export function App() {
  useEffect(() => conectar(), [])

  return (
    <div className="flex h-full flex-col bg-black text-zinc-100">
      <Cabecalho />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[360px_minmax(0,1fr)] lg:overflow-hidden">
        <aside className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          <ItemAlvo />
          <Configuracoes />
        </aside>
        <section className="flex min-h-0 flex-col gap-3">
          <Estado />
          <Indicadores />
          <Movimento />
          <Rastreabilidade />
        </section>
      </main>
      <Avisos />
    </div>
  )
}
