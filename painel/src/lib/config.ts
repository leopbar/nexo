import { NOMES_CIDADES } from './topologia'

/** Parâmetros editáveis antes de iniciar a operação. Percentuais em 0–100. */
export interface ConfigOperacao {
  numUnidades: number
  nomesUnidades: string[]
  participantesMin: number
  participantesMax: number
  numItens: number
  nomesItens: string[]
  descricoesItens: string[]
  coberturaMin: number
  coberturaMax: number
  probVazio: number
  probInvalido: number
  duracao: number
  intervaloRegistro: number
  intervaloCheckpoint: number
  participantesPorPonto: number
  tamanhoPacote: number
  latenciaMin: number
  latenciaMax: number
  timeoutAck: number
  maxTentativas: number
  janelaEnvio: number
  taxaPerda: number
  taxaCorrupcao: number
  taxaAtrasoExtremo: number
  eventosOffline: number
  seed: string
  agentes: boolean
  loteAgentes: number
}

export const NOMES_ITENS = [
  'Telemetria',
  'Inventário',
  'Logística',
  'Manutenção',
  'Qualidade',
  'Suprimentos',
  'Atendimento',
  'Faturamento',
]

export const CONFIG_PADRAO: ConfigOperacao = {
  numUnidades: 10,
  nomesUnidades: NOMES_CIDADES.slice(0, 10),
  participantesMin: 2000,
  participantesMax: 5000,
  numItens: 5,
  nomesItens: NOMES_ITENS.slice(0, 5),
  descricoesItens: ['', '', '', '', ''],
  coberturaMin: 70,
  coberturaMax: 95,
  probVazio: 3,
  probInvalido: 2,
  duracao: 300,
  intervaloRegistro: 1,
  intervaloCheckpoint: 10,
  participantesPorPonto: 10,
  tamanhoPacote: 500,
  latenciaMin: 3,
  latenciaMax: 10,
  timeoutAck: 12,
  maxTentativas: 5,
  janelaEnvio: 4,
  taxaPerda: 5,
  taxaCorrupcao: 2,
  taxaAtrasoExtremo: 2,
  eventosOffline: 1,
  seed: '',
  agentes: false,
  loteAgentes: 50,
}

/** Ajusta listas de nomes ao número de unidades/itens. */
export function normalizarConfig(c: ConfigOperacao): ConfigOperacao {
  const nomesUnidades = Array.from({ length: c.numUnidades }, (_, i) => c.nomesUnidades[i] ?? NOMES_CIDADES[i % NOMES_CIDADES.length])
  const nomesItens = Array.from({ length: c.numItens }, (_, i) => c.nomesItens[i] ?? NOMES_ITENS[i] ?? `Item ${i + 1}`)
  const descricoesItens = Array.from({ length: c.numItens }, (_, i) => c.descricoesItens?.[i] ?? '')
  return { ...c, nomesUnidades, nomesItens, descricoesItens }
}

export function seedNumerica(c: ConfigOperacao): number | null {
  const texto = c.seed.trim()
  if (texto === '') return null
  const n = Number(texto)
  if (Number.isInteger(n)) return Math.abs(n) % 2 ** 31
  let h = 2166136261
  for (const ch of texto) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0) % 2 ** 31
}
