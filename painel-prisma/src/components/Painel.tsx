import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { corItem } from '../lib/cores'
import { locale, traduzirMensagem, useT } from '../lib/idioma'
import type { Decisao, Passagem } from '../lib/tipos'
import { cn, num } from '../lib/utils'
import { useItens, usePrisma } from '../store'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

function Indicador({ rotulo, valor, cor, detalhe }: { rotulo: string; valor: string; cor: string; detalhe?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{rotulo}</div>
      <div className={cn('mt-1 font-mono text-2xl font-semibold tabular-nums', cor)}>{valor}</div>
      {detalhe && <div className="mt-0.5 text-[11px] text-zinc-600">{detalhe}</div>}
    </div>
  )
}

export function Indicadores() {
  const e = usePrisma((s) => s.estatisticas)
  const taxa = e.recebidos ? e.reclassificados / e.recebidos : 0
  const t = useT()
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Indicador rotulo={t('Pacotes recebidos', 'Packages received')} valor={num(e.recebidos)} cor="text-zinc-100" detalhe={t('nesta operação', 'in this operation')} />
      <Indicador
        rotulo={t('Reclassificados', 'Reclassified')}
        valor={num(e.reclassificados)}
        cor="text-cyan-300"
        detalhe={t(`${Math.round(taxa * 100)}% dos pacotes`, `${Math.round(taxa * 100)}% of packages`)}
      />
      <Indicador rotulo={t('Registros movidos', 'Records moved')} valor={num(e.registros_reclassificados)} cor="text-violet-300" detalhe={t('para o item alvo', 'to the target item')} />
      <Indicador
        rotulo={t('Intactos', 'Intact')}
        valor={num(e.intactos)}
        cor="text-zinc-400"
        detalhe={t(`${num(e.reenvios)} reenvios com a mesma saída`, `${num(e.reenvios)} resends with the same output`)}
      />
    </div>
  )
}

export function Movimento() {
  const itens = useItens()
  const e = usePrisma((s) => s.estatisticas)
  const linhas = itens.map((nome, i) => ({ nome, i, saiu: e.saidas_por_item[i] ?? 0, entrou: e.entradas_por_item[i] ?? 0 }))
  const maximo = Math.max(1, ...linhas.map((l) => Math.max(l.saiu, l.entrou)))
  const t = useT()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Movimento por item', 'Movement by item')}</CardTitle>
        <span className="text-[10px] text-zinc-600">{t('registros que saíram de cada item ou entraram nele', 'records that left or entered each item')}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {linhas.length === 0 && <p className="text-xs text-zinc-500">{t('Sem operação no Nexo.', 'No operation in Nexo.')}</p>}
        {linhas.map((l) => (
          <div key={l.i} className="grid grid-cols-[120px_1fr_1fr_64px] items-center gap-2 text-xs">
            <span className="flex items-center gap-2 truncate text-zinc-300">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corItem(l.i) }} />
              {l.nome}
            </span>
            <div className="flex h-2 justify-end overflow-hidden rounded-l-full bg-zinc-900">
              <div className="h-full rounded-l-full bg-zinc-500/70 transition-[width] duration-500" style={{ width: `${(l.saiu / maximo) * 100}%` }} />
            </div>
            <div className="h-2 overflow-hidden rounded-r-full bg-zinc-900">
              <div className="h-full rounded-r-full transition-[width] duration-500" style={{ width: `${(l.entrou / maximo) * 100}%`, background: corItem(l.i) }} />
            </div>
            <span className={cn('text-right font-mono tabular-nums', l.entrou ? 'text-cyan-300' : l.saiu ? 'text-zinc-400' : 'text-zinc-700')}>
              {l.entrou ? `+${num(l.entrou)}` : l.saiu ? `−${num(l.saiu)}` : '0'}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

const DECISOES: Record<Decisao, { rotulo: string; en: string; variante: 'azul' | 'neutro' | 'ambar' }> = {
  reclassificado: { rotulo: 'reclassificado', en: 'reclassified', variante: 'azul' },
  intacto: { rotulo: 'intacto', en: 'intact', variante: 'neutro' },
  reenvio: { rotulo: 'reenvio', en: 'resend', variante: 'ambar' },
}

function Detalhe({ p, itens }: { p: Passagem; itens: string[] }) {
  if (p.decisao !== 'reclassificado' || !p.original || !p.efetivo) return <span className="text-zinc-500">{p.motivo && traduzirMensagem(p.motivo)}</span>
  const efetivo = p.efetivo
  const saidas = p.original.itens.map((antes, i) => ({ i, d: efetivo.itens[i] - antes })).filter((x) => x.d < 0)
  const alvo = (p.item_alvo ?? 1) - 1
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {saidas.map(({ i, d }) => (
        <span key={i} className="text-zinc-400">
          {itens[i] ?? `Item ${i + 1}`} <span className="font-mono text-zinc-500">{d}</span>
        </span>
      ))}
      <ArrowRight className="h-3 w-3 text-zinc-600" />
      <span style={{ color: corItem(alvo) }}>
        {itens[alvo] ?? `Item ${alvo + 1}`} <span className="font-mono">+{num(p.movidos)}</span>
      </span>
    </span>
  )
}

export function Rastreabilidade() {
  const historico = usePrisma((s) => s.historico)
  const itens = useItens()
  const unidades = usePrisma((s) => s.catalogo.unidades)
  const [filtro, setFiltro] = useState<Decisao | 'todas'>('todas')
  const nomes = useMemo(() => new Map(unidades.map((u) => [u.id, u.nome])), [unidades])
  const linhas = historico.filter((p) => filtro === 'todas' || p.decisao === filtro).slice(-150).reverse()
  const t = useT()

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader>
        <CardTitle>{t('Rastreabilidade', 'Traceability')}</CardTitle>
        <div className="flex gap-1">
          {(['todas', 'reclassificado', 'intacto', 'reenvio'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn('rounded-md px-2 py-0.5 text-[11px] transition-colors cursor-pointer', filtro === f ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}
            >
              {f === 'todas' ? t('todas', 'all') : t(DECISOES[f].rotulo, DECISOES[f].en)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-zinc-950 text-[10px] uppercase tracking-wider text-zinc-600">
            <tr>
              <th className="py-1.5 pr-3 font-medium">{t('Hora', 'Time')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('Unidade', 'Unit')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('Lote', 'Batch')}</th>
              <th className="py-1.5 pr-3 font-medium">{t('Decisão', 'Decision')}</th>
              <th className="py-1.5 font-medium">{t('Detalhe', 'Detail')}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p, k) => (
              <tr key={`${p.registrado_em}-${p.pacote_id}-${k}`} className="border-t border-zinc-900/80">
                <td className="py-1.5 pr-3 font-mono text-zinc-500 tabular-nums">{new Date(p.registrado_em * 1000).toLocaleTimeString(locale())}</td>
                <td className="py-1.5 pr-3 text-zinc-300">{p.unidade_id === null ? '–' : (nomes.get(p.unidade_id) ?? `${t('Unidade', 'Unit')} ${p.unidade_id}`)}</td>
                <td className="py-1.5 pr-3 font-mono text-zinc-500">{p.lote ?? '–'}</td>
                <td className="py-1.5 pr-3">
                  <Badge variant={DECISOES[p.decisao].variante}>{t(DECISOES[p.decisao].rotulo, DECISOES[p.decisao].en)}</Badge>
                </td>
                <td className="py-1.5">
                  <Detalhe p={p} itens={itens} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="py-6 text-center text-xs text-zinc-600">{t('Nenhum pacote passou pelo Prisma nesta operação.', 'No package has passed through Prisma in this operation.')}</p>}
      </CardContent>
    </Card>
  )
}
