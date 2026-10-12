/**
 * Idioma da tela. O Prisma é em português; o botão PT/EN troca todos os textos
 * visíveis para o inglês. Código e serviço continuam em português: os motivos e
 * as recusas que chegam prontos do serviço são traduzidos aqui, na exibição.
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
    { name: 'prisma-idioma', version: 1 },
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

/** Escolhe o texto do idioma atual e re-renderiza o componente quando o idioma muda. */
export function useT(): (pt: string, en: string) => string {
  const idioma = useIdioma((s) => s.idioma)
  return (pt, en) => (idioma === 'en' ? en : pt)
}

export function locale(): string {
  return idiomaAtual() === 'en' ? 'en-US' : 'pt-BR'
}

// Nomes de item padrão do Nexo: aparecem no idioma da tela; nomes editados ficam como foram escritos.
const NOMES_ITENS_PT = ['Telemetria', 'Inventário', 'Logística', 'Manutenção', 'Qualidade', 'Suprimentos', 'Atendimento', 'Faturamento']
const NOMES_ITENS_EN = ['Telemetry', 'Inventory', 'Logistics', 'Maintenance', 'Quality', 'Supplies', 'Customer service', 'Billing']
const PT_PARA_EN = new Map(NOMES_ITENS_PT.map((n, i) => [n, NOMES_ITENS_EN[i]]))
const EN_PARA_PT = new Map(NOMES_ITENS_EN.map((n, i) => [n, NOMES_ITENS_PT[i]]))

export function nomeItem(nome: string, idioma: Idioma = idiomaAtual()): string {
  return (idioma === 'en' ? PT_PARA_EN : EN_PARA_PT).get(nome) ?? nome
}

const MENSAGENS: [RegExp, string][] = [
  // Motivos de um pacote seguir intacto
  [/^pacote ilegível$/, 'unreadable package'],
  [/^mesma saída da primeira passagem$/, 'same output as the first pass'],
  [/^verificação de total falhou$/, 'total check failed'],
  [/^nada a reclassificar$/, 'nothing to reclassify'],
  [/^já reclassificado$/, 'already reclassified'],
  [/^Prisma desligado$/, 'Prisma off'],
  [/^unidade fora do escopo$/, 'unit out of scope'],
  [/^item alvo fora do catálogo$/, 'target item not in the catalog'],
  // Recusas do serviço
  [/^selecione o item alvo antes de ativar$/, 'select the target item before activating'],
]

/** Traduz um motivo ou recusa vindo do serviço; o que não for reconhecido aparece como veio. */
export function traduzirMensagem(texto: string): string {
  if (idiomaAtual() !== 'en') return texto
  if (texto.includes('; ')) return texto.split('; ').map(traduzirMensagem).join('; ')
  for (const [padrao, en] of MENSAGENS) if (padrao.test(texto)) return en
  return texto
}
