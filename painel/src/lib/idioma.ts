/**
 * Idioma da tela. O Nexo é em português; o botão PT/EN troca todos os textos
 * visíveis para o inglês. Código, contratos e serviços continuam em português:
 * as mensagens que chegam prontas dos serviços são traduzidas aqui, na exibição.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Idioma = 'pt' | 'en'

interface EstadoIdioma {
  idioma: Idioma
  definirIdioma: (idioma: Idioma) => void
}

export const useIdioma = create<EstadoIdioma>()(
  persist(
    (set) => ({
      idioma: 'pt',
      definirIdioma: (idioma) => set({ idioma }),
    }),
    { name: 'nexo-idioma', version: 1 },
  ),
)

function aplicarNoDocumento(idioma: Idioma) {
  document.documentElement.lang = idioma === 'en' ? 'en' : 'pt-BR'
}
aplicarNoDocumento(useIdioma.getState().idioma)
useIdioma.subscribe((s) => aplicarNoDocumento(s.idioma))

export function idiomaAtual(): Idioma {
  return useIdioma.getState().idioma
}

export type Traduzir = (pt: string, en: string) => string

/** Escolhe o texto do idioma atual e re-renderiza o componente quando o idioma muda. */
export function useT(): Traduzir {
  const idioma = useIdioma((s) => s.idioma)
  return (pt, en) => (idioma === 'en' ? en : pt)
}

/** Mesma escolha, fora de componentes (gráficos, mapa). */
export function t(pt: string, en: string): string {
  return idiomaAtual() === 'en' ? en : pt
}

export function locale(): string {
  return idiomaAtual() === 'en' ? 'en-US' : 'pt-BR'
}

// ------------------------------------------------------------ nomes padrão

export const NOMES_ITENS_PT = ['Telemetria', 'Inventário', 'Logística', 'Manutenção', 'Qualidade', 'Suprimentos', 'Atendimento', 'Faturamento']
export const NOMES_ITENS_EN = ['Telemetry', 'Inventory', 'Logistics', 'Maintenance', 'Quality', 'Supplies', 'Customer service', 'Billing']

/** Troca pelos do outro idioma os nomes de item que ainda são os padrão; nomes editados ficam como estão. */
export function nomesItensNoIdioma(nomes: string[], idioma: Idioma): string[] {
  const [de, para] = idioma === 'en' ? [NOMES_ITENS_PT, NOMES_ITENS_EN] : [NOMES_ITENS_EN, NOMES_ITENS_PT]
  return nomes.map((n, i) => (n === de[i] ? para[i] : n))
}

const PT_PARA_EN = new Map(NOMES_ITENS_PT.map((n, i) => [n, NOMES_ITENS_EN[i]]))
const EN_PARA_PT = new Map(NOMES_ITENS_EN.map((n, i) => [n, NOMES_ITENS_PT[i]]))

/** Nome de item para exibição: os nomes padrão aparecem no idioma da tela; os editados, como foram escritos. */
export function nomeItem(nome: string, idioma: Idioma = idiomaAtual()): string {
  return (idioma === 'en' ? PT_PARA_EN : EN_PARA_PT).get(nome) ?? nome
}

const TERRITORIOS: Record<string, string> = {
  'Território de Valdória': 'Valdória Territory',
  'Planalto de Ondária': 'Ondária Plateau',
  'Vale de Calvéria': 'Calvéria Valley',
  'Território de Itanor': 'Itanor Territory',
  'Costa de Lumíria': 'Lumíria Coast',
}

export function nomeTerritorio(nome: string): string {
  return idiomaAtual() === 'en' ? (TERRITORIOS[nome] ?? nome) : nome
}

// ---------------------------------------------- mensagens vindas dos serviços

const SERVICOS_EN: Record<string, string> = { Coleta: 'Collection', Transporte: 'Transport', 'Consolidação': 'Consolidation' }

const FASES_EN: Record<string, string> = {
  configuracao: 'configuration',
  pronta: 'ready',
  coleta: 'collection',
  fechada: 'closed',
  distribuindo: 'distributing',
  distribuida: 'distributed',
  aguardando: 'waiting',
  habilitada: 'enabled',
  consolidacao_final: 'final consolidation',
}

const ACOES_EN: Record<string, string> = {
  configurar: 'configure',
  iniciar: 'start',
  'iniciar coleta': 'start collection',
  'distribuir extratos': 'distribute statements',
  'reenviar falhas': 'resend failures',
  'habilitar consolidação': 'enable consolidation',
}

const PROBLEMAS_EN: Record<string, string> = {
  'totais divergentes': 'totals diverge',
  'total de registros divergente': 'record total diverges',
  'hash do extrato divergente': 'statement hash diverges',
  'assinatura do Prisma inválida': 'invalid Prisma signature',
  'transformação de outro pacote': 'transformation from another package',
  'itens incompatíveis': 'incompatible items',
  'vazios ou inválidos alterados': 'empty or invalid records altered',
  'total alterado': 'total altered',
  'movimento fora do item alvo': 'movement outside the target item',
}

const fase = (f: string) => FASES_EN[f] ?? f
const fases = (lista: string) => lista.split(', ').map(fase).join(', ')
const acao = (a: string) => ACOES_EN[a] ?? a
const problemas = (lista: string) =>
  lista
    .split(', ')
    .map((p) => PROBLEMAS_EN[p] ?? p)
    .join(', ')

const DETALHES: [RegExp, (...g: string[]) => string][] = [
  [/^Maior contagem entre os registros classificados\.$/, () => 'Highest count among classified records.'],
  [
    /^Equivalência em (\d+) registros entre os itens (\[[^\]]*\]); prevalece o item predominante em mais unidades \((\d+)\)\.$/,
    (n, itens, u) => `Equivalence at ${n} records between items ${itens}; the item predominant in more units prevails (${u}).`,
  ],
  [
    /^Equivalência persistente entre os itens (\[[^\]]*\]) \(registros e unidades\)\. A seleção com semente '([^']*)' indicou o item (\d+)\.$/,
    (itens, semente, item) => `Persistent equivalence between items ${itens} (records and units). The selection with seed '${semente}' pointed to item ${item}.`,
  ],
]

/** Detalhe da consolidação final (também aparece dentro do log). */
export function traduzirDetalhe(texto: string): string {
  if (idiomaAtual() !== 'en') return texto
  for (const [padrao, montar] of DETALHES) {
    const m = texto.match(padrao)
    if (m) return montar(...m.slice(1))
  }
  return texto
}

const MENSAGENS: [RegExp, (...g: string[]) => string][] = [
  // Log da consolidação
  [/^Coleta aberta nas unidades\. Caixa de entrada fechada\.$/, () => 'Collection open at the units. Inbox closed.'],
  [/^Consolidação habilitada: caixa de entrada aberta para manifestos e pacotes\.$/, () => 'Consolidation enabled: inbox open for manifests and packages.'],
  [/^Manifesto ilegível de (.+): corrompido em trânsito\.$/, (u) => `Unreadable manifest from ${u}: corrupted in transit.`],
  [/^Manifesto de operação ou unidade desconhecida \((.*)\)\.$/, (u) => `Manifest from unknown operation or unit (${u}).`],
  [/^Manifesto de (.+) com assinatura inválida\.$/, (u) => `Manifest from ${u} with invalid signature.`],
  [/^Manifesto repetido de (.+) descartado\.$/, (u) => `Repeated manifest from ${u} discarded.`],
  [/^Manifesto divergente de (.+)\.$/, (u) => `Diverging manifest from ${u}.`],
  [/^Manifesto de (.+): (\d+) pacotes, (\d+) registros\.$/, (u, p, r) => `Manifest from ${u}: ${p} packages, ${r} records.`],
  [/^Pacote ilegível de (.+): corrompido em trânsito\.$/, (u) => `Unreadable package from ${u}: corrupted in transit.`],
  [/^Pacote de operação ou unidade desconhecida \((.*)\)\.$/, (u) => `Package from unknown operation or unit (${u}).`],
  [/^Lote (\d+) de (.+): checksum inválido\. NACK\.$/, (l, u) => `Batch ${l} from ${u}: invalid checksum. NACK.`],
  [/^Lote (\d+) de (.+): assinatura inválida\. NACK\.$/, (l, u) => `Batch ${l} from ${u}: invalid signature. NACK.`],
  [/^Lote (\d+) de (.+): reclassificação recusada \((.+)\)\. NACK\.$/, (l, u, p) => `Batch ${l} from ${u}: reclassification refused (${problemas(p)}). NACK.`],
  [/^Lote (\d+) de (.+) já contabilizado: duplicado descartado\.$/, (l, u) => `Batch ${l} from ${u} already counted: duplicate discarded.`],
  [/^Lote (\d+) de (.+) chegou antes do manifesto\.$/, (l, u) => `Batch ${l} from ${u} arrived before the manifest.`],
  [/^Lote (\d+) de (.+) fora do manifesto\.$/, (l, u) => `Batch ${l} from ${u} not in the manifest.`],
  [/^Lote (\d+)\/(\d+) de (.+) aceito \(\+(\d+) registros\)\. ACK\.$/, (l, n, u, r) => `Batch ${l}/${n} from ${u} accepted (+${r} records). ACK.`],
  [/^(.+) NÃO bate com o manifesto: (.+)\.$/, (u, p) => `${u} does NOT match the manifest: ${problemas(p)}.`],
  [/^(.+) validada: (\d+) registros batem com o manifesto\.$/, (u, r) => `${u} validated: ${r} records match the manifest.`],
  [/^Consolidação final: item (\d+) predomina\. (.*)$/, (i, d) => `Final consolidation: item ${i} prevails. ${traduzirDetalhe(d)}`],

  // Recusas de comando
  [
    /^'(.+)' recusado: o sistema de coleta está na fase '(.+)' \(permitido em: (.+)\)\.$/,
    (a, f, p) => `'${acao(a)}' refused: the collection system is in phase '${fase(f)}' (allowed in: ${fases(p)}).`,
  ],
  [
    /^'(.+)' recusado: a consolidação está na fase '(.+)' \(permitido em: (.+)\)\.$/,
    (a, f, p) => `'${acao(a)}' refused: consolidation is in phase '${fase(f)}' (allowed in: ${fases(p)}).`,
  ],
  [/^'habilitar consolidação' recusado: a coleta ainda está aberta \(faltam (\d+) s\)\.$/, (s) => `'enable consolidation' refused: collection is still open (${s} s left).`],
  [/^'configurar' recusado: a rede está na fase '(.+)'\.$/, (f) => `'configure' refused: the network is in phase '${fase(f)}'.`],
  [/^Agentes de IA ligados, mas nenhuma chave da OpenAI foi cadastrada\.$/, () => 'AI agents on, but no OpenAI key has been registered.'],
  [/^Agentes de IA ligados, mas nenhum modelo está ativo\.$/, () => 'AI agents on, but no model is active.'],
  [/^Registro rejeitado: o terminal está travado\.$/, () => 'Record rejected: the terminal is locked.'],
  [/^Reenvio recusado: a distribuição ainda está em andamento\.$/, () => 'Resend refused: distribution is still in progress.'],
  [/^Reenvio recusado: nenhuma unidade com falha\.$/, () => 'Resend refused: no unit has failed.'],
  [/^informe a escala$/, () => 'provide the scale'],
  [/^unidade (\d+) não existe$/, (u) => `unit ${u} does not exist`],
  [/^extrato ainda não gerado$/, () => 'statement not generated yet'],
  [/^modelo (.+) fora do catálogo$/, (m) => `model ${m} not in the catalog`],
  [/^Chave salva, mas a verificação falhou: (.*)$/, (e) => `Key saved, but verification failed: ${traduzirMensagem(e)}`],
  [/^nenhuma chave da OpenAI cadastrada$/, () => 'no OpenAI key registered'],
  [/^OpenAI inacessível: (.*)$/, (e) => `OpenAI unreachable: ${e}`],
  [/^OpenAI recusou a chave \(HTTP (\d+)\)$/, (s) => `OpenAI refused the key (HTTP ${s})`],

  // Validação da configuração
  [/^(?:Value error, )?participantes_min maior que participantes_max$/, () => 'participantes_min greater than participantes_max'],
  [/^(?:Value error, )?cobertura_min maior que cobertura_max$/, () => 'cobertura_min greater than cobertura_max'],
  [/^(?:Value error, )?prob_vazio \+ prob_invalido deve ser menor que 1$/, () => 'prob_vazio + prob_invalido must be less than 1'],
  [/^(?:Value error, )?intervalo de registro maior que a duração$/, () => 'record interval longer than the duration'],
  [/^(?:Value error, )?o catálogo deve ter um item por número de itens$/, () => 'the catalog must have one item per number of items'],
  [/^(?:Value error, )?ids de unidade repetidos$/, () => 'repeated unit ids'],
  [/^(?:Value error, )?a soma das taxas de falha não pode passar de 1$/, () => 'the sum of the failure rates cannot exceed 1'],
  [/^(?:Value error, )?atraso extremo mínimo maior que o máximo$/, () => 'minimum extreme delay greater than the maximum'],
  [/^(?:Value error, )?duração offline mínima maior que a máxima$/, () => 'minimum offline duration greater than the maximum'],

  // Avisos do próprio painel
  [/^Chave da OpenAI salva e verificada\.$/, () => 'OpenAI key saved and verified.'],
  [/^Chave da OpenAI removida\.$/, () => 'OpenAI key removed.'],
  [/^Modelos verificados na conta da OpenAI\.$/, () => 'Models verified on the OpenAI account.'],
]

/**
 * Traduz uma mensagem pronta (log, recusa, aviso). Mensagens com prefixo de
 * serviço ("Coleta: ...") e listas separadas por "; " são traduzidas parte a parte.
 * O que não for reconhecido aparece como veio.
 */
export function traduzirMensagem(texto: string): string {
  if (idiomaAtual() !== 'en') return texto
  const prefixo = texto.match(/^(Coleta|Transporte|Consolidação): ([\s\S]*)$/)
  if (prefixo) return `${SERVICOS_EN[prefixo[1]]}: ${traduzirMensagem(prefixo[2])}`
  for (const [padrao, montar] of MENSAGENS) {
    const m = texto.match(padrao)
    if (m) return montar(...m.slice(1))
  }
  const detalhe = traduzirDetalhe(texto)
  if (detalhe !== texto) return detalhe
  if (texto.includes('; ')) return texto.split('; ').map(traduzirMensagem).join('; ')
  return texto
}
