import { Bot, KeyRound, RefreshCw, Trash2, TriangleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { alternarModelo, salvarChaveOpenAI, verificarModelos } from '../lib/acoes'
import type { ConfigOperacao } from '../lib/config'
import type { EstadoAgentes, ModeloAgente } from '../lib/tipos'
import { locale, useT } from '../lib/idioma'
import { cn, num } from '../lib/utils'
import { useOperacao } from '../store/operacao'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Switch } from './ui/switch'

const dolares = new Map<string, Intl.NumberFormat>()

export function usd(v: number): string {
  const l = locale()
  let dolar = dolares.get(l)
  if (!dolar) {
    dolar = new Intl.NumberFormat(l, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
    dolares.set(l, dolar)
  }
  return dolar.format(v)
}

/** Modelos que de fato podem gerar registros: ativos e, se a conta foi verificada, disponíveis nela. */
export function modelosProntos(agentes: EstadoAgentes | null): ModeloAgente[] {
  return agentes?.modelos.filter((m) => m.ativo && m.disponivel !== false) ?? []
}

/** Estimativa grosseira: prompt curto com o catálogo, ~2 tokens de saída por registro, modelo sorteado entre os prontos. */
export function estimarCusto(config: ConfigOperacao, agentes: EstadoAgentes | null) {
  const registros = ((config.participantesMin + config.participantesMax) / 2) * config.numUnidades * ((config.coberturaMin + config.coberturaMax) / 200)
  const chamadas = Math.ceil(registros / config.loteAgentes)
  const catalogo = [...config.nomesItens, ...config.descricoesItens].join(' ').length / 4
  const entrada = 90 + catalogo
  const saida = config.loteAgentes * 2
  const prontos = modelosProntos(agentes)
  const porChamada = prontos.length ? prontos.reduce((s, m) => s + (entrada * m.entrada + saida * m.saida) / 1e6, 0) / prontos.length : 0
  return { chamadas, custo: chamadas * porChamada }
}

function Chave({ agentes }: { agentes: EstadoAgentes | null }) {
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const t = useT()
  const executar = async (acao: () => Promise<boolean>) => {
    setOcupado(true)
    try {
      if (await acao()) setTexto('')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <KeyRound className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-zinc-400">{t('Chave da API da OpenAI:', 'OpenAI API key:')}</span>
        {agentes?.chave ? <span className="font-mono text-emerald-300">{agentes.chave}</span> : <span className="text-amber-300">{t('não cadastrada', 'not registered')}</span>}
        {agentes?.chave && (
          <button className="ml-auto text-zinc-500 hover:text-red-300 cursor-pointer" title={t('Remover chave', 'Remove key')} onClick={() => executar(() => salvarChaveOpenAI(null))}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (texto.trim()) executar(() => salvarChaveOpenAI(texto.trim()))
        }}
      >
        <Input type="password" autoComplete="off" placeholder={agentes?.chave ? t('trocar chave (sk-...)', 'replace key (sk-...)') : 'sk-...'} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <Button type="submit" variant="secondary" size="sm" disabled={ocupado || !texto.trim()}>
          {t('Salvar', 'Save')}
        </Button>
      </form>
      <p className="text-[11px] text-zinc-600">
        {t('Fica guardada só no sistema de coleta; o painel nunca recebe a chave de volta.', 'It is stored only in the collection system; the panel never receives the key back.')}
      </p>
    </div>
  )
}

function LinhaModelo({ modelo }: { modelo: ModeloAgente }) {
  const indisponivel = modelo.disponivel === false
  const t = useT()
  return (
    <div className={cn('flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-900/70', indisponivel && 'opacity-50')}>
      <Switch ligado={modelo.ativo} aoMudar={(v) => alternarModelo(modelo.id, v)} rotulo="" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-zinc-200">
          {modelo.nome}
          {indisponivel && <span className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-400">{t('fora da conta', 'not in account')}</span>}
          {modelo.ultimo_erro && <TriangleAlert className="h-3 w-3 text-amber-400" aria-label={modelo.ultimo_erro} />}
        </div>
        <div className="font-mono text-[10px] text-zinc-600" title={modelo.ultimo_erro ?? undefined}>
          {modelo.id}
        </div>
      </div>
      <div className="w-28 text-right font-mono text-[11px] text-zinc-400 tabular-nums" title={t('US$ por 1 milhão de tokens: entrada / saída', 'US$ per 1 million tokens: input / output')}>
        {modelo.entrada.toFixed(2)} / {modelo.saida.toFixed(2)}
      </div>
      <div className="w-24 text-right font-mono text-[11px] tabular-nums">
        {modelo.chamadas || modelo.falhas ? (
          <>
            <span className="text-zinc-300">{usd(modelo.custo)}</span>
            <div className="text-[10px] text-zinc-600">
              {num(modelo.chamadas)} {t('ch.', 'calls')}
              {modelo.falhas ? (
                <span className="text-amber-400">
                  {' '}
                  · {num(modelo.falhas)} {t('falhas', 'failures')}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <span className="text-zinc-700">—</span>
        )}
      </div>
    </div>
  )
}

export function PainelAgentes() {
  const aberto = useOperacao((s) => s.agentesAberto)
  const agentes = useOperacao((s) => s.agentes)
  const config = useOperacao((s) => s.config)
  const fechar = () => useOperacao.getState().definirAgentesAberto(false)
  const [verificando, setVerificando] = useState(false)
  const estimativa = estimarCusto(config, agentes)
  const prontos = modelosProntos(agentes)
  const t = useT()

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fechar}>
          <motion.div
            className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-zinc-900 px-5 py-4">
              <Bot className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-zinc-100">{t('Agentes de IA', 'AI agents')}</h2>
              <span className="text-[11px] text-zinc-500">{t('sistema de coleta · OpenAI · esforço de raciocínio sempre mínimo', 'collection system · OpenAI · reasoning effort always minimal')}</span>
              <button onClick={fechar} className="ml-auto text-zinc-500 hover:text-zinc-200 cursor-pointer" aria-label={t('Fechar', 'Close')}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
              {agentes === null ? (
                <p className="text-xs text-zinc-500">{t('Aguardando conexão com o sistema de coleta…', 'Waiting for connection to the collection system…')}</p>
              ) : (
                <>
                  <Chave agentes={agentes} />

                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{t('Modelos', 'Models')}</span>
                      <span className="text-[11px] text-zinc-600">
                        {prontos.length} {t('em uso', 'in use')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        disabled={!agentes.chave || verificando}
                        title={t('Consulta quais modelos a sua conta da OpenAI enxerga', 'Checks which models your OpenAI account can see')}
                        onClick={async () => {
                          setVerificando(true)
                          await verificarModelos()
                          setVerificando(false)
                        }}
                      >
                        <RefreshCw className={cn(verificando && 'animate-spin')} /> {t('Verificar na conta', 'Check account')}
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 px-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-600">
                      <span className="w-9" />
                      <span className="flex-1">{t('modelo', 'model')}</span>
                      <span className="w-28 text-right">US$ / 1M tokens</span>
                      <span className="w-24 text-right">{t('gasto', 'spent')}</span>
                    </div>
                    <div className="flex flex-col">
                      {agentes.modelos.map((m) => (
                        <LinhaModelo key={m.id} modelo={m} />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-600">
                      {t(
                        'Cada lote de participantes sorteia um dos modelos ligados. Desligar um modelo o tira da coleta na hora, inclusive com a operação em andamento.',
                        'Each batch of participants picks one of the models that are on at random. Turning a model off removes it from collection immediately, even with the operation in progress.',
                      )}
                    </p>
                  </div>
                </>
              )}
            </div>

            {agentes && (
              <div className="grid grid-cols-3 gap-2 border-t border-zinc-900 px-5 py-3 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">{t('Estimativa da operação', 'Operation estimate')}</div>
                  <div className="font-mono text-zinc-200 tabular-nums">
                    ≈ {usd(estimativa.custo)}{' '}
                    <span className="text-zinc-600">
                      · {num(estimativa.chamadas)} {t('ch.', 'calls')}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">{t('Gasto nesta operação', 'Spent in this operation')}</div>
                  <div className="font-mono text-emerald-300 tabular-nums">{usd(agentes.custo_total)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">{t('Chamadas', 'Calls')}</div>
                  <div className="font-mono text-zinc-200 tabular-nums">
                    {num(agentes.chamadas)}
                    {agentes.falhas > 0 && (
                      <span className="text-amber-400">
                        {' '}
                        · {num(agentes.falhas)} {t('falhas', 'failures')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
