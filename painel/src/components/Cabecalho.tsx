import { Check, Pause, Play, RotateCcw, Send, ShieldCheck, Layers, Network, Wifi, WifiOff } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState, type ComponentProps } from 'react'

import { acelerar, habilitarConsolidacao, iniciarOperacao, pausar, reiniciarTudo, reenviarFalhas, distribuirExtratos } from '../lib/acoes'
import { NOMES_SERVICOS, SERVICOS } from '../lib/api'
import { cn, tempo } from '../lib/utils'
import { FASES, useOperacao, useFaseGeral } from '../store/operacao'
import { Button } from './ui/button'
import { Switch } from './ui/switch'

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

  if (fase === 'configuracao')
    return (
      <Ocupado acao={iniciarOperacao} variant="accent" disabled={!conectado}>
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
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
      <Ocupado acao={() => pausar(!pausado)} variant="ghost" size="icon" title={pausado ? 'Retomar' : 'Pausar'}>
        {pausado ? <Play /> : <Pause />}
      </Ocupado>
      {[1, 2, 5].map((e) => (
        <button
          key={e}
          onClick={() => acelerar(e)}
          className={cn('h-8 rounded-md px-2.5 font-mono text-xs transition-colors cursor-pointer', escala === e ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200')}
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

/** Avança sozinho entre as fases quando o modo automático está ligado. */
function useAutomacao() {
  const automatico = useOperacao((s) => s.automatico)
  const v = useOperacao((s) => s.faseColeta)
  const a = useOperacao((s) => s.faseConsolidacao)
  const incompleta = useOperacao((s) => s.distribuicaoIncompleta)
  const pausado = useOperacao((s) => s.pausado)
  useEffect(() => {
    if (!automatico || pausado) return
    let passo: (() => Promise<unknown>) | null = null
    if (v === 'fechada' && a === 'aguardando') passo = habilitarConsolidacao
    else if (v === 'fechada' && a === 'habilitada') passo = distribuirExtratos
    else if (v === 'distribuindo' && incompleta) passo = reenviarFalhas
    if (!passo) return
    const timer = window.setTimeout(passo, 1800)
    return () => clearTimeout(timer)
  }, [automatico, pausado, v, a, incompleta])
}

export function Cabecalho() {
  const automatico = useOperacao((s) => s.automatico)
  const definirAutomatico = useOperacao((s) => s.definirAutomatico)
  useAutomacao()
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
        <Switch ligado={automatico} aoMudar={definirAutomatico} rotulo="Automático" />
        <AcaoPrincipal />
        <Controles />
        <Relogio />
      </div>
    </header>
  )
}
