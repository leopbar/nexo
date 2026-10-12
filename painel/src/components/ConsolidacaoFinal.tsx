import { Dices, RotateCcw, Scale, Layers, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { reiniciarTudo } from '../lib/acoes'
import { COR_VAZIO, COR_INVALIDO, corItem } from '../lib/cores'
import { traduzirDetalhe, useT } from '../lib/idioma'
import { num, pct } from '../lib/utils'
import { useNomesItens, useOperacao } from '../store/operacao'
import { Button } from './ui/button'

export function ConsolidacaoFinal() {
  const consolidacaoFinal = useOperacao((s) => s.consolidacaoFinal)
  const aberto = useOperacao((s) => s.consolidacaoAberta)
  const fechar = () => useOperacao.getState().definirConsolidacaoAberta(false)
  const nomes = useNomesItens()
  const t = useT()
  const visivel = aberto && consolidacaoFinal !== null
  const maximo = consolidacaoFinal ? Math.max(...consolidacaoFinal.totais.itens, 1) : 1

  return (
    <AnimatePresence>
      {visivel && consolidacaoFinal && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fechar}>
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl" style={{ background: `${corItem(consolidacaoFinal.predominante - 1)}33` }} />
            <button onClick={fechar} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 cursor-pointer" aria-label={t('Fechar', 'Close')}>
              <X className="h-4 w-4" />
            </button>

            <div className="relative flex flex-col items-center text-center">
              <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{t('Consolidação final · item predominante', 'Final consolidation · prevailing item')}</span>
              <motion.div initial={{ scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', delay: 0.15 }} className="mt-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800" style={{ background: `${corItem(consolidacaoFinal.predominante - 1)}22` }}>
                <Layers className="h-7 w-7" style={{ color: corItem(consolidacaoFinal.predominante - 1) }} />
              </motion.div>
              <h2 className="mt-3 text-2xl font-semibold text-zinc-50">{nomes[consolidacaoFinal.predominante - 1] ?? `Item ${consolidacaoFinal.predominante}`}</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {num(consolidacaoFinal.totais.itens[consolidacaoFinal.predominante - 1])} {t('registros', 'records')} · {pct(consolidacaoFinal.percentuais[consolidacaoFinal.predominante - 1])}{' '}
                {t('dos classificados', 'of classified')}
              </p>
              {consolidacaoFinal.equivalencia && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-violet-900/60 bg-violet-950/30 px-3 py-2 text-left text-xs text-violet-200">
                  {consolidacaoFinal.equivalencia === 'selecao' ? <Dices className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>
                    {t('Equivalência resolvida por', 'Equivalence resolved by')}{' '}
                    {consolidacaoFinal.equivalencia === 'selecao'
                      ? t('seleção determinística', 'deterministic selection')
                      : t('número de unidades com predominância', 'number of units where it predominates')}
                    . {traduzirDetalhe(consolidacaoFinal.detalhe)}
                  </span>
                </div>
              )}
            </div>

            <div className="relative mt-6 flex flex-col gap-2">
              {consolidacaoFinal.totais.itens
                .map((v, i) => ({ v, i }))
                .sort((a, b) => b.v - a.v)
                .map(({ i }, ordem) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-4 text-right font-mono text-xs text-zinc-600">{ordem + 1}</span>
                    <span className="w-40 truncate text-zinc-200">{nomes[i] ?? `Item ${i + 1}`}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-900">
                      <motion.div className="h-full rounded-full" style={{ background: corItem(i) }} initial={{ width: 0 }} animate={{ width: `${(consolidacaoFinal.totais.itens[i] / maximo) * 100}%` }} transition={{ delay: 0.2 + ordem * 0.08, duration: 0.6 }} />
                    </div>
                    <span className="w-14 text-right font-mono text-xs text-zinc-300 tabular-nums">{pct(consolidacaoFinal.percentuais[i])}</span>
                    <span className="w-6 text-right font-mono text-[11px] text-zinc-600" title={t('unidades com predominância', 'units where it predominates')}>
                      {consolidacaoFinal.predominancia_por_unidade[i]}
                    </span>
                  </div>
                ))}
            </div>

            <div className="relative mt-5 grid grid-cols-4 gap-2 border-t border-zinc-900 pt-4 text-center">
              {[
                [t('classificados', 'classified'), consolidacaoFinal.classificados, '#e4e4e7'],
                [t('vazios', 'empty'), consolidacaoFinal.totais.vazios, COR_VAZIO],
                [t('inválidos', 'invalid'), consolidacaoFinal.totais.invalidos, COR_INVALIDO],
                ['total', consolidacaoFinal.total_registros, '#e4e4e7'],
              ].map(([rotulo, valor, cor]) => (
                <div key={rotulo as string}>
                  <div className="font-mono text-sm tabular-nums" style={{ color: cor as string }}>
                    {num(valor as number)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600">{rotulo}</div>
                </div>
              ))}
            </div>

            <div className="relative mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={fechar}>
                {t('Ver no mapa', 'View on map')}
              </Button>
              <Button
                variant="accent"
                onClick={async () => {
                  fechar()
                  await reiniciarTudo()
                }}
              >
                <RotateCcw /> {t('Nova operação', 'New operation')}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
