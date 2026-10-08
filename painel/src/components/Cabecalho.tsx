import { Bot, Check, Pause, Play, RotateCcw, Send, ShieldCheck, Layers, Network, Wifi, WifiOff } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ComponentProps } from 'react'

import { acelerar, habilitarConsolidacao, iniciarOperacao, pausar, reiniciarTudo, reenviarFalhas, distribuirExtratos } from '../lib/acoes'
import { NOMES_SERVICOS, SERVICOS } from '../lib/api'
import { cn, num, tempo } from '../lib/utils'
import { FASES, useOperacao, useFaseGeral, useFila } from '../store/operacao'
import { modelosProntos } from './PainelAgentes'
import { Button } from './ui/button'

function Etapas() {
  const fase = useFaseGeral()
  const atual = FASES.findIndex((f) => f.id === fase)
  return (
    <ol className="flex items-center gap-1">
      {FASES.map((f, i) => {
        const feita = i < atual
        const ativa = i === atual
        return (
          <li key={f.id} className="flex items-center gap-1">
            {i > 0 && <span className={cn('h-px w-5 xl:w-8', feita || ativa ? 'bg-zinc-500' : 'bg-zinc-800')} />}
            <span
              className={cn(
                'relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                ativa && 'border-zinc-600 bg-zinc-900 text-zinc-100',
                feita && 'border-zinc-800 text-zinc-400',
                !ativa && !feita && 'border-transparent text-zinc-600',
              )}
            >
              {ativa && <motion.span layoutId="etapa-ativa" className="absolute inset-0 rounded-full ring-1 ring-violet-500/50" />}
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[10px]', ativa ? 'bg-violet-500 text-white' : feita ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-900 text-zinc-500')}>
                {feita ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              <span className="hidden lg:inline">{f.rotulo}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Ocupado({ acao, children, ...props }: { acao: () => Promise<unknown> } & Omit<ComponentProps<typeof Button>, 'onClick'>) {
  const [ocupado, setOcupado] = useState(false)
  return (
    <Button
      {...props}
      disabled={ocupado || props.disabled}
      onClick={async () => {
        setOcupado(true)
        try {
          await acao()
        } finally {
          setOcupado(false)
        }
      }}
    >
      {children}
    </Button>
  )
}

function AcaoPrincipal() {
  const fase = useFaseGeral()
  const faseConsolidacao = useOperacao((s) => s.faseConsolidacao)
  const faseColeta = useOperacao((s) => s.faseColeta)
  const incompleta = useOperacao((s) => s.distribuicaoIncompleta)
  const conectado = useOperacao((s) => Object.values(s.conexoes).every(Boolean))
  const abrirConsolidacao = useOperacao((s) => s.definirConsolidacaoAberta)
  const agentesPendentes = useOperacao((s) => s.config.agentes && (!s.agentes?.chave || modelosProntos(s.agentes).length === 0))

  if (fase === 'configuracao')
    return (
      <Ocupado acao={iniciarOperacao} variant="accent" disabled={!conectado || agentesPendentes} title={agentesPendentes ? 'Agentes de IA: cadastre a chave e ligue ao menos um modelo.' : undefined}>
        <Network /> Iniciar operação
      </Ocupado>
    )
  if (fase === 'coleta')
    return (
      <Ocupado acao={habilitarConsolidacao} variant="secondary" title="A consolidação vai recusar: a coleta ainda está aberta.">
        <ShieldCheck /> Habilitar consolidação
      </Ocupado>
    )
  if (fase === 'fechamento')
    return faseConsolidacao === 'habilitada' ? (
      <Ocupado acao={distribuirExtratos} variant="accent">
        <Send /> Distribuir extratos
      </Ocupado>
    ) : (
      <Ocupado acao={habilitarConsolidacao} variant="accent">
        <ShieldCheck /> Habilitar consolidação
      </Ocupado>
    )
  if (fase === 'consolidacao')
    return faseConsolidacao !== 'habilitada' ? (
      <Ocupado acao={habilitarConsolidacao} variant="accent">
        <ShieldCheck /> Habilitar consolidação
      </Ocupado>
    ) : (
      <Ocupado acao={reenviarFalhas} variant="destructive" disabled={!incompleta || faseColeta !== 'distribuindo'}>
        <RotateCcw /> Reenviar falhas
      </Ocupado>
    )
  return (
    <Button variant="accent" onClick={() => abrirConsolidacao(true)}>
      <Layers /> Ver consolidação
    </Button>
  )
}

function Relogio() {
  const segundo = useOperacao((s) => s.segundo)
  const duracao = useOperacao((s) => s.duracao)
  const fase = useOperacao((s) => s.faseColeta)
  const fila = useFila()
  if (fila !== null)
    return (
      <div className="flex flex-col items-end leading-none">
        <span className="font-mono text-lg text-amber-300 tabular-nums">fila: {num(fila)}</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">participantes</span>
      </div>
    )
  const restante = fase === 'coleta' ? duracao - segundo : fase === 'pronta' || fase === 'configuracao' ? duracao : 0
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="font-mono text-lg text-zinc-100 tabular-nums">{tempo(restante)}</span>
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{fase === 'coleta' ? 'para fechar' : 'coleta'}</span>
    </div>
  )
}

function Controles() {
  const escala = useOperacao((s) => s.escala)
  const pausado = useOperacao((s) => s.pausado)
  const agentesLigados = useOperacao((s) => s.config.agentes)
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
      <Ocupado acao={() => pausar(!pausado)} variant="ghost" size="icon" title={pausado ? 'Retomar' : 'Pausar'}>
        {pausado ? <Play /> : <Pause />}
      </Ocupado>
      {[1, 2, 5].map((e) => (
        <button
          key={e}
          onClick={() => acelerar(e)}
          disabled={agentesLigados && e !== escala}
          title={agentesLigados ? 'Com agentes de IA a velocidade fica em 1x; ajuste a duração da coleta.' : undefined}
          className={cn(
            'h-8 rounded-md px-2.5 font-mono text-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-30',
            escala === e ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 enabled:hover:text-zinc-200',
          )}
        >
          {e}x
        </button>
      ))}
      <Ocupado acao={reiniciarTudo} variant="ghost" size="icon" title="Reiniciar: limpa os bancos e volta à configuração">
        <RotateCcw />
      </Ocupado>
    </div>
  )
}

function Conexoes() {
  const conexoes = useOperacao((s) => s.conexoes)
  return (
    <div className="flex items-center gap-2">
      {SERVICOS.map((s) => (
        <span key={s} title={`${NOMES_SERVICOS[s]}: ${conexoes[s] ? 'conectado' : 'desconectado'}`} className={cn('flex items-center gap-1 text-[10px] uppercase tracking-wider', conexoes[s] ? 'text-zinc-500' : 'text-red-400')}>
          {conexoes[s] ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {NOMES_SERVICOS[s]}
        </span>
      ))}
    </div>
  )
}

export function Cabecalho() {
  const abrirAgentes = useOperacao((s) => s.definirAgentesAberto)
  const agentesLigados = useOperacao((s) => s.config.agentes)
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-zinc-900 bg-black/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
          <Network className="h-4 w-4 text-violet-400" />
        </div>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold text-zinc-100">Nexo</h1>
          <Conexoes />
        </div>
      </div>
      <div className="flex flex-1 justify-center">
        <Etapas />
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => abrirAgentes(true)} title="Agentes de IA: chave e modelos" className={cn(agentesLigados && 'text-violet-300')}>
          <Bot />
        </Button>
        <AcaoPrincipal />
        <Controles />
        <Relogio />
      </div>
    </header>
  )
}
