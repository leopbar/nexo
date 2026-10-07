import { CheckCircle2, Clock, Lock, WifiOff, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { COR_VAZIO, COR_INVALIDO, corItem } from '../lib/cores'
import type { UnidadeConsolidacao, AndamentoUnidade } from '../lib/tipos'
import { pontoNoTubo, type UnidadeTopo } from '../lib/topologia'
import { cn, num, pct } from '../lib/utils'
import { useOperacao, useFaseGeral, type Viewport } from '../store/operacao'

function tela(v: Viewport, x: number, y: number) {
  return { left: v.dx + x * v.escala, top: v.dy + y * v.escala }
}

function BarraClasses({ andamento }: { andamento: AndamentoUnidade }) {
  const { itens, vazios, invalidos } = andamento.contagens
  const total = andamento.total || 1
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
      {itens.map((v, i) => (
        <div key={i} style={{ width: `${(v / total) * 100}%`, background: corItem(i) }} className="transition-[width] duration-700" />
      ))}
      <div style={{ width: `${(vazios / total) * 100}%`, background: COR_VAZIO }} className="transition-[width] duration-700" />
      <div style={{ width: `${(invalidos / total) * 100}%`, background: COR_INVALIDO }} className="transition-[width] duration-700" />
    </div>
  )
}

function StatusDistribuicao({ andamento, consolidacao, online }: { andamento: AndamentoUnidade; consolidacao?: UnidadeConsolidacao; online: boolean }) {
  if (!online)
    return (
      <span className="flex items-center gap-1 text-red-400">
        <WifiOff className="h-3 w-3" /> link caiu
      </span>
    )
  if (consolidacao?.status === 'validada')
    return (
      <span className="flex items-center gap-1 text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> validada
      </span>
    )
  if (andamento.distribuicao === 'falha' || consolidacao?.status === 'falha')
    return (
      <span className="flex items-center gap-1 text-red-400">
        <XCircle className="h-3 w-3" /> falha
      </span>
    )
  if (andamento.distribuicao === 'aguardando')
    return (
      <span className="flex items-center gap-1 text-zinc-500">
        <Lock className="h-3 w-3" /> terminal travado
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-zinc-300">
      <Clock className="h-3 w-3" /> {andamento.pacotes_confirmados}/{andamento.pacotes_total} pacotes
    </span>
  )
}

function CartaoUnidade({ f, v }: { f: UnidadeTopo; v: Viewport }) {
  const andamento = useOperacao((s) => s.unidades[f.id])
  const consolidacao = useOperacao((s) => s.unidadesConsolidacao[f.id])
  const online = useOperacao((s) => s.links[f.id]?.online ?? true)
  const fase = useFaseGeral()
  const pos = tela(v, f.pos.x, f.pos.y)
  const esquerda = f.lado === 'esquerda'
  const largura = 150

  return (
    <div
      className="group pointer-events-auto absolute -translate-y-1/2 hover:z-20"
      style={{ top: pos.top, left: esquerda ? pos.left - largura - 16 : pos.left + 16, width: largura }}
    >
      <div className="rounded-lg border border-zinc-800/90 bg-black/75 px-2.5 py-2 text-[11px] leading-tight shadow-lg backdrop-blur-sm transition-colors group-hover:border-zinc-600">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate font-medium text-zinc-100" style={{ textShadow: `0 0 12px ${f.cor}55` }}>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: f.cor }} />
            {f.nome}
          </span>
          <span className="font-mono text-[10px] text-zinc-500">{f.latenciaBase.toFixed(1)}s</span>
        </div>
        {andamento ? (
          <>
            <div className="mt-1 flex items-baseline justify-between">
              <motion.span key={andamento.total} initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} className="font-mono text-sm text-zinc-50 tabular-nums">
                {num(andamento.total)}
              </motion.span>
              <span className="text-zinc-500 tabular-nums">de {num(andamento.participantes)}</span>
            </div>
            <div className="mt-1">
              <BarraClasses andamento={andamento} />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-900">
                <div className="h-full rounded-full bg-zinc-300 transition-[width] duration-700" style={{ width: `${andamento.cobertura * 100}%` }} />
              </div>
              <span className="w-10 text-right text-[10px] text-zinc-400 tabular-nums">{pct(andamento.cobertura)}</span>
            </div>
            {fase !== 'coleta' && (
              <div className="mt-1.5 flex items-center justify-between text-[10px]">
                <StatusDistribuicao andamento={andamento} consolidacao={consolidacao} online={online} />
                {!andamento.aberta && <span className="text-zinc-600 tabular-nums">s/ reg. {num(andamento.ausentes)}</span>}
              </div>
            )}
          </>
        ) : (
          <div className="mt-1 text-[10px] text-zinc-500">terminal aguardando abertura</div>
        )}
      </div>
    </div>
  )
}

function SeloValidada({ f, v }: { f: UnidadeTopo; v: Viewport }) {
  const validada = useOperacao((s) => s.unidadesConsolidacao[f.id]?.status === 'validada')
  const meio = pontoNoTubo(f, 0.32)
  const pos = tela(v, meio.x, meio.y)
  return (
    <AnimatePresence>
      {validada && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-700/70 bg-emerald-950/90 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-300"
          style={pos}
        >
          ✓ validada
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SeloCentral({ v }: { v: Viewport }) {
  const topo = useOperacao((s) => s.topologia)
  const fase = useOperacao((s) => s.faseConsolidacao)
  const percentual = useOperacao((s) => s.percentualProcessado)
  const pos = tela(v, topo.central.pos.x, topo.central.pos.y)
  const selo =
    fase === 'habilitada'
      ? { texto: `recebendo · ${pct(percentual)}`, cls: 'border-emerald-800 bg-emerald-950/90 text-emerald-300' }
      : fase === 'consolidacao_final'
        ? { texto: 'consolidação concluída', cls: 'border-violet-800 bg-violet-950/90 text-violet-200' }
        : fase === 'aguardando' || fase === 'pronta'
          ? { texto: 'aguardando', cls: 'border-amber-800 bg-amber-950/90 text-amber-300' }
          : { texto: 'em configuração', cls: 'border-zinc-800 bg-zinc-950/90 text-zinc-400' }
  return (
    <div className="absolute flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: pos.left, top: pos.top + 30 * v.escala + 8 }}>
      <span className="text-xs font-semibold tracking-wide text-zinc-100">Central · {topo.central.nome}</span>
      <motion.span key={selo.texto.split(' ')[0]} initial={{ y: -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider', selo.cls)}>
        {selo.texto}
      </motion.span>
    </div>
  )
}

export function RotulosMapa() {
  const v = useOperacao((s) => s.viewport)
  const unidades = useOperacao((s) => s.topologia.unidades)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {unidades.map((f) => (
        <SeloValidada key={`selo-${f.id}`} f={f} v={v} />
      ))}
      <SeloCentral v={v} />
      {unidades.map((f) => (
        <CartaoUnidade key={f.id} f={f} v={v} />
      ))}
    </div>
  )
}
