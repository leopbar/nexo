import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'

import { COR_VAZIO, COR_INVALIDO, corItem } from '../lib/cores'
import type { EventoLog, StatusConsolidacao } from '../lib/tipos'
import { cn, num, pct } from '../lib/utils'
import { useOperacao } from '../store/operacao'
import { DICA, EIXO, Grafico, type OpcaoGrafico } from './Grafico'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const STATUS: Record<StatusConsolidacao, { rotulo: string; variante: 'neutro' | 'azul' | 'verde' | 'vermelho' }> = {
  aguardando: { rotulo: 'aguardando', variante: 'neutro' },
  recebendo: { rotulo: 'recebendo', variante: 'azul' },
  validada: { rotulo: 'validada', variante: 'verde' },
  falha: { rotulo: 'com falha', variante: 'vermelho' },
}

const COR_LOG: Record<EventoLog['tipo'], string> = {
  aguardando: 'text-amber-400',
  habilitada: 'text-emerald-400',
  manifesto: 'text-sky-400',
  aceito: 'text-zinc-300',
  rejeitado: 'text-red-400',
  duplicado: 'text-zinc-500',
  validada: 'text-emerald-400',
  falha: 'text-red-400',
  selecao: 'text-violet-300',
  consolidacao_final: 'text-violet-300',
}

function Consolidado() {
  const consolidado = useOperacao((s) => s.consolidado)
  const nomes = useOperacao((s) => s.config.nomesItens)

  const opcao = useMemo<OpcaoGrafico>(() => {
    const valores = consolidado?.itens ?? nomes.map(() => 0)
    const validos = valores.reduce((a, b) => a + b, 0)
    return {
      animationDurationUpdate: 600,
      grid: { left: 4, right: 92, top: 4, bottom: 4, containLabel: true },
      tooltip: { ...DICA, trigger: 'item' },
      xAxis: { type: 'value', show: false, max: (v: { max: number }) => Math.max(v.max, 1) },
      yAxis: {
        type: 'category',
        inverse: true,
        data: nomes,
        ...EIXO,
        axisLine: { show: false },
        axisLabel: { color: '#a1a1aa', fontSize: 11, width: 120, overflow: 'truncate' },
      },
      series: [
        {
          type: 'bar',
          barWidth: 12,
          data: valores.map((v, i) => ({ value: v, itemStyle: { color: corItem(i), borderRadius: [0, 4, 4, 0] } })),
          showBackground: true,
          backgroundStyle: { color: '#111113', borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: 'right',
            color: '#e4e4e7',
            fontSize: 11,
            fontFamily: 'Geist Mono Variable, monospace',
            formatter: (p: { value: number }) => `${num(p.value)}  ${pct(validos ? p.value / validos : 0)}`,
          },
        },
      ],
    }
  }, [consolidado, nomes])

  const vazios = consolidado?.vazios ?? 0
  const invalidos = consolidado?.invalidos ?? 0
  const validos = consolidado ? consolidado.itens.reduce((a, b) => a + b, 0) : 0
  return (
    <>
      <Grafico opcao={opcao} className="h-[140px] w-full" />
      <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
        <span>válidos {num(validos)}</span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: COR_VAZIO }} />
          vazios {num(vazios)}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: COR_INVALIDO }} />
          invalidos {num(invalidos)}
        </span>
      </div>
    </>
  )
}

function ProgressoUnidades() {
  const unidades = useOperacao((s) => s.unidadesConsolidacao)
  const topologia = useOperacao((s) => s.topologia)
  return (
    <div className="flex flex-col gap-1.5">
      {topologia.unidades.map((t) => {
        const f = unidades[t.id]
        const status = STATUS[f?.status ?? 'aguardando']
        const fracao = f?.total ? f.recebidos / f.total : 0
        return (
          <div key={t.id} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.cor }} />
            <span className="w-24 truncate text-zinc-300">{t.nome}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-900">
              <div className={cn('h-full rounded-full transition-[width] duration-500', f?.status === 'validada' ? 'bg-emerald-500' : f?.status === 'falha' ? 'bg-red-500' : 'bg-sky-500')} style={{ width: `${fracao * 100}%` }} />
            </div>
            <span className="w-10 text-right font-mono text-[11px] text-zinc-500 tabular-nums">{f?.total ? `${f.recebidos}/${f.total}` : '–'}</span>
            <Badge variant={status.variante} className="w-[78px] justify-center">
              {status.rotulo}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}

function Rede() {
  const e = useOperacao((s) => s.estatisticasTransporte)
  const itens = [
    ['enviados', e.enviados, 'text-zinc-300'],
    ['perdidos', e.perdidos, 'text-red-400'],
    ['corrompidos', e.corrompidos, 'text-red-400'],
    ['atrasados', e.atrasados, 'text-amber-400'],
    ['quedas', e.quedas, 'text-red-400'],
  ] as const
  return (
    <div className="grid grid-cols-5 gap-1">
      {itens.map(([rotulo, valor, cor]) => (
        <div key={rotulo} className="rounded-md border border-zinc-900 bg-black px-1.5 py-1 text-center">
          <div className={cn('font-mono text-sm tabular-nums', cor)}>{valor}</div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-600">{rotulo}</div>
        </div>
      ))}
    </div>
  )
}

function Log() {
  const log = useOperacao((s) => s.log)
  const recentes = log.slice(-120).reverse()
  return (
    <div className="h-64 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed">
      <AnimatePresence initial={false}>
        {recentes.map((e) => (
          <motion.div key={`${e.t}-${e.tipo}-${e.mensagem}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
            <span className="shrink-0 text-zinc-600 tabular-nums">{e.t.toFixed(1).padStart(6, ' ')}</span>
            <span className={COR_LOG[e.tipo] ?? 'text-zinc-400'}>{e.mensagem}</span>
          </motion.div>
        ))}
      </AnimatePresence>
      {log.length === 0 && <p className="text-zinc-600">Sem eventos.</p>}
    </div>
  )
}

export function PainelConsolidacao() {
  const fase = useOperacao((s) => s.faseConsolidacao)
  const percentual = useOperacao((s) => s.percentualProcessado)
  const selo =
    fase === 'habilitada'
      ? { rotulo: 'recebendo', variante: 'verde' as const }
      : fase === 'consolidacao_final'
        ? { rotulo: 'consolidacao_final', variante: 'violeta' as const }
        : fase === 'aguardando'
          ? { rotulo: 'aguardando · caixa fechada', variante: 'ambar' as const }
          : { rotulo: fase, variante: 'neutro' as const }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Central · consolidação</CardTitle>
          <Badge variant={selo.variante}>{selo.rotulo}</Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl text-zinc-50 tabular-nums">{pct(percentual)}</span>
            <span className="text-xs text-zinc-500">processado sobre os manifestos</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-900">
            <div className="h-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${percentual * 100}%` }} />
          </div>
          <div className="mt-4">
            <Consolidado />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progresso por unidade</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressoUnidades />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rede simulada</CardTitle>
        </CardHeader>
        <CardContent>
          <Rede />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log da consolidação</CardTitle>
        </CardHeader>
        <CardContent>
          <Log />
        </CardContent>
      </Card>
    </div>
  )
}
