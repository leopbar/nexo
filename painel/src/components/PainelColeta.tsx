import { EyeOff } from 'lucide-react'
import { useMemo } from 'react'

import { COR_VAZIO, COR_INVALIDO, corItem } from '../lib/cores'
import { cn, num, pct, tempo } from '../lib/utils'
import { useOperacao } from '../store/operacao'
import { DICA, EIXO, Grafico, type OpcaoGrafico } from './Grafico'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

function Evolucao() {
  const checkpoints = useOperacao((s) => s.checkpoints)
  const nomes = useOperacao((s) => s.config.nomesItens)

  const opcao = useMemo<OpcaoGrafico>(() => {
    const x = [0, ...checkpoints.map((c) => c.segundo)]
    const n = nomes.length
    const serie = (valor: (c: (typeof checkpoints)[number]) => number) => [0, ...checkpoints.map(valor)]
    const linhas = nomes.map((nome, i) => ({
      name: nome,
      type: 'line',
      data: serie((c) => c.unidades.reduce((s, f) => s + (f.contagens.itens[i] ?? 0), 0)),
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2, color: corItem(i) },
      itemStyle: { color: corItem(i) },
    }))
    return {
      animationDuration: 500,
      grid: { left: 44, right: 10, top: 12, bottom: 24 },
      tooltip: { trigger: 'axis', ...DICA },
      xAxis: { type: 'category', data: x, boundaryGap: false, ...EIXO, axisLabel: { ...EIXO.axisLabel, formatter: (v: string) => tempo(Number(v)) } },
      yAxis: { type: 'value', ...EIXO },
      series: [
        ...linhas,
        { name: 'Vazios', type: 'line', data: serie((c) => c.unidades.reduce((s, f) => s + f.contagens.vazios, 0)), smooth: true, showSymbol: false, lineStyle: { width: 1.5, type: 'dashed', color: COR_VAZIO }, itemStyle: { color: COR_VAZIO } },
        { name: 'Invalidos', type: 'line', data: serie((c) => c.unidades.reduce((s, f) => s + f.contagens.invalidos, 0)), smooth: true, showSymbol: false, lineStyle: { width: 1.5, type: 'dashed', color: COR_INVALIDO }, itemStyle: { color: COR_INVALIDO } },
      ].slice(0, n + 2),
    }
  }, [checkpoints, nomes])

  return <Grafico opcao={opcao} className="h-44 w-full" />
}

export function PainelColeta() {
  const unidades = useOperacao((s) => s.unidades)
  const segundo = useOperacao((s) => s.segundo)
  const duracao = useOperacao((s) => s.duracao)
  const fase = useOperacao((s) => s.faseColeta)
  const nomes = useOperacao((s) => s.config.nomesItens)
  const lista = Object.values(unidades)
  const participantes = lista.reduce((s, f) => s + f.participantes, 0)
  const registros = lista.reduce((s, f) => s + f.total, 0)
  const vazios = lista.reduce((s, f) => s + f.contagens.vazios, 0)
  const invalidos = lista.reduce((s, f) => s + f.contagens.invalidos, 0)
  const porItem = nomes.map((_, i) => lista.reduce((s, f) => s + (f.contagens.itens[i] ?? 0), 0))
  const validos = porItem.reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-zinc-400">
        <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span>
          Visão do <b className="font-medium text-zinc-200">sistema de coleta</b>: andamentos locais dos terminais. A central não tem acesso a estes números — só aos extratos
          distribuidos depois do fechamento.
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cobertura</CardTitle>
          <span className="font-mono text-xs text-zinc-400">
            {fase === 'coleta' ? `${tempo(segundo)} / ${tempo(duracao)}` : fase === 'configuracao' || fase === 'pronta' ? 'terminais fechados' : 'terminais travados'}
          </span>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl text-zinc-50 tabular-nums">{num(registros)}</span>
            <span className="text-xs text-zinc-500 tabular-nums">de {num(participantes)} · {pct(participantes ? registros / participantes : 0)}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-900">
            <div className="h-full bg-violet-500 transition-[width] duration-1000" style={{ width: `${duracao ? Math.min(1, segundo / duracao) * 100 : 0}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-1">
            {nomes.map((nome, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-sm" style={{ background: corItem(i) }} />
                <span className="flex-1 truncate text-zinc-300">{nome}</span>
                <span className="font-mono text-zinc-200 tabular-nums">{num(porItem[i])}</span>
                <span className="w-12 text-right font-mono text-zinc-500 tabular-nums">{pct(validos ? porItem[i] / validos : 0)}</span>
              </div>
            ))}
            <div className="mt-1 flex gap-4 border-t border-zinc-900 pt-1.5 text-[11px] text-zinc-500">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: COR_VAZIO }} />
                vazios {num(vazios)}
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: COR_INVALIDO }} />
                invalidos {num(invalidos)}
              </span>
              <span>sem registro {num(participantes - registros)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evolução (checkpoints)</CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          <Evolucao />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terminais</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {lista.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate text-zinc-300">{f.nome}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-900">
                <div className={cn('h-full rounded-full transition-[width] duration-700', f.aberta ? 'bg-zinc-300' : 'bg-zinc-600')} style={{ width: `${f.cobertura * 100}%` }} />
              </div>
              <span className="w-12 text-right font-mono text-zinc-400 tabular-nums">{num(f.total)}</span>
              <span className="w-11 text-right font-mono text-zinc-500 tabular-nums">{pct(f.cobertura)}</span>
            </div>
          ))}
          {lista.length === 0 && <p className="text-xs text-zinc-600">Nenhuma terminal configurada.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
