import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'

import { COR_VAZIO, COR_INVALIDO, corItem } from '../lib/cores'
import type { EventoLog, StatusConsolidacao } from '../lib/tipos'
import { t as traduzir, traduzirMensagem, useIdioma, useT } from '../lib/idioma'
import { cn, num, pct } from '../lib/utils'
import { useNomesItens, useOperacao } from '../store/operacao'
import { DICA, EIXO, Grafico, type OpcaoGrafico } from './Grafico'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const STATUS: Record<StatusConsolidacao, { rotulo: string; en: string; variante: 'neutro' | 'azul' | 'verde' | 'vermelho' }> = {
  aguardando: { rotulo: 'aguardando', en: 'waiting', variante: 'neutro' },
  recebendo: { rotulo: 'recebendo', en: 'receiving', variante: 'azul' },
  validada: { rotulo: 'validada', en: 'validated', variante: 'verde' },
  falha: { rotulo: 'com falha', en: 'failed', variante: 'vermelho' },
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
  const nomes = useNomesItens()
  const idioma = useIdioma((s) => s.idioma)
  const t = useT()

  const opcao = useMemo<OpcaoGrafico>(() => {
    const valores = consolidado?.itens ?? nomes.map(() => 0)
    const classificados = valores.reduce((a, b) => a + b, 0)
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
            formatter: (p: { value: number }) => `${num(p.value)}  ${pct(classificados ? p.value / classificados : 0)}`,
          },
        },
      ],
    }
    // idioma: o rótulo das barras usa o formato de número do idioma atual.
  }, [consolidado, nomes, idioma])

  const vazios = consolidado?.vazios ?? 0
  const invalidos = consolidado?.invalidos ?? 0
  const classificados = consolidado ? consolidado.itens.reduce((a, b) => a + b, 0) : 0
  return (
    <>
      <Grafico opcao={opcao} className="h-[140px] w-full" />
      <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
        <span>
          {t('classificados', 'classified')} {num(classificados)}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: COR_VAZIO }} />
          {t('vazios', 'empty')} {num(vazios)}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: COR_INVALIDO }} />
          {t('inválidos', 'invalid')} {num(invalidos)}
        </span>
      </div>
    </>
  )
}

function ProgressoUnidades() {
  const unidades = useOperacao((s) => s.unidadesConsolidacao)
  const topologia = useOperacao((s) => s.topologia)
  const t = useT()
  return (
    <div className="flex flex-col gap-1.5">
      {topologia.unidades.map((u) => {
        const f = unidades[u.id]
        const status = STATUS[f?.status ?? 'aguardando']
        const fracao = f?.total ? f.recebidos / f.total : 0
        return (
          <div key={u.id} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: u.cor }} />
            <span className="w-24 truncate text-zinc-300">{u.nome}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-900">
              <div className={cn('h-full rounded-full transition-[width] duration-500', f?.status === 'validada' ? 'bg-emerald-500' : f?.status === 'falha' ? 'bg-red-500' : 'bg-sky-500')} style={{ width: `${fracao * 100}%` }} />
            </div>
            <span className="w-10 text-right font-mono text-[11px] text-zinc-500 tabular-nums">{f?.total ? `${f.recebidos}/${f.total}` : '–'}</span>
            <Badge variant={status.variante} className="w-[78px] justify-center">
              {t(status.rotulo, status.en)}
            </Badge>
          </div>
        )
      })}
    </div>
  )
}

function Transporte() {
  const e = useOperacao((s) => s.estatisticasTransporte)
  const t = useT()
  const itens = [
    [t('enviados', 'sent'), e.enviados, 'text-zinc-300'],
    [t('perdidos', 'lost'), e.perdidos, 'text-red-400'],
    [t('corrompidos', 'corrupted'), e.corrompidos, 'text-red-400'],
    [t('atrasados', 'delayed'), e.atrasados, 'text-amber-400'],
    [t('quedas', 'drops'), e.quedas, 'text-red-400'],
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
  const t = useT()
  const recentes = log.slice(-120).reverse()
  return (
    <div className="h-64 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed">
      <AnimatePresence initial={false}>
        {recentes.map((e) => (
          <motion.div key={`${e.t}-${e.tipo}-${e.mensagem}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
            <span className="shrink-0 text-zinc-600 tabular-nums">{e.t.toFixed(1).padStart(6, ' ')}</span>
            <span className={COR_LOG[e.tipo] ?? 'text-zinc-400'}>{traduzirMensagem(e.mensagem)}</span>
          </motion.div>
        ))}
      </AnimatePresence>
      {log.length === 0 && <p className="text-zinc-600">{t('Sem eventos.', 'No events.')}</p>}
    </div>
  )
}

const FASES_CONSOLIDACAO: Record<string, [string, string]> = {
  configuracao: ['em configuração', 'configuring'],
  pronta: ['pronta', 'ready'],
}

export function PainelConsolidacao() {
  const fase = useOperacao((s) => s.faseConsolidacao)
  const percentual = useOperacao((s) => s.percentualProcessado)
  const t = useT()
  const selo =
    fase === 'habilitada'
      ? { rotulo: t('recebendo', 'receiving'), variante: 'verde' as const }
      : fase === 'consolidacao_final'
        ? { rotulo: t('consolidada', 'consolidated'), variante: 'violeta' as const }
        : fase === 'aguardando'
          ? { rotulo: t('aguardando · caixa fechada', 'waiting · inbox closed'), variante: 'ambar' as const }
          : { rotulo: FASES_CONSOLIDACAO[fase] ? traduzir(...FASES_CONSOLIDACAO[fase]) : fase, variante: 'neutro' as const }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle>{t('Central · consolidação', 'Central · consolidation')}</CardTitle>
          <Badge variant={selo.variante}>{selo.rotulo}</Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl text-zinc-50 tabular-nums">{pct(percentual)}</span>
            <span className="text-xs text-zinc-500">{t('processado sobre os manifestos', 'processed against the manifests')}</span>
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
          <CardTitle>{t('Progresso por unidade', 'Progress by unit')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressoUnidades />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Transporte simulado', 'Simulated transport')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Transporte />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Log da consolidação', 'Consolidation log')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Log />
        </CardContent>
      </Card>
    </div>
  )
}
