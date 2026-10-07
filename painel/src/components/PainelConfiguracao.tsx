import { Dices } from 'lucide-react'
import type { ReactNode } from 'react'

import type { ConfigOperacao } from '../lib/config'
import { corItem } from '../lib/cores'
import { num } from '../lib/utils'
import { useOperacao } from '../store/operacao'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'

type ChaveNumerica = { [K in keyof ConfigOperacao]: ConfigOperacao[K] extends number ? K : never }[keyof ConfigOperacao]

function Campo({ rotulo, chave, min, max, passo = 1, sufixo }: { rotulo: string; chave: ChaveNumerica; min: number; max: number; passo?: number; sufixo?: string }) {
  const valor = useOperacao((s) => s.config[chave])
  const definir = useOperacao((s) => s.definirConfig)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{rotulo}</span>
      <div className="relative">
        <Input
          type="number"
          min={min}
          max={max}
          step={passo}
          value={valor}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) definir({ [chave]: Math.min(max, Math.max(min, n)) } as Partial<ConfigOperacao>)
          }}
          className={sufixo ? 'pr-8' : undefined}
        />
        {sufixo && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-zinc-600">{sufixo}</span>}
      </div>
    </label>
  )
}

function Grupo({ titulo, sistema, children }: { titulo: string; sistema: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <span className="text-[10px] text-zinc-600">{sistema}</span>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-3 gap-y-2.5">{children}</CardContent>
    </Card>
  )
}

export function PainelConfiguracao() {
  const config = useOperacao((s) => s.config)
  const definir = useOperacao((s) => s.definirConfig)
  const sortear = useOperacao((s) => s.sortearMapa)
  const topologia = useOperacao((s) => s.topologia)
  const participantesMedio = ((config.participantesMin + config.participantesMax) / 2) * config.numUnidades
  const coberturaMedia = (config.coberturaMin + config.coberturaMax) / 200

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <h2 className="text-sm font-medium text-zinc-200">Configuração da operação</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          ≈ {num(participantesMedio)} participantes, ≈ {num(participantesMedio * coberturaMedia)} registrantes esperados. Tudo é editável até iniciar.
        </p>
      </div>

      <Grupo titulo="Coleta" sistema="sistema de coleta">
        <Campo rotulo="Número de unidades" chave="numUnidades" min={1} max={16} />
        <Campo rotulo="Número de itens" chave="numItens" min={2} max={8} />
        <Campo rotulo="Participantes mín." chave="participantesMin" min={10} max={50000} passo={100} />
        <Campo rotulo="Participantes máx." chave="participantesMax" min={10} max={50000} passo={100} />
        <Campo rotulo="Cobertura mín." chave="coberturaMin" min={1} max={100} sufixo="%" />
        <Campo rotulo="Cobertura máx." chave="coberturaMax" min={1} max={100} sufixo="%" />
        <Campo rotulo="Registro vazio" chave="probVazio" min={0} max={50} passo={0.5} sufixo="%" />
        <Campo rotulo="Registro invalido" chave="probInvalido" min={0} max={50} passo={0.5} sufixo="%" />
        <Campo rotulo="Duração" chave="duracao" min={10} max={3600} passo={10} sufixo="s" />
        <Campo rotulo="Registro e atualização" chave="intervaloRegistro" min={0.5} max={10} passo={0.5} sufixo="s" />
        <Campo rotulo="Checkpoint" chave="intervaloCheckpoint" min={1} max={120} sufixo="s" />
        <Campo rotulo="Participantes por ponto" chave="participantesPorPonto" min={1} max={200} />
      </Grupo>

      <Grupo titulo="Distribuição" sistema="distribuidor das unidades">
        <Campo rotulo="Tamanho do pacote" chave="tamanhoPacote" min={10} max={10000} passo={50} sufixo="registros" />
        <Campo rotulo="Janela de envio" chave="janelaEnvio" min={1} max={16} />
        <Campo rotulo="Latência mín." chave="latenciaMin" min={0.5} max={60} passo={0.5} sufixo="s" />
        <Campo rotulo="Latência máx." chave="latenciaMax" min={0.5} max={60} passo={0.5} sufixo="s" />
        <Campo rotulo="Timeout de ACK" chave="timeoutAck" min={1} max={120} sufixo="s" />
        <Campo rotulo="Máx. tentativas" chave="maxTentativas" min={1} max={20} />
      </Grupo>

      <Grupo titulo="Falhas da rede" sistema="rede simulada">
        <Campo rotulo="Perda de pacote" chave="taxaPerda" min={0} max={60} passo={0.5} sufixo="%" />
        <Campo rotulo="Corrupção" chave="taxaCorrupcao" min={0} max={60} passo={0.5} sufixo="%" />
        <Campo rotulo="Atraso extremo" chave="taxaAtrasoExtremo" min={0} max={60} passo={0.5} sufixo="%" />
        <Campo rotulo="Unidades offline" chave="eventosOffline" min={0} max={16} sufixo="ev." />
      </Grupo>

      <Card>
        <CardHeader>
          <CardTitle>Semente e mapa</CardTitle>
          <span className="text-[10px] text-zinc-600">todos</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input placeholder="aleatória" value={config.seed} onChange={(e) => definir({ seed: e.target.value })} />
            <Button variant="secondary" size="icon" onClick={sortear} title="Sortear outro mapa">
              <Dices />
            </Button>
          </div>
          <p className="text-[11px] text-zinc-600">
            Com semente, a operação inteira é reprodutível. Sem ela, só o mapa é fixo ({topologia.nomeTerritorio}).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {config.nomesItens.map((nome, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: corItem(i) }} />
              <Input value={nome} onChange={(e) => definir({ nomesItens: config.nomesItens.map((n, j) => (j === i ? e.target.value : n)) })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unidades</CardTitle>
          <span className="text-[10px] text-zinc-600">latência = comprimento da tubulação</span>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {topologia.unidades.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.cor }} />
              <Input value={config.nomesUnidades[i]} onChange={(e) => definir({ nomesUnidades: config.nomesUnidades.map((n, j) => (j === i ? e.target.value : n)) })} />
              <span className="w-10 shrink-0 text-right font-mono text-[11px] text-zinc-500">{f.latenciaBase.toFixed(1)}s</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
