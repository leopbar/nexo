/**
 * Mapa de um território fictício gerado a partir da seed: contorno, regiões, rios,
 * polo central e unidades ligadas por tubulações curvas.
 *
 * O comprimento de cada tubulação define a latência base da unidade: a mais
 * próxima fica com a latência mínima e a mais distante com a máxima.
 */
import { CORES_UNIDADES } from './cores'
import { Rng } from './rng'

export interface Ponto {
  x: number
  y: number
}

export interface UnidadeTopo {
  id: number
  nome: string
  cor: string
  pos: Ponto
  controle: Ponto
  /** Pontos da tubulação, da unidade (índice 0) até a central. */
  amostras: Ponto[]
  acumulado: number[]
  comprimento: number
  latenciaBase: number
  lado: 'esquerda' | 'direita'
}

export interface Topologia {
  largura: number
  altura: number
  nomeTerritorio: string
  central: { nome: string; pos: Ponto }
  contorno: Ponto[]
  regioes: Ponto[][]
  rios: Ponto[][]
  vilas: Ponto[]
  unidades: UnidadeTopo[]
}

export const LARGURA = 1600
export const ALTURA = 1000

const TERRITORIOS = ['Território de Valdória', 'Planalto de Ondária', 'Vale de Calvéria', 'Território de Itanor', 'Costa de Lumíria']
const CENTRAIS = ['Solária', 'Miravale', 'Castelônia', 'Brisamar', 'Alvorada']

export const NOMES_CIDADES = [
  'Aurora do Sul', 'Vale Sereno', 'Porto Alcião', 'Serra Vermelha', 'Campo Lindo', 'Rio das Garças',
  'Nova Ístria', 'Monte Azul', 'Baía Clara', 'Pedra Alta', 'Lagoa Funda', 'Vila Cedro',
  'Altamira', 'Ventania', 'Ponta Sul', 'Barra Nova', 'Cerro Largo', 'Três Pinhos',
  'Água Quente', 'Lírio do Norte', 'Santa Brisa', 'Pouso Real', 'Arroio Fundo', 'Mata Velha',
]

const SEGMENTOS_TUBO = 64

function dist(a: Ponto, b: Ponto): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function dentro(p: Ponto, poligono: Ponto[]): boolean {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i]
    const b = poligono[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}

function distSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function distBorda(p: Ponto, poligono: Ponto[]): number {
  let menor = Infinity
  for (let i = 0; i < poligono.length; i++) menor = Math.min(menor, distSegmento(p, poligono[i], poligono[(i + 1) % poligono.length]))
  return menor
}

function bezier(a: Ponto, c: Ponto, b: Ponto, t: number): Ponto {
  const u = 1 - t
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }
}

function gerarContorno(rng: Rng): Ponto[] {
  const harmonicos = [2, 3, 4, 5, 6, 7, 9, 11, 14].map((k) => ({
    k,
    a: rng.entre(0.012, 0.06) * (k <= 3 ? 1.6 : k >= 9 ? 0.45 : 1),
    f: rng.entre(0, Math.PI * 2),
  }))
  const brutos: Ponto[] = []
  const n = 240
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2
    const r = 1 + harmonicos.reduce((s, h) => s + h.a * Math.sin(h.k * th + h.f), 0)
    brutos.push({ x: Math.cos(th) * r * 1.5, y: Math.sin(th) * r })
  }
  const xs = brutos.map((p) => p.x)
  const ys = brutos.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const escala = Math.min((LARGURA - 170) / (x1 - x0), (ALTURA - 110) / (y1 - y0))
  const ox = (LARGURA - (x1 - x0) * escala) / 2
  const oy = (ALTURA - (y1 - y0) * escala) / 2
  return brutos.map((p) => ({ x: ox + (p.x - x0) * escala, y: oy + (p.y - y0) * escala }))
}

function caminhar(rng: Rng, inicio: Ponto, angulo: number, contorno: Ponto[], passo: number, curvatura: number, maxPassos = 200): Ponto[] {
  const pontos = [inicio]
  let p = inicio
  let a = angulo
  let deriva = 0
  for (let i = 0; i < maxPassos; i++) {
    deriva = deriva * 0.8 + rng.entre(-curvatura, curvatura)
    a += deriva
    const q = { x: p.x + Math.cos(a) * passo, y: p.y + Math.sin(a) * passo }
    if (!dentro(q, contorno)) {
      pontos.push(q)
      break
    }
    pontos.push(q)
    p = q
  }
  return pontos
}

function amostrarTubo(pos: Ponto, controle: Ponto, central: Ponto) {
  const amostras: Ponto[] = []
  const acumulado: number[] = [0]
  for (let i = 0; i <= SEGMENTOS_TUBO; i++) amostras.push(bezier(pos, controle, central, i / SEGMENTOS_TUBO))
  for (let i = 1; i < amostras.length; i++) acumulado.push(acumulado[i - 1] + dist(amostras[i - 1], amostras[i]))
  return { amostras, acumulado, comprimento: acumulado[acumulado.length - 1] }
}

export function gerarTopologia(semente: number, nomes: string[], latenciaMin: number, latenciaMax: number): Topologia {
  const rng = new Rng(semente)
  const contorno = gerarContorno(rng)
  const centro = { x: LARGURA / 2, y: ALTURA / 2 }
  let central = { x: centro.x + rng.entre(-60, 60), y: centro.y + rng.entre(-40, 40) }
  if (!dentro(central, contorno)) central = centro

  const n = nomes.length
  const alcance = Math.max(...contorno.map((p) => dist(p, central)))
  const perto = 150
  const longe = Math.min(alcance * 0.8, 640)
  const alvos = Array.from({ length: n }, (_, i) => (n === 1 ? perto : perto + ((longe - perto) * i) / (n - 1)))
  for (let i = alvos.length - 1; i > 0; i--) {
    const j = Math.floor(rng.proximo() * (i + 1))
    ;[alvos[i], alvos[j]] = [alvos[j], alvos[i]]
  }

  const colocadas: { pos: Ponto; controle: Ponto; amostras: Ponto[] }[] = []
  for (let i = 0; i < n; i++) {
    let aceita: (typeof colocadas)[number] | null = null
    let reserva: (typeof colocadas)[number] | null = null
    for (let tentativa = 0; tentativa < 900 && !aceita; tentativa++) {
      const folga = tentativa < 300 ? 1 : tentativa < 600 ? 0.85 : 0.7
      const th = rng.entre(0, Math.PI * 2)
      const d = alvos[i] * rng.entre(1 - 0.1 / folga, 1 + 0.1 / folga)
      const pos = { x: central.x + Math.cos(th) * d, y: central.y + Math.sin(th) * d }
      if (!dentro(pos, contorno) || distBorda(pos, contorno) < 50 * folga) continue
      if (pos.x < 110 || pos.x > LARGURA - 110 || pos.y < 70 || pos.y > ALTURA - 70) continue
      const meio = { x: (pos.x + central.x) / 2, y: (pos.y + central.y) / 2 }
      const comp = dist(pos, central)
      const curva = rng.entre(-0.22, 0.22)
      const controle = { x: meio.x - ((pos.y - central.y) / comp) * comp * curva, y: meio.y + ((pos.x - central.x) / comp) * comp * curva }
      const { amostras } = amostrarTubo(pos, controle, central)
      const local = { pos, controle, amostras }
      reserva ??= local
      if (colocadas.some((c) => dist(c.pos, pos) < 165 * folga)) continue
      const interior = amostras.slice(2, -3)
      if (colocadas.some((c) => interior.some((a) => dist(a, c.pos) < 46 * folga))) continue
      if (colocadas.some((c) => c.amostras.slice(2, -3).some((a) => dist(a, pos) < 46 * folga))) continue
      aceita = local
    }
    colocadas.push(aceita ?? reserva ?? { pos: central, controle: central, amostras: [central, central] })
  }

  const tubos = colocadas.map((c) => amostrarTubo(c.pos, c.controle, central))
  const comprimentos = tubos.map((t) => t.comprimento)
  const [cMin, cMax] = [Math.min(...comprimentos), Math.max(...comprimentos)]
  const unidades: UnidadeTopo[] = colocadas.map((c, i) => {
    const tubo = tubos[i]
    const fracao = cMax > cMin ? (tubo.comprimento - cMin) / (cMax - cMin) : 0
    return {
      id: i + 1,
      nome: nomes[i] || `Unidade ${i + 1}`,
      cor: CORES_UNIDADES[i % CORES_UNIDADES.length],
      pos: c.pos,
      controle: c.controle,
      ...tubo,
      latenciaBase: Math.round((latenciaMin + fracao * (latenciaMax - latenciaMin)) * 10) / 10,
      lado: c.pos.x < central.x ? 'esquerda' : 'direita',
    }
  })

  const regioes: Ponto[][] = []
  const juncao = { x: central.x + rng.entre(-140, 140), y: central.y + rng.entre(-110, 110) }
  const numRegioes = rng.inteiro(4, 6)
  const giro = rng.entre(0, Math.PI * 2)
  for (let i = 0; i < numRegioes; i++) {
    regioes.push(caminhar(rng, juncao, giro + (i / numRegioes) * Math.PI * 2 + rng.entre(-0.3, 0.3), contorno, 16, 0.12))
  }

  const rios: Ponto[][] = []
  for (let i = 0, tentativas = 0; i < 3 && tentativas < 200; tentativas++) {
    const inicio = { x: rng.entre(200, LARGURA - 200), y: rng.entre(150, ALTURA - 150) }
    if (!dentro(inicio, contorno) || distBorda(inicio, contorno) < 140 || dist(inicio, central) < 120) continue
    const angulo = Math.atan2(inicio.y - central.y, inicio.x - central.x) + rng.entre(-0.8, 0.8)
    const rio = caminhar(rng, inicio, angulo, contorno, 12, 0.18, 260)
    if (rio.length > 12) {
      rios.push(rio)
      i++
    }
  }

  const vilas: Ponto[] = []
  for (let tentativas = 0; vilas.length < 34 && tentativas < 2000; tentativas++) {
    const p = { x: rng.entre(80, LARGURA - 80), y: rng.entre(60, ALTURA - 60) }
    if (dentro(p, contorno) && distBorda(p, contorno) > 20 && unidades.every((f) => dist(f.pos, p) > 40) && dist(p, central) > 50) vilas.push(p)
  }

  return {
    largura: LARGURA,
    altura: ALTURA,
    nomeTerritorio: TERRITORIOS[semente % TERRITORIOS.length],
    central: { nome: CENTRAIS[Math.floor(semente / 7) % CENTRAIS.length], pos: central },
    contorno,
    regioes,
    rios,
    vilas,
    unidades,
  }
}

/** Ponto a uma fração p (0 = unidade, 1 = central) do comprimento da tubulação, com velocidade constante. */
export function pontoNoTubo(f: UnidadeTopo, p: number): Ponto & { angulo: number } {
  const alvo = Math.max(0, Math.min(1, p)) * f.comprimento
  const acc = f.acumulado
  let lo = 0
  let hi = acc.length - 1
  while (lo < hi - 1) {
    const meio = (lo + hi) >> 1
    if (acc[meio] <= alvo) lo = meio
    else hi = meio
  }
  const trecho = acc[hi] - acc[lo] || 1
  const t = (alvo - acc[lo]) / trecho
  const a = f.amostras[lo]
  const b = f.amostras[hi]
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angulo: Math.atan2(b.y - a.y, b.x - a.x) }
}
