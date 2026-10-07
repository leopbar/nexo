import { Bot, EyeOff } from 'lucide-react'

import { cn, num, pct, tempo } from '../lib/utils'
import { useOperacao } from '../store/operacao'
import { modelosProntos, usd } from './PainelAgentes'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

function Indicador({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{rotulo}</div>
      <div className={cn('font-mono text-sm font-semibold tabular-nums', cor)}>{valor}</div>
    </div>
  )
}

function CartaoAgentes() {
  const agentes = useOperacao((s) => s.agentes)
  const abrir = useOperacao((s) => s.definirAgentesAberto)
  if (!agentes) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agentes de IA</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => abrir(true)}>
          <Bot /> {modelosProntos(agentes).length} modelos ligados
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-2">
        <Indicador rotulo="Chamadas" valor={num(agentes.chamadas)} cor="text-zinc-100" />
        <Indicador rotulo="Falhas" valor={num(agentes.falhas)} cor={agentes.falhas ? 'text-amber-300' : 'text-zinc-500'} />
        <Indicador rotulo="Gasto" valor={usd(agentes.custo_total)} cor="text-emerald-300" />
      </CardContent>
    </Card>
  )
}

export function PainelColeta() {
  const unidades = useOperacao((s) => s.unidades)
  const segundo = useOperacao((s) => s.segundo)
  const duracao = useOperacao((s) => s.duracao)
  const fase = useOperacao((s) => s.faseColeta)
  const topologia = useOperacao((s) => s.topologia)
  const lista = Object.values(unidades)
  const participantes = lista.reduce((s, f) => s + f.participantes, 0)
  const registros = lista.reduce((s, f) => s + f.total, 0)
  const taxa = participantes ? registros / participantes : 0
  const progresso = duracao ? Math.min(1, segundo / duracao) : 0
  const abertas = lista.filter((f) => f.aberta).length
  const cores = new Map(topologia.unidades.map((t) => [t.id, t.cor]))
  const agentesLigados = useOperacao((s) => s.config.agentes)

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
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums',
              fase === 'coleta' ? 'bg-violet-500/15 text-violet-300' : 'bg-zinc-800/80 text-zinc-400',
            )}
          >
            {fase === 'coleta' ? `${tempo(segundo)} / ${tempo(duracao)}` : fase === 'configuracao' || fase === 'pronta' ? 'terminais fechados' : 'terminais travados'}
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text font-mono text-5xl font-semibold leading-none text-transparent tabular-nums">
                {pct(taxa)}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">do participantes já registrou</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-semibold leading-none text-amber-300 tabular-nums">{pct(participantes ? 1 - taxa : 0)}</div>
              <div className="mt-1 text-[11px] text-zinc-500">sem registro</div>
            </div>
          </div>

          <div className="flex h-2.5 overflow-hidden rounded-full bg-amber-400/20">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-1000" style={{ width: `${taxa * 100}%` }} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Indicador rotulo="Registrantes" valor={num(registros)} cor="text-emerald-300" />
            <Indicador rotulo="Participantes" valor={num(participantes)} cor="text-zinc-100" />
            <Indicador rotulo="Sem registro" valor={num(participantes - registros)} cor="text-amber-300" />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px] text-zinc-500">
              <span>tempo de coleta</span>
              <span className="font-mono text-violet-300 tabular-nums">{pct(progresso)}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-zinc-900">
              <div className="h-full bg-violet-500 transition-[width] duration-1000" style={{ width: `${progresso * 100}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {agentesLigados && <CartaoAgentes />}

      <Card>
        <CardHeader>
          <CardTitle>Terminais</CardTitle>
          <span className="text-[11px] text-zinc-500 tabular-nums">
            <span className="text-emerald-300">{abertas}</span> abertas · {lista.length - abertas} fechadas
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {lista.map((f) => {
            const cor = cores.get(f.id) ?? '#a1a1aa'
            return (
              <div key={f.id} className="rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-900/70">
                <div className="flex items-center gap-2">
                  <span
                    className={cn('h-2 w-2 shrink-0 rounded-full', f.aberta && 'animate-pulse')}
                    style={{ background: cor, boxShadow: f.aberta ? `0 0 8px ${cor}` : undefined }}
                  />
                  <span className="flex-1 truncate text-xs text-zinc-200">{f.nome}</span>
                  <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                    {num(f.total)} <span className="text-zinc-600">/ {num(f.participantes)}</span>
                  </span>
                  <span className="w-14 text-right font-mono text-base font-semibold leading-none tabular-nums" style={{ color: cor }}>
                    {pct(f.cobertura)}
                  </span>
                </div>
                <div className="mt-1 ml-4 h-1.5 overflow-hidden rounded-full bg-zinc-900">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${f.cobertura * 100}%`, background: cor, opacity: f.aberta ? 1 : 0.45 }}
                  />
                </div>
              </div>
            )
          })}
          {lista.length === 0 && <p className="text-xs text-zinc-600">Nenhuma terminal configurada.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
